/**
 * Permanent removal of one Session from a DSH home directory.
 *
 * A Session owns three artefacts, and all three have to go or the GUI keeps
 * showing a ghost row:
 *
 *   <dshHome>/sessions/<workspace-slug>/<sessionId>/session.v4.jsonl.zstd
 *   <dshHome>/storages/session_projcache/sessions/<sessionId>.json
 *   <dshHome>/storages/workspace.json  (sessionIds / pinned / archived lists)
 *
 * Everything here is pure filesystem work with no DSH service involved, so it is
 * unit-testable against a throwaway directory (see test/delete-session.test.mjs).
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Session ids are directory names; keep them to a safe, separator-free shape. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{6,79}$/

const SESSIONS_DIRNAME = 'sessions'
const PROJECTION_CACHE = ['storages', 'session_projcache', 'sessions']
const WORKSPACE_REGISTRY = ['storages', 'workspace.json']

/** Write errors that mean "a handle still has this file open" rather than "gone". */
const LOCKED_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'])

/**
 * Resolve the DSH home the running app uses.
 * @param env - environment map; `DSH_HOME` wins, `~/.dsh` is the fallback.
 * @returns the absolute home directory.
 */
export function resolveDshHome(env = process.env) {
  const fromEnv = env?.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return path.resolve(fromEnv)
  return path.join(os.homedir(), '.dsh')
}

/**
 * Reject anything that could escape the sessions directory when joined.
 * @param value - candidate Session id.
 * @returns true when the id is safe to use as a path segment.
 */
export function isValidSessionId(value) {
  return typeof value === 'string' && value !== '.' && value !== '..' && SESSION_ID_PATTERN.test(value)
}

/**
 * Find every `<dshHome>/sessions/<slug>/<sessionId>` directory.
 * @param dshHome - resolved DSH home.
 * @param sessionId - validated Session id.
 * @returns absolute directory paths that exist.
 */
async function findSessionDirs(dshHome, sessionId) {
  const root = path.resolve(dshHome, SESSIONS_DIRNAME)
  let slugs
  try {
    slugs = await fs.readdir(root)
  } catch {
    return []
  }
  const found = []
  for (const slug of slugs) {
    const candidate = path.resolve(root, slug, sessionId)
    // Defence in depth: never touch anything outside the sessions root.
    if (candidate !== path.join(root, slug, sessionId)) continue
    if (!candidate.startsWith(root + path.sep)) continue
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) found.push(candidate)
    } catch {
      /* not this slug's session */
    }
  }
  return found
}

/**
 * Drop one Session id from every list in the workspace registry.
 * @param file - absolute path of `storages/workspace.json`.
 * @param sessionId - id to forget.
 * @returns true when the registry existed and its content changed.
 */
async function forgetInWorkspaceRegistry(file, sessionId) {
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return false
  }
  let registry
  try {
    registry = JSON.parse(text)
  } catch {
    return false
  }
  const without = (list) => (Array.isArray(list) ? list.filter((id) => id !== sessionId) : list)
  let changed = false

  const global = registry?.global
  if (global !== undefined && global !== null) {
    for (const key of ['archivedSessionIds', 'pinnedSessionIds']) {
      if (Array.isArray(global[key])) {
        const next = without(global[key])
        if (next.length !== global[key].length) changed = true
        global[key] = next
      }
    }
  }
  const workspaces = registry?.tables?.workspaces
  if (workspaces !== undefined && workspaces !== null) {
    for (const workspace of Object.values(workspaces)) {
      if (workspace !== null && typeof workspace === 'object' && Array.isArray(workspace.sessionIds)) {
        const next = without(workspace.sessionIds)
        if (next.length !== workspace.sessionIds.length) changed = true
        workspace.sessionIds = next
      }
    }
  }
  if (!changed) return true

  // Atomic replace: a truncated registry would cost every Workspace its grouping.
  const temporary = `${file}.${process.pid}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
  return true
}

/**
 * Permanently delete one Session's stored data.
 * @param options - `sessionId` plus an optional `dshHome` override.
 * @returns a JSON-serializable result: `{ ok: true, ... }` or `{ ok: false, error }`.
 */
export async function deleteSessionData(options = {}) {
  const { sessionId, dshHome = resolveDshHome() } = options
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'invalid-session-id' }

  const dirs = await findSessionDirs(dshHome, sessionId)
  const errors = []
  let removedDirs = 0
  for (const dir of dirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true })
      removedDirs += 1
    } catch (error) {
      errors.push({ path: dir, code: codeOf(error) })
    }
  }

  const cacheFile = path.join(dshHome, ...PROJECTION_CACHE, `${sessionId}.json`)
  let cacheRemoved = false
  // `rm(..., { force: true })` also succeeds when nothing was there, so ask first:
  // otherwise an unknown Session would report a successful deletion.
  if (await exists(cacheFile)) {
    try {
      await fs.rm(cacheFile, { force: true })
      cacheRemoved = true
    } catch (error) {
      errors.push({ path: cacheFile, code: codeOf(error) })
    }
  }

  let registryUpdated = false
  try {
    registryUpdated = await forgetInWorkspaceRegistry(path.join(dshHome, ...WORKSPACE_REGISTRY), sessionId)
  } catch (error) {
    errors.push({ path: path.join(dshHome, ...WORKSPACE_REGISTRY), code: codeOf(error) })
  }

  const locked = errors.some((entry) => LOCKED_CODES.has(entry.code))
  if (removedDirs === 0 && !cacheRemoved) {
    return {
      ok: false,
      error: locked ? 'file-locked' : dirs.length === 0 ? 'not-found' : 'partial',
      errors,
    }
  }
  if (errors.length > 0) return { ok: false, error: locked ? 'file-locked' : 'partial', removedDirs, errors }
  return { ok: true, removedDirs, cacheRemoved, registryUpdated }
}

/**
 * Does this path exist at all?
 * @param target - absolute path.
 * @returns true when `stat` succeeds.
 */
async function exists(target) {
  try {
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

/**
 * Read a Node error code without trusting the shape of the thrown value.
 * @param error - thrown value.
 * @returns the POSIX-style code, or 'UNKNOWN'.
 */
function codeOf(error) {
  const code = error?.code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

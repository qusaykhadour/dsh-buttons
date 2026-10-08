/**
 * repair-registry — drop workspace-registry entries whose Session files are gone.
 *
 * Archiving hides a row; deleting afterwards removes the files. The running app
 * keeps its own copy of the registry in memory, so it can write a deleted id back
 * into `archivedSessionIds` (and, rarely, `sessionIds`) after the deletion. Those
 * ids then render as rows that cannot be opened.
 *
 * This script reconciles the file with the disk. Run it with DSH closed, from a
 * plain PowerShell:
 *
 *   node repair-registry.mjs            # show what would change
 *   node repair-registry.mjs --apply    # back up the file and rewrite it
 *
 * The registry is backed up next to itself before any write.
 */

import { readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDshHome } from './lib/delete-session.js'

/**
 * Every Session id that still has a directory on disk.
 * @param dshHome - the DSH home directory.
 * @returns a set of ids.
 */
async function idsOnDisk(dshHome) {
  const root = path.join(dshHome, 'sessions')
  const found = new Set()
  let slugs = []
  try {
    slugs = await readdir(root, { withFileTypes: true })
  } catch (err) {
    return found
  }
  for (const slug of slugs) {
    if (!slug.isDirectory()) continue
    const dir = path.join(root, slug.name)
    let entries = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (err) {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) found.add(entry.name)
    }
  }
  return found
}

/**
 * Reconcile the registry with the disk.
 * @param options - `dshHome` and `apply`.
 * @returns a summary of what changed (or would change).
 */
export async function repairRegistry(options = {}) {
  const dshHome = options.dshHome ?? resolveDshHome()
  const apply = options.apply === true
  const file = path.join(dshHome, 'storages', 'workspace.json')
  const raw = await readFile(file, 'utf8')
  const registry = JSON.parse(raw)
  const alive = await idsOnDisk(dshHome)

  const removed = { sessionIds: [], pinnedSessionIds: [], archivedSessionIds: [] }
  const keep = (id, bucket) => {
    if (alive.has(id)) return true
    removed[bucket].push(id)
    return false
  }

  const tables = registry.tables ?? {}
  for (const workspace of Object.values(tables.workspaces ?? {})) {
    if (Array.isArray(workspace.sessionIds)) {
      workspace.sessionIds = workspace.sessionIds.filter((id) => keep(id, 'sessionIds'))
    }
  }
  const global = registry.global ?? {}
  for (const bucket of ['pinnedSessionIds', 'archivedSessionIds']) {
    if (Array.isArray(global[bucket])) {
      global[bucket] = global[bucket].filter((id) => keep(id, bucket))
    }
  }

  const total = removed.sessionIds.length + removed.pinnedSessionIds.length + removed.archivedSessionIds.length
  if (total === 0 || !apply) return { file, applied: false, removed, total }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${file}.bak-${stamp}`
  await writeFile(backup, raw, 'utf8')
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(registry, null, 2), 'utf8')
  await rename(temp, file)
  return { file, backup, applied: true, removed, total }
}

/** CLI entry: print the reconciliation. */
async function main() {
  const apply = process.argv.includes('--apply')
  const result = await repairRegistry({ apply })
  const { removed } = result
  console.log(`registry: ${result.file}`)
  console.log(`  listed sessions with no files: ${removed.sessionIds.length}`)
  console.log(`  pinned with no files:          ${removed.pinnedSessionIds.length}`)
  console.log(`  archived with no files:        ${removed.archivedSessionIds.length}`)
  if (result.total === 0) {
    console.log('nothing to repair')
    return
  }
  if (!result.applied) {
    console.log(`would remove ${result.total} stale entries — re-run with --apply (DSH must be closed)`)
    return
  }
  console.log(`removed ${result.total} stale entries; backup at ${result.backup}`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

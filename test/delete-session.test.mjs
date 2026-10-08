/**
 * Fixture test for the deletion logic, on a throwaway DSH home.
 *
 *   node --test test/
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { deleteSessionData, isValidSessionId } from '../lib/delete-session.js'

const TARGET = 'session-11111111-2222-3333-4444-555555555555'
const KEEPER = 'session-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

/**
 * Build a DSH home with two sessions on disk plus a registry that lists both.
 * @returns the absolute fixture home.
 */
async function fixture() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-session-delete-'))
  const slug = path.join(home, 'sessions', '--C-Users-test-workspace--')
  await fs.mkdir(path.join(slug, TARGET), { recursive: true })
  await fs.writeFile(path.join(slug, TARGET, 'session.v4.jsonl.zstd'), 'log')
  await fs.mkdir(path.join(slug, KEEPER), { recursive: true })
  await fs.writeFile(path.join(slug, KEEPER, 'session.v4.jsonl.zstd'), 'log')
  // A second workspace slug holding the same id, to prove every copy goes.
  const other = path.join(home, 'sessions', '--C-Users-test-other--')
  await fs.mkdir(path.join(other, TARGET), { recursive: true })
  await fs.writeFile(path.join(other, TARGET, 'session.v4.jsonl.zstd'), 'log')

  const cache = path.join(home, 'storages', 'session_projcache', 'sessions')
  await fs.mkdir(cache, { recursive: true })
  await fs.writeFile(path.join(cache, `${TARGET}.json`), '{}')
  await fs.writeFile(path.join(cache, `${KEEPER}.json`), '{}')

  await fs.mkdir(path.join(home, 'storages'), { recursive: true })
  await fs.writeFile(
    path.join(home, 'storages', 'workspace.json'),
    JSON.stringify({
      global: { archivedSessionIds: [], pinnedSessionIds: [TARGET, KEEPER] },
      tables: { workspaces: { ws: { sessionIds: [KEEPER, TARGET] } } },
    }),
  )
  return home
}

test('removes the log directory (every slug), the cache and the registry entry', async () => {
  const home = await fixture()
  const result = await deleteSessionData({ sessionId: TARGET, dshHome: home })

  assert.equal(result.ok, true)
  assert.equal(result.removedDirs, 2)
  assert.equal(result.cacheRemoved, true)
  assert.equal(result.registryUpdated, true)

  const slug = path.join(home, 'sessions', '--C-Users-test-workspace--')
  await assert.rejects(fs.stat(path.join(slug, TARGET)))
  await assert.rejects(fs.stat(path.join(home, 'sessions', '--C-Users-test-other--', TARGET)))
  await assert.rejects(fs.stat(path.join(home, 'storages', 'session_projcache', 'sessions', `${TARGET}.json`)))

  // The other session and its cache survive untouched.
  assert.equal((await fs.stat(path.join(slug, KEEPER))).isDirectory(), true)
  assert.equal((await fs.stat(path.join(home, 'storages', 'session_projcache', 'sessions', `${KEEPER}.json`))).isFile(), true)

  const registry = JSON.parse(await fs.readFile(path.join(home, 'storages', 'workspace.json'), 'utf8'))
  assert.deepEqual(registry.global.pinnedSessionIds, [KEEPER])
  assert.deepEqual(registry.tables.workspaces.ws.sessionIds, [KEEPER])

  await fs.rm(home, { recursive: true, force: true })
})

test('reports not-found for an id with no files and leaves everything in place', async () => {
  const home = await fixture()
  const result = await deleteSessionData({ sessionId: 'session-99999999-9999-9999-9999-999999999999', dshHome: home })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'not-found')
  assert.equal((await fs.stat(path.join(home, 'sessions', '--C-Users-test-workspace--', TARGET))).isDirectory(), true)

  await fs.rm(home, { recursive: true, force: true })
})

test('refuses ids that could escape the sessions directory', async () => {
  const home = await fixture()
  for (const bad of ['../../evil', '..', '.', '', 'short', 'a/b', 'session-1;rm -rf /']) {
    assert.equal(isValidSessionId(bad), false, `expected rejection: ${JSON.stringify(bad)}`)
    const result = await deleteSessionData({ sessionId: bad, dshHome: home })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'invalid-session-id')
  }
  assert.equal((await fs.stat(path.join(home, 'sessions', '--C-Users-test-workspace--', TARGET))).isDirectory(), true)

  await fs.rm(home, { recursive: true, force: true })
})

test('accepts both id shapes the app has written (prefixed and bare uuid)', () => {
  assert.equal(isValidSessionId(TARGET), true)
  assert.equal(isValidSessionId('249c48bd-09e3-4307-8bfc-7db76847a0b2'), true)
})

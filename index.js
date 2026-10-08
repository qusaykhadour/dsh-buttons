/**
 * dsh-buttons — host half.
 *
 * DSH ships no Session deletion: the ACP agent advertises
 * `sessionCapabilities: { close, list, resume }` (no `delete`) and the workspace
 * controller only archives, pins and reorders — so the GUI cannot offer the
 * action. This plugin adds the missing host route:
 *
 *   POST /api/session.delete   body: { "sessionId": "session-…" }
 *     200 { ok: true,  removedDirs, cacheRemoved, registryUpdated }
 *     400 { ok: false, error: 'invalid-session-id' | 'bad-request' }
 *     404 { ok: false, error: 'not-found' }
 *     409 { ok: false, error: 'session-active' | 'file-locked' }
 *     500 { ok: false, error: 'failed', detail }
 *
 * The route is registered on the authenticated Connection like the built-in
 * `/api/session.export` route, so the browser half reaches it with a plain
 * same-origin fetch.
 */

import { deleteSessionData, isValidSessionId, resolveDshHome } from './lib/delete-session.js'

/** Loader row name; also the client bundle id. */
export const name = 'session-delete'

/** The route lives on Connection, so that service must be mounted first. */
export const inject = ['connection']

/** Absolute registration path; the browser addresses it document-relatively. */
export const ROUTE_PATH = '/api/session.delete'

/**
 * Register the deletion route.
 * @param ctx - host context carrying Connection.
 */
export function apply(ctx) {
  const connection = Reflect.get(ctx, 'connection')
  if (connection === undefined || connection === null || typeof connection.fetch?.register !== 'function') return
  ctx.effect(
    () =>
      connection.fetch.register({
        path: ROUTE_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleDelete(ctx, request),
      }),
    'session-delete: route',
  )
}

/**
 * Serve one deletion request.
 * @param ctx - host context.
 * @param request - buffered Fetch request holding `{ sessionId }`.
 * @returns the JSON response.
 */
async function handleDelete(ctx, request) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ ok: false, error: 'bad-request' }, 400)
  }
  const sessionId = body?.sessionId
  if (!isValidSessionId(sessionId)) return json({ ok: false, error: 'invalid-session-id' }, 400)
  if (isLiveSession(ctx, sessionId)) return json({ ok: false, error: 'session-active' }, 409)
  try {
    const result = await deleteSessionData({ sessionId, dshHome: resolveDshHome() })
    if (result.ok) return json(result, 200)
    const status = result.error === 'file-locked' || result.error === 'session-active' ? 409 : 404
    return json(result, status)
  } catch (error) {
    return json({ ok: false, error: 'failed', detail: String(error?.message ?? error) }, 500)
  }
}

/**
 * Refuse to delete a Session the host currently holds open.
 * @param ctx - host context.
 * @param sessionId - candidate id.
 * @returns true when a live-session registry knows the id.
 */
function isLiveSession(ctx, sessionId) {
  for (const serviceName of ['sessions', 'sessionRuntime', 'agents']) {
    let service
    try {
      service = ctx.get(serviceName)
    } catch {
      service = undefined
    }
    if (service === undefined || service === null) continue
    try {
      if (typeof service.has === 'function' && service.has(sessionId)) return true
      if (service.byId !== undefined && service.byId !== null && sessionId in service.byId) return true
    } catch {
      /* a service that refuses the probe is not evidence of a live Session */
    }
  }
  return false
}

/**
 * Build a JSON response.
 * @param payload - serializable body.
 * @param status - HTTP status.
 * @returns the Response.
 */
function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

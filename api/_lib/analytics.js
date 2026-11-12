/**
 * Analytics (stub). The analytics builder replaces this module; api/index.ts
 * already mounts it and calls recordPageEvent from the view route, so that
 * work never needs to edit api/index.ts.
 *
 * Contract the real module must keep:
 *   registerAnalyticsRoutes(app, deps)  mounts GET /api/v1/admin/analytics
 *                                        and POST /api/t (deps: { supabase,
 *                                        getSupabaseUid, isAdminUser })
 *   recordPageEvent(sb, req, fields)     never throws, never blocks long;
 *                                        does nothing if page_events is missing
 */

/** @param {any} _app @param {any} _deps */
export function registerAnalyticsRoutes(_app, _deps) {}

/** @param {any} _sb @param {any} _req @param {Record<string, unknown>} _fields */
export async function recordPageEvent(_sb, _req, _fields) {}

import type { VercelRequest, VercelResponse } from "@vercel/node";

// Public /api/debug/* dumps disabled. Empty 404, no headers/supabase/channel body.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(404).end();
}

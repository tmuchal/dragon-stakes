// POST /api/x/verify {"t": badge}: is this badge one this site signed, and still valid? Answers the handle it was signed
// for. Used by the host of a shared sky before it shows a guest's X mark. Nothing secret goes in or comes out.
import { enabled, open, bodyOf, json } from "../_lib/x.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false });
  if (!enabled()) return json(res, 200, { ok: false });
  const b = await bodyOf(req), v = open(b?.t, "badge");
  json(res, 200, v ? { ok: true, username: v.username } : { ok: false });
}

// POST /api/x/logout: forget the signed-in profile on this browser. (The access token was already revoked at sign-in.)
import { clearCookie, json, SESSION } from "../_lib/x.js";
export default function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false });
  clearCookie(res, SESSION); json(res, 200, { ok: true });
}

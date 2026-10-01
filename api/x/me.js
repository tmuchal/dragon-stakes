// GET /api/x/me: the signed-in X profile, from the signed HttpOnly cookie, checked here. Also a badge: a signed note,
// valid for 12 hours, that this handle signed in on this site. A player hands it to the host of a shared sky, and the
// host's device asks /api/x/verify whether it is genuine before showing that player's X mark.
import { enabled, cookies, open, seal, clearCookie, json, SESSION, BADGE_SECS } from "../_lib/x.js";
export default function handler(req, res) {
  if (!enabled()) return json(res, 200, { enabled: false, connected: false });
  const raw = cookies(req)[SESSION], s = open(raw, "session");
  if (!s) { if (raw) clearCookie(res, SESSION); return json(res, 200, { enabled: true, connected: false }); }   // expired or not ours
  const user = { id: s.id, username: s.username, name: s.name, profile_image_url: s.profile_image_url };
  json(res, 200, { enabled: true, connected: true, user, badge: seal({ id: s.id, username: s.username }, "badge", BADGE_SECS) });
}

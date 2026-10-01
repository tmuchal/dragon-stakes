// GET /api/x/callback: X sends the browser back here with a code. The state must match the one in our cookie; then the
// code is traded for an access token (server to server, with the client secret), the token reads the user's own profile
// once, and is revoked and dropped. What the browser keeps is a signed HttpOnly cookie with id, username, name and
// picture only. The game reads it back through /api/x/me; the address it lands on only says whether it worked.
import { enabled, clientId, clientSecret, cookies, query, open, same, seal, profileOf, setCookie, clearCookie, redirect, TOKEN, REVOKE, ME, FLOW, SESSION, SESSION_SECS } from "../_lib/x.js";

const basic = () => "Basic " + Buffer.from(`${encodeURIComponent(clientId())}:${encodeURIComponent(clientSecret())}`).toString("base64");

export default async function handler(req, res) {
  clearCookie(res, FLOW, "/api/x");                                 // a sign-in is tried once, whatever happens next
  if (!enabled()) return redirect(res, "/#x=err");
  const q = query(req), flow = open(cookies(req)[FLOW], "flow");
  if (q.get("error")) return redirect(res, q.get("error") === "access_denied" ? "/#x=no" : "/#x=err");   // the user said no, or X did
  const code = q.get("code"), state = q.get("state");
  if (!flow || !code || !state || !same(state, flow.s)) return redirect(res, "/#x=err");          // not the sign-in this browser started
  let token = "", user = null;
  try {
    const t = await fetch(TOKEN, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic() },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: flow.r, code_verifier: flow.v, client_id: clientId() }),
      signal: AbortSignal.timeout(8000),
    });
    token = t.ok ? String((await t.json())?.access_token || "") : "";
    if (token) {
      const m = await fetch(ME, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      user = m.ok ? profileOf((await m.json())?.data) : null;
    }
  } catch { user = null; }                                         // nothing about the failure is passed on
  // The token was only needed for that one profile read: revoke it at X (best effort, before answering) and keep nothing.
  if (token) await fetch(REVOKE, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic() }, body: new URLSearchParams({ token, token_type_hint: "access_token", client_id: clientId() }), signal: AbortSignal.timeout(4000) }).catch(() => {});
  token = "";
  if (!user) return redirect(res, "/#x=err");
  setCookie(res, SESSION, seal(user, "session", SESSION_SECS), SESSION_SECS);
  redirect(res, "/#x=ok");
}

// GET /api/x/start: begin Sign in with X. A fresh PKCE verifier and state go into a short-lived HttpOnly cookie
// (signed, so it cannot be swapped), and the browser is sent to X's consent page with only the challenge and state.
import { enabled, clientId, newVerifier, challengeOf, newState, seal, setCookie, redirect, redirectUri, AUTHORIZE, SCOPES, FLOW, FLOW_SECS } from "../_lib/x.js";

export default function handler(req, res) {
  if (!enabled()) return redirect(res, "/#x=err");                 // no keys: back to the game, which works as before
  const verifier = newVerifier(), state = newState(), back = redirectUri(req);
  setCookie(res, FLOW, seal({ v: verifier, s: state, r: back }, "flow", FLOW_SECS), FLOW_SECS, "/api/x");
  const q = new URLSearchParams({ response_type: "code", client_id: clientId(), redirect_uri: back, scope: SCOPES, state, code_challenge: challengeOf(verifier), code_challenge_method: "S256" });
  redirect(res, `${AUTHORIZE}?${q}`);
}

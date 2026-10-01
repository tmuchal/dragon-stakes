// The api/x functions under plain Node, with mock requests and responses and a mock fetch (nothing goes to X):
// start sends the browser to X with a correct PKCE challenge and a sealed state cookie; the callback refuses a wrong
// state and a tampered cookie, trades the code with the verifier, keeps only the profile and revokes the token; me reads
// the session back and refuses a tampered one; verify accepts only genuine badges; status is off without the keys.
//   node scripts/check-x-api.mjs
import { createHash } from "node:crypto";
const load = async n => (await import(`../api/x/${n}.js`)).default;
const [start, callback, status, me, verify, logout] = await Promise.all(["start", "callback", "status", "me", "verify", "logout"].map(load));
let bad = 0;
const line = (ok, name, note = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "  |  " + note : ""}`); };

// a response that records what the function did, with the few raw Node methods the functions use
const mockRes = () => { const h = {}; return { statusCode: 200, headers: h, body: "", setHeader(k, v) { h[k.toLowerCase()] = v; }, getHeader(k) { return h[k.toLowerCase()]; }, end(b = "") { this.body = String(b); this.done = true; } }; };
const mockReq = (url, { method = "GET", cookie = "", host = "dragon-stakes.vercel.app", body } = {}) => ({ method, url, headers: { host, "x-forwarded-proto": "https", cookie }, body });
const run = async (fn, req) => { const res = mockRes(); await fn(req, res); return res; };
const cookiesOf = res => Object.fromEntries([].concat(res.getHeader("set-cookie") || []).map(c => { const [kv, ...attrs] = c.split("; "); const i = kv.indexOf("="); return [kv.slice(0, i), { value: decodeURIComponent(kv.slice(i + 1)), attrs }]; }));
const asCookie = jar => Object.entries(jar).map(([k, v]) => `${k}=${encodeURIComponent(v.value)}`).join("; ");
const json = res => { try { return JSON.parse(res.body); } catch { return null; } };
const KEYS = { X_CLIENT_ID: "client-abc", X_CLIENT_SECRET: "secret-xyz", X_SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef" };
const setEnv = on => { for (const [k, v] of Object.entries(KEYS)) { if (on) process.env[k] = v; else delete process.env[k]; } delete process.env.X_REDIRECT_URI; };
// X, pretended: the token endpoint wants our verifier and the client secret; the profile endpoint wants the token.
const calls = [];
let expectVerifier = null;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url); const body = opt.body ? new URLSearchParams(String(opt.body)) : null; calls.push({ url, body: body ? Object.fromEntries(body) : null, auth: opt.headers?.authorization || "" });
  const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
  if (url === "https://api.x.com/2/oauth2/token") {
    const basic = "Basic " + Buffer.from(`${KEYS.X_CLIENT_ID}:${KEYS.X_CLIENT_SECRET}`).toString("base64");
    if (opt.headers?.authorization !== basic || body.get("code") !== "good-code" || body.get("code_verifier") !== expectVerifier || body.get("grant_type") !== "authorization_code") return reply(400, { error: "invalid_request" });
    return reply(200, { token_type: "bearer", access_token: "ACCESS-TOKEN-123", scope: "users.read tweet.read", expires_in: 7200 });
  }
  if (url.startsWith("https://api.x.com/2/users/me")) {
    if (opt.headers?.authorization !== "Bearer ACCESS-TOKEN-123") return reply(401, {});
    return reply(200, { data: { id: "1234567890", username: "Dragon_Rider", name: "Dragon <b>Rider</b>", verified: false, profile_image_url: "https://pbs.twimg.com/profile_images/1/a_normal.jpg", extra: "not passed on" } });
  }
  if (url === "https://api.x.com/2/oauth2/revoke") return reply(200, { revoked: true });
  return reply(404, {});
};

// 1. switched off: no keys
setEnv(false);
{
  const s = json(await run(status, mockReq("/api/x/status"))), m = json(await run(me, mockReq("/api/x/me"))), st = await run(start, mockReq("/api/x/start"));
  line(s?.enabled === false && m?.connected === false && st.statusCode === 302 && st.getHeader("location") === "/#x=err" && !st.getHeader("set-cookie"), "without the environment variables: status says disabled, me says not connected, start goes straight back to the game", `${JSON.stringify(s)} ${JSON.stringify(m)} start -> ${st.getHeader("location")}`);
  process.env.X_CLIENT_ID = KEYS.X_CLIENT_ID; process.env.X_CLIENT_SECRET = KEYS.X_CLIENT_SECRET; process.env.X_SESSION_SECRET = "too-short";
  line(json(await run(status, mockReq("/api/x/status")))?.enabled === false, "a session secret shorter than 32 characters counts as not set");
}
setEnv(true);
line(json(await run(status, mockReq("/api/x/status")))?.enabled === true, "with all three set: status says enabled");

// 2. start: PKCE challenge, state, scopes, and the sealed cookie
const s1 = await run(start, mockReq("/api/x/start")), loc = new URL(s1.getHeader("location")), jar = cookiesOf(s1), flow = jar.xflow;
const flowData = flow && JSON.parse(Buffer.from(flow.value.split(".")[0], "base64url").toString());
expectVerifier = flowData?.v;
const challenge = expectVerifier && createHash("sha256").update(expectVerifier).digest("base64url");
const q = loc.searchParams;
line(s1.statusCode === 302 && loc.origin + loc.pathname === "https://x.com/i/oauth2/authorize" && q.get("response_type") === "code" && q.get("client_id") === KEYS.X_CLIENT_ID && q.get("scope") === "users.read tweet.read" && q.get("code_challenge_method") === "S256" && q.get("redirect_uri") === "https://dragon-stakes.vercel.app/api/x/callback",
  "start redirects to X's authorize page, read-only scopes, S256, the callback on this host", loc.href.slice(0, 140) + "…");
line(!!expectVerifier && expectVerifier.length >= 43 && q.get("code_challenge") === challenge && q.get("state") === flowData.s && !loc.href.includes(expectVerifier), "the challenge is SHA-256 of the verifier kept in the cookie, the state matches it, and the verifier itself never goes to X", `verifier ${expectVerifier?.length} chars, challenge ${q.get("code_challenge")}`);
line(!!flow && ["Path=/api/x", "HttpOnly", "Secure", "SameSite=Lax"].every(a => flow.attrs.includes(a)) && flow.attrs.includes("Max-Age=600"), "the sign-in cookie is HttpOnly, Secure, SameSite=Lax, scoped to /api/x, 10 minutes", flow?.attrs.join("; "));
const s2 = await run(start, mockReq("/api/x/start")), q2 = new URL(s2.getHeader("location")).searchParams;
line(q2.get("state") !== q.get("state") && q2.get("code_challenge") !== q.get("code_challenge"), "every start makes a fresh state and verifier");
process.env.X_REDIRECT_URI = "https://example.test/api/x/callback";
line(new URL((await run(start, mockReq("/api/x/start"))).getHeader("location")).searchParams.get("redirect_uri") === "https://example.test/api/x/callback", "X_REDIRECT_URI, when set, is the redirect URI");
delete process.env.X_REDIRECT_URI;

// 3. callback: refusals first, then the good path
const cb = (query, cookie) => run(callback, mockReq(`/api/x/callback?${query}`, { cookie }));
calls.length = 0;
const wrong = await cb(`code=good-code&state=WRONG${q.get("state").slice(5)}`, asCookie(jar));
line(wrong.getHeader("location") === "/#x=err" && calls.length === 0 && !cookiesOf(wrong).xs, "callback with a wrong state: refused, X is never called, no session", `-> ${wrong.getHeader("location")}, ${calls.length} calls`);
const noCookie = await cb(`code=good-code&state=${q.get("state")}`, "");
line(noCookie.getHeader("location") === "/#x=err" && calls.length === 0, "callback without the sign-in cookie (another browser, or expired): refused");
const [body, sig] = flow.value.split("."), forged = Buffer.from(JSON.stringify({ ...flowData, s: "attacker-state" })).toString("base64url") + "." + sig;
const tampered = await cb(`code=good-code&state=attacker-state`, `xflow=${encodeURIComponent(forged)}`);
line(tampered.getHeader("location") === "/#x=err" && calls.length === 0, "callback with a tampered sign-in cookie (state swapped, old signature): refused");
const denied = await cb(`error=access_denied&state=${q.get("state")}`, asCookie(jar));
line(denied.getHeader("location") === "/#x=no" && calls.length === 0, "the user pressed Cancel at X: back to the game with #x=no");
const good = await cb(`code=good-code&state=${q.get("state")}`, asCookie(jar)), gj = cookiesOf(good), xs = gj.xs;
const tokenCall = calls.find(c => c.url.endsWith("/oauth2/token")), revoked = calls.find(c => c.url.endsWith("/oauth2/revoke"));
line(good.getHeader("location") === "/#x=ok" && !!xs && ["HttpOnly", "Secure", "SameSite=Lax", "Path=/"].every(a => xs.attrs.includes(a)) && gj.xflow?.attrs.includes("Max-Age=0"),
  "callback with the right state: back to the game with #x=ok, a signed HttpOnly session cookie, the sign-in cookie cleared", xs?.attrs.join("; "));
line(tokenCall?.body.code_verifier === expectVerifier && tokenCall?.body.redirect_uri === "https://dragon-stakes.vercel.app/api/x/callback" && revoked?.body.token === "ACCESS-TOKEN-123", "the code was traded with the verifier and the same redirect URI, and the access token was revoked after the profile read", `${calls.map(c => c.url.replace("https://api.x.com/2/", "")).join(", ")}`);
const session = JSON.parse(Buffer.from(xs.value.split(".")[0], "base64url").toString());
line(!JSON.stringify(session).includes("ACCESS-TOKEN") && !good.getHeader("location").includes("TOKEN") && Object.keys(session).sort().join(",") === "exp,id,k,name,profile_image_url,username" && session.name === "Dragon bRider/b",
  "the session holds only id, username, name, picture and expiry (no token anywhere, the name cleaned)", JSON.stringify(session));
expectVerifier = "something-else"; calls.length = 0;
const s3 = await run(start, mockReq("/api/x/start")), j3 = cookiesOf(s3), st3 = new URL(s3.getHeader("location")).searchParams.get("state");
const failTok = await cb(`code=good-code&state=${st3}`, asCookie(j3));
line(failTok.getHeader("location") === "/#x=err" && !cookiesOf(failTok).xs, "X refuses the code exchange: back to the game with #x=err, no session");

// 4. me, verify, logout
const meRes = json(await run(me, mockReq("/api/x/me", { cookie: `xs=${encodeURIComponent(xs.value)}` })));
line(meRes?.connected && meRes.user.username === "Dragon_Rider" && meRes.user.profile_image_url.startsWith("https://pbs.twimg.com/") && typeof meRes.badge === "string" && !("access_token" in meRes), "me reads the session back: the profile and a badge, no token", JSON.stringify(meRes.user));
const [sb, ss] = xs.value.split(".");
const tamperedSession = Buffer.from(JSON.stringify({ ...session, username: "elonmusk" })).toString("base64url") + "." + ss;
const flipped = sb + "." + (ss[0] === "A" ? "B" : "A") + ss.slice(1);
const meBad = await run(me, mockReq("/api/x/me", { cookie: `xs=${encodeURIComponent(tamperedSession)}` })), meFlip = json(await run(me, mockReq("/api/x/me", { cookie: `xs=${encodeURIComponent(flipped)}` })));
line(json(meBad)?.connected === false && cookiesOf(meBad).xs?.attrs.includes("Max-Age=0") && meFlip?.connected === false, "me with a tampered session (username changed, or signature altered): not connected, and the bad cookie is cleared");
const v = async t => json(await run(verify, mockReq("/api/x/verify", { method: "POST", body: { t } })));
const okB = await v(meRes.badge), badB = await v(meRes.badge.replace(/.$/, c => c === "A" ? "B" : "A")), sessAsBadge = await v(xs.value), flowAsBadge = await v(flow.value);
line(okB?.ok && okB.username === "Dragon_Rider" && !badB?.ok && !sessAsBadge?.ok && !flowAsBadge?.ok, "verify accepts a genuine badge and refuses a tampered one, and a session or sign-in cookie cannot pass as a badge", JSON.stringify({ okB, badB, sessAsBadge }));
const streamReq = Object.assign(mockReq("/api/x/verify", { method: "POST" }), { on(ev, fn) { if (ev === "data") setTimeout(() => fn(JSON.stringify({ t: meRes.badge })), 0); if (ev === "end") setTimeout(fn, 5); return this; } });
line(json(await run(verify, streamReq))?.ok === true, "verify also reads a body that arrives as a stream (no platform parsing)");
line((await run(verify, mockReq("/api/x/verify"))).statusCode === 405 && (await run(logout, mockReq("/api/x/logout"))).statusCode === 405, "verify and logout only answer POST");
const out = await run(logout, mockReq("/api/x/logout", { method: "POST" }));
line(json(out)?.ok && cookiesOf(out).xs?.attrs.includes("Max-Age=0"), "logout clears the session cookie");
process.env.X_SESSION_SECRET = "a-different-secret-that-is-long-enough-000000";
line(json(await run(me, mockReq("/api/x/me", { cookie: `xs=${encodeURIComponent(xs.value)}` })))?.connected === false && !(await v(meRes.badge))?.ok, "a new X_SESSION_SECRET signs everyone out and voids old badges");
console.log(bad ? `\n${bad} check(s) failed` : "\nall api/x checks passed");
process.exit(bad ? 1 : 0);

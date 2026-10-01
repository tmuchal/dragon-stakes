// Shared by the api/x functions: Sign in with X (OAuth 2.0, Authorization Code with PKCE), read-only.
// Vercel does not turn files under a folder starting with "_" into functions, so this file is only imported.
// Plain Node: only node:crypto and the global fetch. The functions use the raw request and response (statusCode,
// setHeader, end), so they run the same on Vercel and under the local check with mock objects.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTHORIZE = "https://x.com/i/oauth2/authorize";
export const TOKEN = "https://api.x.com/2/oauth2/token";
export const REVOKE = "https://api.x.com/2/oauth2/revoke";
export const ME = "https://api.x.com/2/users/me?user.fields=profile_image_url,verified";
export const SCOPES = "users.read tweet.read";                      // reading the signed-in user's own profile; nothing can be posted
export const FLOW = "xflow", SESSION = "xs";                        // cookie names: the sign-in in progress, and the signed-in profile
export const FLOW_SECS = 600, SESSION_SECS = 30 * 24 * 3600, BADGE_SECS = 12 * 3600;

const env = k => (process.env[k] || "").trim();
// Switched on only when all three are set. A session secret shorter than 32 characters is treated as not set.
export const enabled = () => !!(env("X_CLIENT_ID") && env("X_CLIENT_SECRET") && env("X_SESSION_SECRET").length >= 32);
export const clientId = () => env("X_CLIENT_ID");
export const clientSecret = () => env("X_CLIENT_SECRET");

export const b64u = buf => Buffer.from(buf).toString("base64url");
export const newVerifier = () => b64u(randomBytes(32));            // 43 characters, inside the 43 to 128 that PKCE allows
export const challengeOf = verifier => b64u(createHash("sha256").update(verifier).digest());
export const newState = () => b64u(randomBytes(16));

// A signed note: base64url(JSON) + "." + HMAC-SHA256 of it under X_SESSION_SECRET. kind keeps one sort of note from
// being used as another (a badge shown to other players can never be a session cookie). exp is in seconds.
const mac = body => createHmac("sha256", env("X_SESSION_SECRET")).update(body).digest("base64url");
export function seal(obj, kind, secs) {
  const body = b64u(JSON.stringify({ ...obj, k: kind, exp: Math.floor(Date.now() / 1000) + secs }));
  return `${body}.${mac(body)}`;
}
export function open(token, kind) {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split("."); if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const want = Buffer.from(mac(parts[0])), got = Buffer.from(parts[1]);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let v; try { v = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return null; }
  if (!v || typeof v !== "object" || v.k !== kind || !(v.exp > Date.now() / 1000)) return null;
  return v;
}
export const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// Only these fields of the profile ever leave the server, each checked.
export function profileOf(d) {
  if (!d || typeof d !== "object") return null;
  const username = typeof d.username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(d.username) ? d.username : "";
  const id = typeof d.id === "string" && /^\d{1,25}$/.test(d.id) ? d.id : "";
  if (!username || !id) return null;
  const name = typeof d.name === "string" ? d.name.replace(/[\u0000-\u001f<>]/g, "").slice(0, 50) : "";
  const pic = typeof d.profile_image_url === "string" && /^https:\/\/pbs\.twimg\.com\/[\w./-]+$/.test(d.profile_image_url) ? d.profile_image_url : "";
  return { id, username, name, profile_image_url: pic };
}

// ---------- request and response, without a framework ----------
export function cookies(req) {
  const out = {};
  for (const part of String(req.headers?.cookie || "").split(";")) {
    const i = part.indexOf("="); if (i < 0) continue;
    const k = part.slice(0, i).trim(); if (k && !(k in out)) { try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* a cookie that is not ours */ } }
  }
  return out;
}
export const query = req => new URL(req.url || "/", "http://x").searchParams;
// HttpOnly: the page's own scripts cannot read it. Secure: https only (browsers also allow it on http://localhost).
// SameSite=Lax: it is still sent when X sends the browser back to the callback, which is a top-level GET.
export function setCookie(res, name, value, maxAge, path = "/") {
  const c = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
  const had = res.getHeader?.("Set-Cookie"); res.setHeader("Set-Cookie", had ? [].concat(had, c) : [c]);
}
export const clearCookie = (res, name, path = "/") => setCookie(res, name, "", 0, path);
export function redirect(res, to) { res.statusCode = 302; res.setHeader("Location", to); res.setHeader("Cache-Control", "no-store"); res.end(); }
export function json(res, code, obj) { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(obj)); }
// Where X sends the browser back to. It has to match the callback URL registered with the app exactly.
export function redirectUri(req) {
  if (env("X_REDIRECT_URI")) return env("X_REDIRECT_URI");
  const h = req.headers || {}, host = String(h["x-forwarded-host"] || h.host || "").split(",")[0].trim();
  const proto = String(h["x-forwarded-proto"] || "https").split(",")[0].trim() === "http" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https";
  return `${proto}://${host}/api/x/callback`;
}
// A small JSON body, whether or not the platform already parsed it.
export async function bodyOf(req, limit = 4096) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw && typeof req.on === "function") {
    raw = await new Promise((resolve, reject) => {
      let s = ""; req.on("data", c => { s += c; if (s.length > limit) { reject(new Error("too big")); req.destroy?.(); } }); req.on("end", () => resolve(s)); req.on("error", reject);
    }).catch(() => "");
  }
  if (raw.length > limit) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

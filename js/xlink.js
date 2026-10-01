// X (Twitter): sharing, a typed handle, and the optional "Connect X" sign-in. Nothing in the game depends on any of it:
// sharing is a plain link to X's post page (no key, no script from X), a handle is just text the player typed, and the
// sign-in only exists when the site's api/x functions answer and say they have keys. Any failure reads as "not there".

export const SITE_URL = "https://dragon-stakes.vercel.app/";
export const PROJECT = "RareFriendsNFT";                            // the project's account, named once in every post
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;                              // X's own rule for a username

// A handle as typed: one leading @ is fine, anything that is not a valid X username is no handle at all.
export function cleanHandle(s) {
  const v = typeof s === "string" ? s.trim().replace(/^@/, "") : "";
  return HANDLE.test(v) ? v : "";
}
// Where shared posts point: the page itself when it is served over https (production or a preview), the real game otherwise (a local copy).
export const siteUrl = () => /^https:$/.test(location.protocol) ? location.origin + location.pathname : SITE_URL;
// X's post page with the words filled in; X adds the link after them. It opens in a new tab from a plain link, so no popup can be blocked.
export const intentUrl = (text, url) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

// ---------- the sign-in, through this site's own api/x functions ----------
// Every call has a short time limit and every failure means "not connected", so a missing api/ (a local static server,
// a deploy without keys, an offline phone) looks exactly like a game without the feature.
async function ask(path, opt = {}) {
  try {
    const r = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout?.(5000), ...opt });
    if (!r.ok || !/json/.test(r.headers.get("content-type") || "")) return null;
    return await r.json();
  } catch { return null; }
}
// A copy served over plain http (the local static server) has no api/ at all, so it is not asked and the console stays
// clean; add ?xapi to try the functions locally (for example under "vercel dev").
export async function xStatus() {
  if (location.protocol !== "https:" && !new URLSearchParams(location.search).has("xapi")) return false;
  const v = await ask("/api/x/status"); return v?.enabled === true;
}
// The signed-in profile, read from an HttpOnly cookie the browser cannot touch. badge: a short-lived signed note that
// this handle signed in here, which a host can check with xVerify. Only checked fields come back.
export async function xMe() {
  const v = await ask("/api/x/me"), u = v?.connected ? v.user : null;
  if (!u || !cleanHandle(u.username)) return null;
  const pic = typeof u.profile_image_url === "string" && /^https:\/\/pbs\.twimg\.com\//.test(u.profile_image_url) ? u.profile_image_url : "";
  return { id: String(u.id || ""), username: cleanHandle(u.username), name: typeof u.name === "string" ? u.name : "", pic, badge: typeof v.badge === "string" ? v.badge : "" };
}
export async function xLogout() { await ask("/api/x/logout", { method: "POST" }); }
// The host asks its own site whether a guest's badge is genuine. The answer is the handle it was signed for, or "".
export async function xVerify(badge) {
  if (typeof badge !== "string" || !badge || badge.length > 2048) return "";
  const v = await ask("/api/x/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: badge }) });
  return v?.ok ? cleanHandle(v.username) : "";
}

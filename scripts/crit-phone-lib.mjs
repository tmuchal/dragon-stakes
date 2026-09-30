// Phone playtest helpers (read-only critique; never edits the game).
import { chromium, devices } from "playwright";
export { devices };
export const OUT = process.env.OUT || "./shots";
export const BASE = "http://localhost:8827/_crit/";
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function launch() {
  return chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
}
// a fresh visitor on a phone profile. prof: a devices[] entry, overrides: e.g. { viewport }
export async function phone(browser, prof, over = {}, query = "") {
  const { defaultBrowserType, ...d } = prof;
  const ctx = await browser.newContext({ ...d, ...over });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console: " + m.text()); });
  await page.goto(BASE + query);
  await page.waitForFunction(() => document.getElementById("splash") && (!document.getElementById("splash").hidden || !document.getElementById("club").hidden), null, { timeout: 60000 });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errs };
}
export const shot = async (page, name) => { const path = `${OUT}/${name}.png`; await page.screenshot({ path }); return path; };
// ---- real multi-touch through CDP. Keeps the set of fingers that are down. ----
export class Fingers {
  constructor(cdp) { this.cdp = cdp; this.pts = new Map(); }
  list() { return [...this.pts].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 8, radiusY: 8, force: 1 })); }
  async down(id, x, y) { this.pts.set(id, { x, y }); await this.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: this.list() }); }
  async move(id, x, y) { this.pts.set(id, { x, y }); await this.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: this.list() }); }
  async up(id) { this.pts.delete(id); await this.cdp.send("Input.dispatchTouchEvent", { type: this.pts.size ? "touchEnd" : "touchEnd", touchPoints: this.list() }); }
  async drag(id, x0, y0, x1, y1, steps = 8, ms = 30) { for (let i = 1; i <= steps; i++) { await this.move(id, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(ms); } }
  async tap(id, x, y, hold = 40) { await this.down(id, x, y); await sleep(hold); await this.up(id); }
}
export const rect = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, hidden: !e.offsetParent && getComputedStyle(e).position !== "fixed" }; }, sel);
// every visible tappable thing under a root, with its size; small = under 44 px in either direction
export const targets = (page, root = "body") => page.evaluate(root => {
  const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && !e.closest("[hidden]"); };
  return [...document.querySelectorAll(`${root} button, ${root} input, ${root} summary, ${root} a`)].filter(vis).map(e => {
    const r = e.getBoundingClientRect();
    return { id: e.id || e.className || e.tagName, text: (e.textContent || e.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 28), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), fs: parseFloat(getComputedStyle(e).fontSize) };
  });
}, root);
// visible text nodes with a small computed font size
export const smallText = (page, root = "body", max = 12) => page.evaluate(([root, max]) => {
  const out = new Map(), w = document.createTreeWalker(document.querySelector(root), NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) {
    const tx = n.textContent.trim(); if (!tx) continue; const e = n.parentElement; if (!e || e.closest("[hidden]") || e.closest("script,style")) continue;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const s = getComputedStyle(e), fs = parseFloat(s.fontSize); if (fs < max) { const k = `${fs}px ${e.tagName.toLowerCase()}${e.id ? "#" + e.id : e.className ? "." + String(e.className).split(" ")[0] : ""}`; if (!out.has(k)) out.set(k, tx.slice(0, 40)); }
  }
  return [...out].map(([k, v]) => `${k}: "${v}"`);
}, [root, max]);
// things whose content is wider than their box, or that stick out of the viewport sideways
export const overflow = (page, root = "body") => page.evaluate(root => {
  const res = { docOver: document.documentElement.scrollWidth - innerWidth, clipped: [], offscreen: [] };
  for (const e of document.querySelectorAll(`${root} *`)) {
    if (e.closest("[hidden]")) continue; const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const name = `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""}`;
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible" && e.children.length === 0) res.clipped.push(`${name} "${e.textContent.trim().slice(0, 30)}" ${e.scrollWidth}>${e.clientWidth}`);
    if ((r.right > innerWidth + 1 || r.left < -1) && e.children.length === 0 && e.textContent.trim()) res.offscreen.push(`${name} "${e.textContent.trim().slice(0, 30)}" x ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return res;
}, root);
// which boxes overlap each other, from a list of selectors
export const overlaps = (page, sels) => page.evaluate(sels => {
  const bx = sels.map(s => { const e = document.querySelector(s); if (!e || e.closest("[hidden]")) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { s, l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }).filter(Boolean);
  const out = [];
  for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const a = bx[i], b = bx[j], w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (w > 1 && h > 1) out.push(`${a.s} x ${b.s}: ${Math.round(w)}x${Math.round(h)}px`); }
  return { boxes: bx.map(b => `${b.s} [${Math.round(b.l)},${Math.round(b.t)} ${Math.round(b.r - b.l)}x${Math.round(b.b - b.t)}]`), hits: out };
}, sels);
export const HUD = [".card.mine", ".card.board", "#map", ".topBtns", "#eventPill", "#coach", "#toasts .toast", "#prompt", "#promptNo", "#stick", "#tBoost", "#duel", "#callout", "#laneWrap.on", ".wheelBox"];
export const sky = page => page.evaluate(() => window.__sky ? window.__sky() : null);
export const until = async (fn, ms, step = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

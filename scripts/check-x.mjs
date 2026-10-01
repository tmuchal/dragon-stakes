// Real-browser check of the X features: the share links (result, a won fight, the invite) and what they would post, the
// handle field, the handle on my tag and the board, Copy result in the screen's language, the Connect X box only when the
// site's api/x says it is on (mocked here), and in a shared sky: a guest's typed handle reaches the host unmarked, a
// forged badge is not believed, and only a badge the host's server accepts gives the X mark.
//   node scripts/check-x.mjs <folder for screenshots>
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
const out = process.argv[2] || "shots", base = "http://localhost:8827/", SITE = "https://dragon-stakes.vercel.app/";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = []; let bad = 0;
const line = (ok, name, note = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "  |  " + note : ""}`); };
const PHONE = { width: 390, height: 844 }, DESK = { width: 1440, height: 900 };
// a new visitor per page; init: localStorage to start with; api: mocked answers for /api/x/* (null: nothing there)
const open = async (q, { vp = DESK, touch = false, init = {}, api = null, clip = false } = {}) => {
  const c = await b.newContext({ viewport: vp, hasTouch: touch, permissions: clip ? ["clipboard-read", "clipboard-write"] : [] });
  await c.addInitScript(kv => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); for (const [k, v] of Object.entries(kv)) localStorage.setItem("dgs1." + k, JSON.stringify(v)); } }, init);
  await c.route(/pbs\.twimg\.com/, r => r.fulfill({ path: fileURLToPath(new URL("../og.png", import.meta.url)), contentType: "image/png" }));   // a stand-in profile picture
  if (api) await c.route(/\/api\/x\//, r => { const k = new URL(r.request().url()).pathname.split("/").pop(), v = api[k]; return v === undefined ? r.fulfill({ status: 404, body: "not found" }) : v === "abort" ? r.abort() : typeof v === "function" ? v(r) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) }); });
  const p = await c.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(base + "?" + q); await p.waitForFunction(() => window.__sky, null, { timeout: 20000 }); return p;
};
const st = p => p.evaluate(() => window.__sky());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms, step = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const intent = href => { try { const u = new URL(href); return u.origin + u.pathname === "https://x.com/intent/post" ? { text: u.searchParams.get("text") || "", url: u.searchParams.get("url") || "" } : null; } catch { return null; } };
const once = s => (s.match(/@RareFriendsNFT/g) || []).length === 1;
const shown = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !!e.offsetParent && !e.hidden; }, sel);
const fits = p => p.evaluate(() => { const r = document.getElementById("goBtn").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 100; });

{ // the handle field on the setup screen: what it takes and what it quietly refuses
  const p = await open("test");
  const typed = async v => { await p.fill("#xIn", v); await p.waitForTimeout(80); return p.evaluate(() => ({ xh: JSON.parse(localStorage.getItem("dgs1.xh") || '""'), invalid: document.getElementById("xIn").hasAttribute("aria-invalid"), handle: window.__sky().x.handle })); };
  const a = await typed("@Some_User1"), c = await typed("bad handle!"), d = await typed("abcdefghijklmnop"), e = await typed("Some_User1");
  line(a.xh === "Some_User1" && !a.invalid && c.xh === "" && c.invalid && d.xh === "" && d.invalid && e.xh === "Some_User1", "the handle field takes @Some_User1 (the @ dropped), refuses \"bad handle!\" and a 16-character name quietly", `"@Some_User1" -> "${a.xh}" | "bad handle!" -> "${c.xh}" (marked ${c.invalid}) | 16 letters -> "${d.xh}" (marked ${d.invalid})`);
  const box = await p.evaluate(() => ({ conn: !document.getElementById("xConn").hidden, on: window.__sky().x.on }));
  line(!box.conn && !box.on, "on the plain local server (no api/): no Connect X button, nothing asked", JSON.stringify(box));
  await p.screenshot({ path: `${out}/x-setup-en.png` });
  line(await fits(p), "setup at 1440x900 with the handle field: Take off is still in view");
  await p.close();
}
for (const [q, name] of [["test&lang=ko", "x-setup-ko"], ["test", "x-m-setup-en"], ["test&lang=ko", "x-m-setup-ko"]]) {
  const m = name.includes("-m-"), p = await open(q, { vp: m ? PHONE : DESK, touch: m, init: { xh: "Some_User1" } }); await p.waitForTimeout(600);
  if (m) await p.evaluate(() => document.getElementById("xIn").scrollIntoView({ block: "center" }));
  await p.waitForTimeout(200); await p.screenshot({ path: `${out}/${name}.png` });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), val = await p.inputValue("#xIn");
  line(over === 0 && val === "Some_User1" && await fits(p), `setup ${name.replace("x-", "")}: the saved handle is filled in, nothing overflows sideways, Take off in view`, `overflow ${over}px`);
  await p.close();
}
{ // Connect X: only when /api/x/status says so, and every way it can be missing or fail
  const cases = [["absent (404)", {}], ["disabled", { status: { enabled: false } }], ["failing", { status: "abort" }], ["not JSON", { status: r => r.fulfill({ status: 200, contentType: "text/html", body: "<html>" }) }]];
  for (const [what, api] of cases) {
    const n = errs.length, p = await open("test&xapi", { api }); await p.waitForTimeout(900);
    const s = await st(p), conn = await shown(p, "#xConn");
    line(!conn && !s.x.on && errs.length === n, `api/x/status ${what}: no Connect X button and no console errors`, JSON.stringify(s.x));
    await p.close();
  }
  const p = await open("test&xapi", { api: { status: { enabled: true }, me: { enabled: true, connected: false } } }); await p.waitForTimeout(900);
  const btn = await p.evaluate(() => ({ shown: !!document.getElementById("xBtn").offsetParent, href: document.getElementById("xBtn").getAttribute("href"), off: !document.getElementById("xOff").hidden }));
  line(btn.shown && btn.href === "/api/x/start" && !btn.off, "switched on and not signed in: Connect X shows and leads to /api/x/start", JSON.stringify(btn));
  await p.screenshot({ path: `${out}/x-setup-connect.png` }); await p.close();
  const user = { id: "12", username: "dragon_rider", name: "Dragon Rider", profile_image_url: "https://pbs.twimg.com/profile_images/1/a_normal.png" };
  for (const [vp, lang] of [[DESK, "en"], [DESK, "ko"], [PHONE, "en"], [PHONE, "ko"]]) {
    const q = await open(`test&xapi&lang=${lang}`, { vp, touch: vp === PHONE, api: { status: { enabled: true }, me: { enabled: true, connected: true, user, badge: "b.c" }, logout: { ok: true } } });
    await q.waitForTimeout(1200);
    const v = await q.evaluate(() => ({ val: document.getElementById("xIn").value, ro: document.getElementById("xIn").readOnly, mark: document.getElementById("xAt").classList.contains("xok"), ava: !document.getElementById("xAva").hidden, off: !!document.getElementById("xOff").offsetParent, name: document.getElementById("nameIn").value, s: window.__sky().x }));
    if (vp === PHONE) await q.evaluate(() => document.getElementById("xIn").scrollIntoView({ block: "center" }));
    await q.screenshot({ path: `${out}/x-${vp === PHONE ? "m-" : ""}setup-connected-${lang}.png` });
    if (vp === DESK && lang === "en") {
      line(v.val === "dragon_rider" && v.ro && v.mark && v.ava && v.off && v.s.connected, "signed in (mocked /api/x/me): the handle is filled from X and locked, with the X mark, the picture and Disconnect", JSON.stringify(v));
      await q.click("#xOff"); await q.waitForTimeout(300);
      const after = await q.evaluate(() => ({ s: window.__sky().x, ro: document.getElementById("xIn").readOnly, mark: document.getElementById("xAt").classList.contains("xok"), msg: document.getElementById("xMsg").textContent }));
      line(!after.s.connected && after.s.handle === "dragon_rider" && !after.ro && !after.mark, "Disconnect: the mark goes, the handle stays as plain typed text", JSON.stringify(after));
    }
    await q.close();
  }
  { // signed in, landed: the picture and the marked handle on the result screen, and the mark on my tag and the board
    const q = await open("test&xapi&stake=25", { api: { status: { enabled: true }, me: { enabled: true, connected: true, user, badge: "b.c" } } }); await q.waitForTimeout(1000);
    await q.click("#goBtn"); await q.waitForTimeout(2200);
    const fly = await q.evaluate(() => [!!document.querySelector(".tag.self.xok"), !!document.querySelector("#board li.me .xm")]);
    await q.evaluate(() => window.__poke((w, me) => { me.stake += w.take(30); me.x = 6; me.z = 6; me.y = Math.max(me.y, 70); })); await q.waitForTimeout(300); await q.keyboard.press("KeyE"); await q.waitForTimeout(900);
    const res = await q.evaluate(() => ({ ava: !document.getElementById("resAva").hidden && document.getElementById("resAva").naturalWidth > 0, x: document.getElementById("resX").textContent, mark: document.getElementById("resX").classList.contains("xok") }));
    await q.screenshot({ path: `${out}/x-result-connected.png` });
    line(fly[0] && fly[1] && res.ava && res.x === "@dragon_rider" && res.mark, "signed in: the X mark on my tag and my board row, the picture and marked handle on the result screen", JSON.stringify({ fly, res }));
    await q.close();
  }
  const e = await open("test&xapi#x=err", { api: { status: { enabled: true }, me: { enabled: true, connected: false } } }); await e.waitForTimeout(900);
  const msg = await e.evaluate(() => [document.getElementById("xMsg").textContent, location.hash]);
  line(/Could not sign in/.test(msg[0]) && msg[1] === "", "coming back from a failed sign-in: a plain message, the address cleaned", JSON.stringify(msg));
  await e.close();
}
{ // in flight: my handle on my own tag and on the board, then the result screen's Share on X and Copy result, in both languages
  for (const lang of ["en", "ko"]) {
    const p = await open(`test&stake=25&lang=${lang}`, { init: { xh: "Some_User1" }, clip: true }); await p.waitForTimeout(800); await p.click("#goBtn"); await p.waitForTimeout(2500);
    const tag = await until(() => p.evaluate(() => { const e = document.querySelector(".tag.self"); return e && !e.hidden ? e.textContent : null; }), 4000);
    const board = await p.evaluate(() => document.querySelector("#board li.me")?.textContent || "");
    if (lang === "en") await p.screenshot({ path: `${out}/x-hud.png` });
    line(tag === "@Some_User1" && board.includes("@Some_User1") && !(await p.evaluate(() => !!document.querySelector(".tag.self.xok, #board .xm"))), `in flight (${lang}): @Some_User1 on my own tag and on the board, with no X mark (typed, not checked)`, `tag "${tag}" | board "${board}"`);
    await p.evaluate(() => window.__poke((w, me) => { me.stake += w.take(47); for (const m of w.monsters) m.cool = Infinity; me.x = 6; me.z = 6; me.y = Math.max(me.y, 70); })); await p.waitForTimeout(300);
    await p.keyboard.press("KeyE"); await p.waitForTimeout(900);
    const s = await st(p), href = await p.getAttribute("#shareBtn", "href"), i = intent(href);
    const who = await p.evaluate(() => [!document.getElementById("resWho").hidden, document.getElementById("resX").textContent]);
    const n = s.home - s.run.start;   // 47 put in, plus any ring flown through on the way
    const want = lang === "en" ? new RegExp(`^I took ${n} RF out of the sky in Dragon Stakes 🐉\nFlying as @Some_User1 with a @RareFriendsNFT Friend\\. Beat me:$`) : new RegExp(`^Dragon Stakes 하늘에서 ${n} RF를 가져왔다 🐉\n@Some_User1, @RareFriendsNFT 프렌드 타고 출격\\. 나를 이겨 봐:$`);
    line(s.landed && n >= 47 && i && want.test(i.text) && i.url === SITE && once(i.text) && who[0] && who[1] === "@Some_User1", `result (${lang}): Share on X posts the real result with the handle and @RareFriendsNFT once, and the game's address`, i ? JSON.stringify(i) : href);
    await p.click("#copyBtn"); await p.waitForTimeout(300);
    const copied = await p.evaluate(() => navigator.clipboard.readText());
    line((lang === "en" ? new RegExp(`landed with ${s.home} RF`) : new RegExp(`${s.home} RF 들고 내림`)).test(copied) && copied.endsWith("\n" + SITE), `Copy result (${lang}) is in the screen's language and ends with the address`, JSON.stringify(copied));
    await p.screenshot({ path: `${out}/x-result-${lang}.png` });
    await p.close();
    const m = await open(`test&stake=25&lang=${lang}`, { vp: PHONE, touch: true, init: { xh: "Some_User1" } }); await m.waitForTimeout(800); await m.click("#goBtn"); await m.waitForTimeout(2000);
    await m.evaluate(() => window.__poke((w, me) => { me.stake += w.take(47); me.x = 6; me.z = 6; me.y = Math.max(me.y, 70); })); await m.waitForTimeout(300);
    await m.click("#prompt"); await m.waitForTimeout(900);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth), inView = await m.evaluate(() => { const r = document.getElementById("shareBtn").getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; });
    await m.screenshot({ path: `${out}/x-m-result-${lang}.png` });
    line((await st(m)).landed && over === 0 && inView, `result on a phone (${lang}): Share on X is in view, nothing overflows`, `overflow ${over}px`);
    await m.close();
  }
}
{ // a won fight: a quiet "Share" in a toast once the fight board is gone, never during the fight
  const p = await open("test&auto&go&fights=3&miss=0&stake=25", { init: { xh: "Some_User1", level: "easy" } });
  let during = 0, fightsSeen = 0, link = null, wasD = false; const t0 = Date.now();
  while (Date.now() - t0 < 180000 && !link) {
    const s = await st(p); if (s.landed) break;
    if (s.D) { wasD = true; const n = await p.evaluate(() => [...document.querySelectorAll("#toasts .toast a.xshare")].filter(a => a.offsetParent).length); if (n) during++; }
    else if (wasD) { wasD = false; fightsSeen++; }
    link = await p.evaluate(() => { const a = document.querySelector("#toasts .toast a.xshare"); return a && a.offsetParent ? [a.href, a.parentElement.textContent] : null; });
    await sleep(120);
  }
  if (link) await p.screenshot({ path: `${out}/x-toast-share.png` });
  const i = link && intent(link[0]);
  line(!!i && /^I just took \d+ RF from .+ in Dragon Stakes 🐉\nFlying as @Some_User1 with a @RareFriendsNFT Friend\. Beat me:$/.test(i.text) && once(i.text) && i.url === SITE && during === 0, "after a won fight: a toast with a Share link to that moment, and none while the fight was on", link ? `"${link[1]}" | ${JSON.stringify(i)} | share links seen during a fight: ${during}` : `no won fight in ${fightsSeen} fights`);
  await p.close();
}
{ // the online box: Invite on X carries the sky code and the invite link, in both languages, desktop and phone
  for (const [vp, tag] of [[DESK, ""], [PHONE, "m-"]]) {
    const p = await open("test", { vp, touch: vp === PHONE }); await p.waitForTimeout(600);
    await p.click('#skySeg [data-v="create"]');
    const code = await until(async () => { const s = await st(p); return s.role === "host" ? s.code : null; }, 30000);
    if (!code) { line(false, "Invite on X: the sky could not be opened (PeerJS broker unreachable)"); await p.close(); continue; }
    for (const lang of ["en", "ko"]) {
      await p.click(`#langSeg [data-v="${lang}"]`); await p.waitForTimeout(200);
      const i = intent(await p.getAttribute("#skyShare", "href"));
      await p.evaluate(() => document.getElementById("skyBox").scrollIntoView({ block: "center" })); await p.waitForTimeout(150);
      await p.screenshot({ path: `${out}/x-${tag}online-${lang}.png` });
      const ok = i && i.text.includes(code) && i.url === `${SITE}?room=${code}` && once(i.text) && (lang === "en" ? /Sky code/.test(i.text) : /하늘 코드/.test(i.text));
      line(ok && await shown(p, "#skyShare"), `Invite on X (${tag || "desktop "}${lang}) carries sky ${code} and its invite link`, JSON.stringify(i));
    }
    await p.close();
  }
}
{ // a shared sky: handles travel with names; a guest's X mark is only believed when the host's server accepts its badge
  const verify = r => { let t = ""; try { t = JSON.parse(r.request().postData() || "{}").t; } catch { /* bad body */ } return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(t === "GOOD-BADGE" ? { ok: true, username: "Guest_1" } : { ok: false }) }); };
  const host = await open("test&auto&go&host&stake=25&hunt=nobody&fights=99&name=Hana&xapi", { vp: { width: 1000, height: 640 }, init: { xh: "HostX" }, api: { status: { enabled: true }, me: { enabled: true, connected: false }, verify } });
  const code = await until(async () => { const s = await st(host); return s.role === "host" && s.myId ? s.code : null; }, 30000);
  if (!code) line(false, "shared sky: the host could not open a sky (PeerJS broker unreachable)");
  else {
    const guest = await open(`test&auto&go&room=${code}&stake=25&hunt=nobody&fights=99&name=Bo`, { vp: { width: 1000, height: 640 }, init: { xh: "Guest_1" } });
    const gid = await until(async () => { const s = await st(guest); return s.role === "guest" && s.myId ? s.myId : null; }, 40000);
    const hid = (await st(host)).myId;
    const seen = gid && await until(async () => { const [h, g] = await Promise.all([st(host), st(guest)]); return h.x.marks[gid]?.xh === "Guest_1" && g.x.marks[hid]?.xh === "HostX" ? [h.x.marks[gid], g.x.marks[hid]] : null; }, 10000);
    line(!!seen && !seen[0].ok && !seen[1].ok, "typed handles reach the other device with the rider, unmarked", JSON.stringify(seen));
    await guest.evaluate(() => window.__net().toHost({ type: "name", name: "Bo", xh: "Guest_1", xb: "FORGED.BADGE", xok: true })); await sleep(1500);
    const forged = (await st(host)).x.marks[gid];
    line(forged && !forged.ok, "a guest that claims the mark with a forged badge is not believed by the host", JSON.stringify(forged));
    await guest.evaluate(() => window.__net().toHost({ type: "name", name: "Bo", xh: "Guest_1", xb: "GOOD-BADGE" }));
    const good = await until(async () => { const [h, g] = await Promise.all([st(host), st(guest)]); return h.x.marks[gid]?.ok && g.x.marks[gid]?.ok ? [h.x.marks[gid], g.x.marks[gid]] : null; }, 6000);
    line(!!good, "a badge the host's server accepts gives that guest the X mark, on the host and on the guest", JSON.stringify(good));
    await guest.evaluate(() => window.__net().toHost({ type: "name", name: "Bo", xh: "Someone_Else", xb: "GOOD-BADGE" })); await sleep(1500);
    const swapped = (await st(host)).x.marks[gid];
    line(swapped?.xh === "Someone_Else" && !swapped.ok, "a genuine badge does not carry over to a different handle", JSON.stringify(swapped));
    await guest.close();
  }
  await host.close();
}
console.log("errors:", errs.slice(0, 6));
console.log(bad || errs.length ? `\n${bad} check(s) failed, ${errs.length} page error(s)` : "\nall X checks passed");
await b.close(); process.exit(bad || errs.length ? 1 : 0);

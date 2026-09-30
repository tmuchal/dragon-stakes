// The phone part of check.mjs: real multi-touch through CDP (a finger held on the stick while another taps), the HUD
// zones measured from bounding boxes upright, sideways and at 360x640, analog pitch, a two-finger echo tap, the
// background pause in a fight. Run alone with: node scripts/check-phone.mjs <folder for screenshots>
import { chromium } from "playwright";
import { Fingers, overlaps, rect, targets, smallText } from "./crit-phone-lib.mjs";
const base = "http://localhost:8827/", SPB = 60 / 124, sleep = ms => new Promise(r => setTimeout(r, ms));
const HUD = [".card.mine", ".card.board", "#map", ".topBtns", "#eventPill", "#coach", "#toasts", "#prompt", "#promptNo", "#stick", "#tBoost", "#duel", "#callout", "#laneWrap.on", ".wheelBox"];
const st = p => p.evaluate(() => window.__sky());
const until = async (fn, ms, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

export async function phoneChecks(b, out, errs) {
  let bad = 0; const line = (ok, name, note = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "  |  " + note : ""}`); };
  const open = async (q, vp) => {
    const c = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); const p = await c.newPage();
    p.on("pageerror", e => errs.push("phone: " + e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push("phone: " + m.text()));
    await p.goto(base + "?" + q); await p.waitForFunction(() => window.__sky, null, { timeout: 20000 });
    return { p, f: new Fingers(await c.newCDPSession(p)) };
  };
  // what is drawn over the middle of the coin count? It must be the coin card itself.
  const coinClear = p => p.evaluate(sels => { const a = document.getElementById("stakeV").getBoundingClientRect(); return !sels.some(s => [...document.querySelectorAll(s)].some(e => { if (e.closest("[hidden]") || e.closest(".card.mine")) return false; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).display !== "none" && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0; })); }, [".card.board", "#map", ".topBtns", "#eventPill", "#coach", ".toast", "#prompt", "#promptNo", "#stick", "#tBoost", "#duel", "#callout", "#laneWrap.on", ".wheelBox", "#pause .box"]);
  const inView = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; }, sel);
  // fill the HUD: an event, a toast, the coach, and a rider in reach so the prompt is up
  const busy = p => p.evaluate(() => window.__poke((w, me) => { w.nextEvent = w.t; for (const m of w.monsters) m.cool = Infinity; const o = w.riders.filter(r => r !== me && r.stake >= 10 && r.state === "fly")[0]; me.shield = 0; o.shield = 0; if (me.stake < 1) me.stake += w.take(5); me.x = o.x + 8; me.y = o.y; me.z = o.z; me.yaw = o.yaw; window.__o = o; w.events.push({ type: "join", rider: o }); }));
  const SIZES = [["upright 390x844", { width: 390, height: 844 }, "up"], ["small 360x640", { width: 360, height: 640 }, "small"], ["sideways 844x390", { width: 844, height: 390 }, "side"]];

  for (const lang of ["en", "ko"]) for (const [name, vp, tag] of SIZES) {
    const { p, f } = await open(`test&lang=${lang}&stake=25`, vp); await p.waitForTimeout(700);
    if (tag === "up" && lang === "en") {   // the setup screen: tap targets and small text
      const small = (await targets(p, "#club")).filter(x => x.h < 44 || x.w < 44), tiny = await smallText(p, "#club", 12), over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      line(small.length === 0 && tiny.length === 0 && over === 0, "setup on a phone: every tap target is at least 44 px, no text under 12 px", small.map(x => `${x.id} ${x.w}x${x.h}`).concat(tiny).slice(0, 8).join(" · "));
      const fs = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById("nameIn")).fontSize)); line(fs >= 16, "inputs are 16 px, so iOS does not zoom on focus", `${fs}px`);
    }
    await p.click("#goBtn"); await p.waitForTimeout(3200); await busy(p); await p.waitForTimeout(900);
    const fly = await overlaps(p, HUD), clear1 = await coinClear(p), chip = await p.evaluate(() => document.querySelector(".chips i.ev")?.textContent || "");
    await p.screenshot({ path: `${out}/p-${tag}-${lang}-fly.png` });
    line(fly.hits.length === 0 && clear1 && !!chip, `${name} (${lang}) in flight with coach, toast, event and prompt up: no HUD boxes overlap, coin count clear`, fly.hits.join(" · ") || `event shown as "${chip}"`);
    if (tag === "up" && lang === "en") {
      // hold the stick and tap the prompt with a second finger
      const s = await rect(p, "#stick"), pr = await rect(p, "#prompt");
      await f.down(1, s.cx, s.cy); await f.move(1, s.cx, s.cy - 30); await sleep(250);
      await p.evaluate(() => window.__poke((w, me) => { const o = window.__o; o.shield = 0; me.shield = 0; me.x = o.x + 8; me.y = o.y; me.z = o.z; })); await sleep(150);
      const pr2 = await rect(p, "#prompt"); await f.tap(2, pr2.cx, pr2.cy); await sleep(300); const s1 = await st(p); await f.up(1);
      line(!!s1.D, "with one finger holding the stick, a second finger on the Fight button starts the fight", s1.D ? `fight started, stick was at ${JSON.stringify({ x: Math.round(s.cx), y: Math.round(s.cy - 30) })}` : `prompt was "${(await p.textContent("#prompt")).trim()}"`);
    } else { await p.evaluate(() => window.__poke((w, me) => { const o = window.__o; o.shield = 0; me.shield = 0; me.x = o.x + 8; me.y = o.y; me.z = o.z; w.challenge(me, o); })); }
    const inFight = await until(async () => { const s = await st(p); return s.D && s.now / SPB - s.D.b0 > -2.5 ? s : null; }, 20000, 50);
    await sleep(200); const fight = await overlaps(p, HUD), clear2 = await coinClear(p); await p.screenshot({ path: `${out}/p-${tag}-${lang}-fight.png` });
    const rule = (await p.textContent("#dRule")).trim();
    line(!!inFight && fight.hits.length === 0 && clear2, `${name} (${lang}) in a fight: header, 3-2-1 and board do not overlap the HUD, coin count clear`, fight.hits.join(" · ") || `header says "${rule}"`);
    await p.context().close();
  }

  { // analog pitch: three stick deflections give three climbs; letting go levels off
    const { p, f } = await open("test&stake=0", { width: 390, height: 844 }); await p.waitForTimeout(600); await p.click("#goBtn"); await p.waitForTimeout(3000);
    const s = await rect(p, "#stick"), got = [];
    for (const dy of [12, 26, 46]) { await f.down(1, s.cx, s.cy); await f.move(1, s.cx, s.cy - dy); await sleep(1300); got.push((await st(p)).me.pitch); await f.up(1); await sleep(900); }
    const level = (await st(p)).me.pitch;
    await f.down(1, s.cx, s.cy); await f.move(1, s.cx, s.cy + 4); await sleep(800); const dz = (await st(p)).me.pitch; await f.up(1);
    line(got[0] > 0.03 && got[0] < got[1] - 0.05 && got[1] < got[2] - 0.05 && got[2] > 0.4 && Math.abs(level) < 0.03 && Math.abs(dz) < 0.02, "the stick is analog: three deflections, three climbs; a 4 px drift does nothing", `pitch at 12 / 26 / 46 px up: ${got.map(x => x.toFixed(2)).join(" / ")} | let go: ${level.toFixed(3)} | 4 px down: ${dz.toFixed(3)}`);
    // the stick also appears under a thumb in the lower left of the sky, and the right side still looks around
    await f.down(1, 120, 520); await f.move(1, 120, 480); await sleep(900); const fl = await st(p), floated = await p.evaluate(() => document.getElementById("stick").classList.contains("float")); await p.screenshot({ path: `${out}/p-float-stick.png` }); await f.up(1);
    line(floated && fl.me.pitch > 0.25, "a thumb landing in the lower left brings the stick there", `pitch ${fl.me.pitch.toFixed(2)}`);
    // pinch to zoom with two fingers on the sky
    const d0 = await p.evaluate(() => window.__view?.dist ?? null); await f.down(1, 250, 300); await f.down(2, 300, 300); await f.drag(2, 300, 300, 370, 300, 6, 25); const d1 = await p.evaluate(() => window.__view?.dist ?? null); await f.up(2); await f.up(1);
    line(d0 == null || d1 < d0 - 1, "two fingers on the sky pinch to zoom", d0 == null ? "the view exposes no test hook for its distance; not measured" : `camera distance ${d0.toFixed(1)} -> ${d1.toFixed(1)}`);
    await p.context().close();
  }
  { // an echo tapped with two fingers at once is one tap, not a stray one; then the page goes to the background mid-fight
    const { p, f } = await open("test&stake=25", { width: 390, height: 844 }); await p.waitForTimeout(600); await p.click("#goBtn"); await p.waitForTimeout(2500);
    await p.evaluate(() => window.__poke((w, me) => { for (const m of w.monsters) m.cool = Infinity; const o = w.riders.filter(r => r !== me && r.stake >= 10 && r.state === "fly")[0]; me.shield = 0; o.shield = 0; me.x = o.x + 8; me.y = o.y; me.z = o.z; w.challenge(o, me); }));   // the other rider challenges, so it goes first and I echo
    const calls = await until(async () => { const s = await st(p); return s.D && s.now / SPB - s.D.b0 > 4.3 ? s.D.call : null; }, 30000, 50);
    let taps = 0;
    for (const x of calls || []) {
      await p.evaluate(at => new Promise(done => { const f = () => { const s = window.__sky(); if (!s.D || s.now / (60 / 124) - s.D.b0 >= at) done(); else requestAnimationFrame(f); }; f(); }), 8 + x - 0.04);   // waited for inside the page, so the tap lands on the beat
      await f.down(1, 150, 700); await f.down(2, 240, 705); taps += 2; await sleep(30); await f.up(1); await f.up(2);   // two fingers, a few milliseconds apart
    }
    const done = await until(async () => { const s = await st(p); return s.D?.over || s.D?.round === 1 ? s.D : null; }, 8000, 40), rec = await st(p);
    await p.screenshot({ path: `${out}/p-echo.png` });
    line(!!calls?.length && rec.D && (rec.D.round === 1 || rec.D.over) && rec.D.hits[0] < calls.length, "an echo tapped with two fingers at once costs no stray hits", `${calls?.length} beats echoed with ${taps} finger taps -> hits against me ${rec.D?.hits[0]} (every second finger as a stray would be ${calls?.length})`);
    // round 2 (I go first): the page goes to the background in the middle of it
    await until(async () => { const s = await st(p); return s.D?.round === 1 && s.now / SPB - s.D.b0 > 0.5; }, 20000, 50);
    await f.tap(1, 200, 700); await sleep(120); const before = await st(p);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { get: () => true, configurable: true }); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); });
    await sleep(900); const a = await st(p); await sleep(1500); const c = await st(p);
    await p.evaluate(() => { Object.defineProperty(document, "hidden", { get: () => false, configurable: true }); });
    const rr = await rect(p, "#resumeBtn"); await f.tap(1, rr.cx, rr.cy); await sleep(500); const after = await st(p);
    line(a.paused && c.now === a.now && !!a.D && !after.paused && after.D.round === 1 && after.D.call.length === 0 && after.D.b0 > before.D.b0 + 3, "alone, going to the background pauses even a fight, and the round starts over from its 3-2-1 on return", `paused ${a.paused}, song clock moved ${(c.now - a.now).toFixed(3)} s in 1.5 s | round ${after.D.round + 1} restarted: its first beat moved from ${before.D.b0} to ${after.D.b0}, taps cleared (${before.D.call.length} -> ${after.D.call.length})`);
    await p.context().close();
  }
  { // sideways: the pause box and the result fit the screen; the wheel at 360x640 leaves the coins alone
    const { p, f } = await open("test&lang=ko&stake=25", { width: 844, height: 390 }); await p.waitForTimeout(600); await p.click("#goBtn"); await p.waitForTimeout(3000);
    const pb = await rect(p, "#pauseBtn"); await f.tap(1, pb.cx, pb.cy); await sleep(400); await p.screenshot({ path: `${out}/p-side-pause.png` });
    const boxOk = await inView(p, "#pause .box"), top = await p.evaluate(() => { const r = document.getElementById("pauseBtn").getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
    const pb2 = await rect(p, "#pauseBtn"); await f.tap(1, pb2.cx, pb2.cy); await sleep(300); const resumed = !(await st(p)).paused;
    line(boxOk && top === "pauseBtn" && resumed, "sideways: the pause box fits the screen, and the Resume button at the top right can be tapped", `box in view ${boxOk}, on top: ${top}, resumed ${resumed}`);
    const pb3 = await rect(p, "#pauseBtn"); await f.tap(1, pb3.cx, pb3.cy); await sleep(300); const q = await rect(p, "#quitBtn"); await f.tap(1, q.cx, q.cy); await sleep(900); await p.screenshot({ path: `${out}/p-side-result.png` });
    const rows = await p.locator("#resStats dt").count(), again = await inView(p, "#againBtn"), panel = await inView(p, "#result .panel");
    line(again && panel && rows <= 5, "sideways: the result fits, Fly again is in view, and an empty flight shows no table of zeros", `${rows} rows: ${(await p.locator("#resStats dt").allTextContents()).join(" / ")}`);
    await p.context().close();
    const w = await open("test&lang=ko&stake=25", { width: 360, height: 640 }); await w.p.waitForTimeout(600); await w.p.click("#goBtn"); await w.p.waitForTimeout(2500);
    await w.p.evaluate(() => window.__poke((wd, me) => { const m = wd.monsters[0]; for (const o of wd.monsters) if (o !== m) o.cool = Infinity; me.shield = 0; me.x = 300; me.z = -300; me.y = 120; m.x = me.x + 9; m.y = me.y + 2; m.z = me.z; m.target = me; m.state = "dare"; m.dareUntil = wd.t + 8; }));
    await sleep(500); const labels = await w.p.evaluate(() => [document.getElementById("prompt").textContent, document.getElementById("promptNo").textContent, !!document.querySelector("#prompt kbd")?.offsetParent]);
    const hold = await rect(w.p, "#stick"); await w.f.down(1, hold.cx, hold.cy); const pr = await rect(w.p, "#prompt"); await w.f.tap(2, pr.cx, pr.cy); await sleep(1600); await w.f.up(1);
    const wh = await overlaps(w.p, [".card.mine", ".wheelBox"]); await sleep(2400); await w.p.screenshot({ path: `${out}/p-small-wheel.png` });
    const upright = await w.p.evaluate(() => [...document.querySelectorAll("#wheelDisc span")].every(e => getComputedStyle(e).transform === "none" && parseFloat(getComputedStyle(e.firstChild).fontSize) >= 12));
    const inside = await w.p.evaluate(() => { const o = document.getElementById("wheelOut").getBoundingClientRect(), bx = document.querySelector(".wheelBox").getBoundingClientRect(); return o.height > 0 && o.top >= bx.top && o.bottom <= bx.bottom && document.getElementById("callout").hidden; });
    line(!labels[2] && !/[EQ] /.test(labels[0] + labels[1]) && (await st(w.p)).wheel !== undefined && wh.hits.length === 0 && upright && inside, "360x640: the dare buttons carry no keycaps, the wheel leaves the coin card alone, its labels are upright and the result stays inside the box", `"${labels[0]}" / "${labels[1]}" | ${wh.hits.join(" ") || "no overlap"}`);
    await w.p.context().close();
  }
  return bad;
}
if (process.argv[1].endsWith("check-phone.mjs")) {
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] }), errs = [];
  const bad = await phoneChecks(b, process.argv[2] || "shots", errs);
  console.log("errors:", errs.slice(0, 6)); console.log(bad || errs.length ? `\n${bad} phone check(s) failed, ${errs.length} page error(s)` : "\nall phone checks passed");
  await b.close(); process.exit(bad || errs.length ? 1 : 0);
}

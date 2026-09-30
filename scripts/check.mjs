// Real-browser check of flying alone: splash and setup at two sizes and in both languages, the keys, pause, a free
// flight from 0 RF, a bot flight with shop items, a quest and rank points, the record, a phone, and no online script.
//   node scripts/check.mjs <folder for screenshots>
import { chromium } from "playwright";
import { phoneChecks } from "./check-phone.mjs";
const out = process.argv[2] || "shots", base = "http://localhost:8827/";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = []; let bad = 0;
const line = (ok, name, note = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "  |  " + note : ""}`); };
// every page gets its own browser context, so each starts as a new visitor with an empty localStorage
const open = async (q, vp = { width: 1440, height: 900 }, touch = false) => {
  const c = await b.newContext({ viewport: vp, hasTouch: touch }); const p = await c.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(base + "?" + q); await p.waitForFunction(() => window.__sky, null, { timeout: 20000 }); return p;
};
const st = p => p.evaluate(() => window.__sky());
const until = async (fn, ms, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, step)); } return null; };
const SPB = 60 / 124, PHONE = { width: 390, height: 844 };
const fits = p => p.evaluate(() => { const r = document.getElementById("goBtn").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 100; });
const clipped = p => p.evaluate(() => [...document.querySelectorAll("#club button, #club .k, #club summary em, #hud .card, #hud .pill, #result button, #splash button")].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.textContent.trim().slice(0, 20)));

{ // the splash, then the setup screen: desktop and phone, English and Korean
  const p = await open("test&splash"); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/d-splash.png` });
  const pitch = (await p.textContent("#splash p")).trim(), hidden = await p.evaluate(() => document.getElementById("club").hidden);
  await p.keyboard.press("Enter"); await p.waitForTimeout(400);
  line(hidden && await p.evaluate(() => document.getElementById("splash").hidden && !document.getElementById("club").hidden), "splash first, Enter or Play opens the setup screen", `"${pitch}"`);
  await p.screenshot({ path: `${out}/d-setup-en.png` });
  line(await fits(p) && !(await clipped(p)).length, "setup at 1440x900: Take off is in view, nothing clipped", `flow: ${(await p.locator(".flow li span").allTextContents()).join(" / ")}`);
  console.log(`      ${(await p.textContent("#poolLine")).trim()} | stake row: ${(await p.locator("#stakeSeg button").allTextContents()).join(", ")} | ${(await p.textContent("#goSub")).trim()}`);
  await p.click("#guideBtn"); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/d-guide.png` });
  const odds = await p.locator("#guideOdds tr").allTextContents(); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  line(odds.length === 7 && !(await p.evaluate(() => document.getElementById("guide").open)), "how-to lists the dare odds, Esc closes it", odds.slice(1).map(x => x.replace(/\s+/g, " ").trim()).join(" · "));
  await p.close();
  const k = await open("test&lang=ko"); await k.waitForTimeout(1200); await k.screenshot({ path: `${out}/d-setup-ko.png` });
  line(await fits(k) && !(await clipped(k)).length, "setup in Korean at 1440x900: Take off is in view, nothing clipped", (await clipped(k)).join(","));
  await k.close();
  for (const lang of ["en", "ko"]) {
    const m = await open(`test&lang=${lang}`, PHONE, true); await m.waitForTimeout(1200); await m.screenshot({ path: `${out}/d-m-setup-${lang}.png` });
    const over = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    line(await fits(m) && over === 0 && !(await clipped(m)).length, `setup on a phone (${lang}): Take off is in view, no sideways overflow, nothing clipped`, `overflow ${over}px ${(await clipped(m)).join(",")}`);
    await m.evaluate(() => document.querySelector("#club .panel").scrollTo(0, 99999)); await m.waitForTimeout(200); await m.screenshot({ path: `${out}/d-m-setup-${lang}-2.png` });
    await m.close();
  }
}
{ // the purse never blocks play
  const p = await open("test"); await p.evaluate(() => localStorage.setItem("dgs1.purse", "12")); await p.reload(); await p.waitForFunction(() => window.__sky); await p.waitForTimeout(600);
  const off = await p.locator("#stakeSeg button:disabled").allTextContents(), shopOff = await p.locator("#shop button:disabled").count();
  await p.click('#stakeSeg [data-v="10"]'); await p.waitForTimeout(200); const shop2 = await p.locator("#shop button:disabled").count(); const s = await st(p);
  line(off.join(",") === "25 RF,50 RF,100 RF" && shopOff === 0 && shop2 === 3 && s.stake === 10 && s.purse === 12, "a 12 RF purse: stakes it cannot cover are greyed out, and so is the shop once the stake takes the rest", `greyed stakes ${off.join(", ")} | shop greyed ${shopOff} then ${shop2}`);
  await p.screenshot({ path: `${out}/d-setup-poor.png` }); await p.close();
}
{ // a sky whose pool is nearly empty says so, and flying still works
  const p = await open("test&pool=20"); const spent = await until(async () => (await st(p)).pool < 1, 20000);
  await p.waitForTimeout(1200); const lineText = (await p.textContent("#poolLine")).trim(); await p.click("#goBtn"); await p.waitForTimeout(2500);
  const pill = await p.evaluate(() => ({ text: document.getElementById("eventPill").textContent, hidden: document.getElementById("eventPill").hidden, pool: document.getElementById("poolV").textContent })), s = await st(p);
  line(spent && /spent/.test(lineText) && !pill.hidden && /spent/i.test(pill.text) && pill.pool === "0" && s.balanced && !!s.me, "a spent pool is said plainly on the setup screen and in flight, and the books still balance", `"${lineText}" | in flight: "${pill.text}", Sky pool ${pill.pool} RF | ${s.riders} riders, ${s.monsters.length} monsters hold what was in it`);
  await p.screenshot({ path: `${out}/d-pool-spent.png` }); await p.close();
}
{ // take off on each dragon and look at it from the side
  for (const k of ["ember", "wyvern", "lung", "bone", "gold", "jade"]) {
    const q = await open(`test&dragon=${k}`); await q.waitForTimeout(900); await q.click("#goBtn"); await q.waitForTimeout(1500);
    await q.mouse.move(700, 450); await q.mouse.down(); await q.mouse.move(430, 430, { steps: 6 }); await q.waitForTimeout(250);
    await q.screenshot({ path: `${out}/d-k-${k}.png`, clip: { x: 360, y: 200, width: 720, height: 480 } }); await q.mouse.up(); await q.close();
  }
}
{ // a person at the keys, flying free: W climbs, S dives, hands off levels out, then a ring, the prompts, pause
  const p = await open("test&lang=ko"); await p.waitForTimeout(900); await p.click("#goBtn"); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/d-fly.png` });
  const s0 = await st(p); await p.keyboard.down("KeyW"); await p.waitForTimeout(1200); await p.keyboard.up("KeyW"); const s1 = await st(p);
  await p.waitForTimeout(1500); const s2 = await st(p);
  await p.keyboard.down("KeyS"); await p.waitForTimeout(1200); await p.keyboard.up("KeyS"); const s3 = await st(p);
  await p.keyboard.down("ShiftLeft"); await p.waitForTimeout(1500); const s4 = await st(p); await p.keyboard.up("ShiftLeft");
  await p.keyboard.down("KeyA"); await p.waitForTimeout(1000); await p.keyboard.up("KeyA"); await p.screenshot({ path: `${out}/d-turn.png` });
  line(s1.me.y > s0.me.y + 12 && Math.abs(s2.me.pitch) < 0.05 && s3.me.y < s2.me.y - 8 && s4.me.speed > 38, "W climbs, letting go levels out, S dives, Shift boosts", `height ${s0.me.y.toFixed(0)} -> ${s1.me.y.toFixed(0)} with W | pitch after letting go ${s2.me.pitch.toFixed(3)} | ${s2.me.y.toFixed(0)} -> ${s3.me.y.toFixed(0)} with S | speed ${s4.me.speed.toFixed(0)} with Shift`);
  const coach = await p.evaluate(() => ({ shown: !document.getElementById("coach").hidden, tip: document.getElementById("coachTip").textContent, n: document.getElementById("coachN").textContent }));
  line(coach.shown && s4.coach?.[0] === true, "the first-flight coach ticked off climb and dive and moved on", `${coach.n}: ${coach.tip}`);
  // carrying nothing beside a rider who carries coins: E cannot fight, and the prompt says why
  await p.evaluate(() => window.__poke((w, me) => { const o = w.riders.find(r => r !== me && r.stake >= 10 && r.state === "fly"); for (const m of w.monsters) m.cool = Infinity; w.pool += me.stake; me.stake = 0; me.shield = 0; o.shield = 0; me.x = o.x + 8; me.y = o.y; me.z = o.z; me.yaw = o.yaw; window.__o = o; })); await p.waitForTimeout(300);
  const need = await p.evaluate(() => ({ prompt: document.getElementById("prompt").textContent, hidden: document.getElementById("prompt").hidden, stake: document.getElementById("stakeV").textContent }));
  await p.keyboard.press("KeyE"); await p.waitForTimeout(300); const stillFly = (await st(p)).me.state === "fly";
  line(!need.hidden && /1 RF/.test(need.prompt) && need.stake === "0" && stillFly, "flying free beside a rider: the HUD reads 0 RF and the prompt says why E does nothing", `"${need.prompt}"`);
  // through a gold ring: 1 RF from the pool, and now the fight prompt shows real numbers
  await p.evaluate(() => window.__poke((w, me) => { const g = w.rings.find(g => !g.ev && g.back <= w.t); me.x = g.x; me.y = g.y; me.z = g.z; })); await p.waitForTimeout(300);
  const s5 = await st(p);
  await p.evaluate(() => window.__poke((w, me) => { const o = window.__o; o.shield = 0; me.shield = 0; me.x = o.x + 8; me.y = o.y; me.z = o.z; })); await p.waitForTimeout(300);
  const fight = await p.evaluate(() => document.getElementById("prompt").textContent); await p.screenshot({ path: `${out}/d-free-prompt.png` });
  line(s5.me.stake === 1 && s5.run.rings >= 1 && s5.balanced && /\+\d+ RF/.test(fight) && /−1 RF/.test(fight), "a gold ring pays 1 RF out of the pool, and then the fight prompt shows what is really at stake", `carried ${s5.me.stake} RF, rank points ${s5.rp} | "${fight}"`);
  await p.keyboard.press("Escape"); await p.waitForTimeout(600); const a = await st(p); await p.waitForTimeout(700); const c = await st(p);
  line(c.t - a.t === 0 && await p.evaluate(() => !document.getElementById("pause").hidden && document.querySelectorAll("#pauseQuests .quest").length === 3), "Esc pauses the sky and shows today's quests", `world clock moved ${(c.t - a.t).toFixed(3)} s`);
  await p.screenshot({ path: `${out}/d-pause.png` }); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  line(!(await st(p)).paused, "Enter resumes");
  await p.close();
}
{ // a bot flight with a stake and two shop items: fights, dares, a quest, rank points, the result and the record
  const p = await open("test&auto&go&stake=25&items=magnet,insure&fights=4&miss=0.02&dare&quests=wins,rings,dares&day=2026-01-01"); const got = {}, want = { lead: [-2.6, -2.1], call: [2.2, 2.8], gap: [5.4, 5.9], echo: [10, 10.6] };
  const first = await until(async () => { const s = await st(p); return s.me ? s : null; }, 15000);
  line(first.me.magnet && first.me.insured && first.purse === 1000 - 25 - 15 && first.burnt === 15 && first.books.brought === 25 && first.balanced, "took off with 25 RF, a ring magnet and insurance: purse down by 40, 15 of it burned in the shop", `purse ${first.purse} RF, burned by you ${first.burnt} RF, brought into the sky ${first.books.brought} RF`);
  await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/d-hud.png` });
  const t0 = Date.now(); let done = false, off = 0, n = 0, wheel = false, ev = false;
  while (Date.now() - t0 < 300000) {
    const s = await st(p); n++; if (!s.balanced) off++;
    if (s.landed) { done = true; break; }
    if (s.wheel && !wheel) { wheel = true; await p.waitForTimeout(900); await p.screenshot({ path: `${out}/d-wheel-bot.png` }); }
    if (s.event && !ev && !s.D && !s.wheel) { ev = true; await p.screenshot({ path: `${out}/d-event.png` }); }
    if (s.D && !s.D.done) { const bb = s.now / SPB - s.D.b0; for (const [k, [lo, hi]] of Object.entries(want)) { const key = k + s.D.round; if (!got[key] && bb >= lo && bb <= hi) { got[key] = 1; await p.screenshot({ path: `${out}/d-${key}.png` }); } } }
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(600); await p.screenshot({ path: `${out}/d-result.png` });
  const s = await st(p), fights = s.record.filter(f => !f.dare), dares = s.record.filter(f => f.dare);
  line(done && Object.keys(got).length === 8, "the bot flew, fought and landed at the Roost", `landed in ${((Date.now() - t0) / 1000).toFixed(0)} s | fight phases seen ${Object.keys(got).join(",")} | ${fights.length} fights, ${dares.length} dares, wheel seen ${wheel}, event seen ${ev}`);
  line(off === 0, "the sky's books balanced at every look", `${n} looks | pool0 ${s.books.pool0} + brought ${s.books.brought} = pool ${s.books.pool} + carried ${s.books.carried} + monsters ${s.books.hoards} + burned ${s.books.burned} + home ${s.books.home}`);
  console.log(`      result: ${await p.textContent("#resKicker")} | ${await p.textContent("#resHead")} | ${await p.textContent("#resSub")}`);
  console.log(`      ${(await p.locator("#resStats dt").allTextContents()).map((k, i) => k).join(" / ")}`);
  console.log(`      ${(await p.locator("#resStats dd").allTextContents()).join(" / ")}`);
  const q = s.quests.filter(e => e.done), rankText = (await p.textContent("#resRank")).replace(/\s+/g, " ").trim();
  line(q.length >= 1 && s.run.quests >= 1, "a quest completed during the flight", s.quests.map(e => `${e.id} ${e.v}${e.done ? " done" : ""}`).join(", "));
  line(s.rp > 0 && s.rp === s.run.rp && /\+\d+/.test(rankText), "rank points were added and the result screen shows them", rankText);
  line(s.purse === 1000 - 25 - 15 + s.home, "the purse got back exactly what was landed", `1000 - 25 stake - 15 shop + ${s.home} landed = ${s.purse} RF`);
  await p.click("#logBtn3"); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/d-record.png` });
  const check = await p.textContent(".lgCheck"), listed = await p.locator(".lg > li").count();
  line(/matches/.test(check) && listed === s.record.length, "the record lists every fight and dare and its recount matches", `${check} | ${listed} entries`);
  await p.keyboard.press("Enter"); await p.waitForTimeout(200); await p.click("#homeBtn"); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/d-setup-after.png` });
  line(await fits(p) && (await st(p)).items.length === 0, "Change setup goes back to the setup screen; the shop items were for that one flight", (await p.textContent("#burnLine")).trim());
  await p.close();
}
{ // a monster's dare, from the prompt to the wheel to the record
  const p = await open("test&stake=25"); await p.waitForTimeout(900); await p.click("#goBtn"); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__poke((w, me) => { const m = w.monsters[0]; for (const o of w.monsters) if (o !== m) o.cool = Infinity; me.shield = 0; me.x = 300; me.z = -300; me.y = 120; m.x = me.x + 9; m.y = me.y + 2; m.z = me.z; m.target = me; m.state = "dare"; m.dareUntil = w.t + 8; m.line = 1; window.__m = m; }));
  await p.waitForTimeout(500); const prompt = await p.evaluate(() => [document.getElementById("prompt").textContent, document.getElementById("promptNo").textContent, document.querySelector(".tag.monster q:not([hidden])")?.textContent]);
  await p.screenshot({ path: `${out}/d-dare.png` });
  const before = await st(p), hoard = await p.evaluate(() => window.__m.hoard);
  await p.keyboard.press("KeyE"); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/d-wheel.png` });
  const mid = await p.evaluate(() => ({ shown: document.getElementById("stakeV").textContent, rows: document.querySelectorAll("#wheelOdds tr").length, title: document.getElementById("wheelTitle").textContent }));
  await p.waitForTimeout(2600); await p.screenshot({ path: `${out}/d-wheel-out.png` }); const after = await st(p), r = after.record.at(-1);
  line(/dare/i.test(prompt[0]) && /Q/.test(prompt[1]) && !!prompt[2], "a dare shows two clear choices and the monster's line", `"${prompt[0]}" / "${prompt[1]}" / says "${prompt[2]}"`);
  line(mid.rows === 7 && mid.shown === String(before.me.stake) && r?.dare && after.balanced && after.me.stake === before.me.stake + (r.dir > 0 ? r.gain : r.dir < 0 ? -r.amount : 0), "E spins the wheel: the odds are beside it, the coins only show once it stops, and the books balance", `${mid.title}, hoard ${hoard} RF, carried ${before.me.stake} RF -> outcome ${r?.k} (${r?.result}) ${r?.amount} RF moved, ${r?.burn} burned -> carried ${after.me.stake} RF`);
  await p.waitForTimeout(2200); await p.click("#logBtn"); await p.waitForTimeout(300); await p.screenshot({ path: `${out}/d-record-dare.png` });
  line(/matches/.test(await p.textContent(".lgCheck")) && await p.locator(".lg > li").count() === 1, "the dare is in the record with its odds, and the recount matches", (await p.textContent(".lg > li")).replace(/\s+/g, " ").trim());
  // and waving one off with Q moves nothing
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.evaluate(() => window.__poke((w, me) => { const m = window.__m; me.state = "fly"; me.shield = 0; m.hoard = Math.max(m.hoard, 0); if (m.hoard < 4) { m.hoard += w.take(10); } m.x = me.x + 9; m.y = me.y; m.z = me.z; m.target = me; m.state = "dare"; m.dareUntil = w.t + 8; }));
  await p.waitForTimeout(400); const b4 = await st(p); await p.keyboard.press("KeyQ"); await p.waitForTimeout(400); const af = await st(p);
  line(b4.dare != null && af.dare == null && af.me.stake === b4.me.stake && af.record.length === b4.record.length && af.balanced, "Q waves a dare off and nothing moves", `carried ${b4.me.stake} -> ${af.me.stake} RF`);
  await p.close();
}
{ // a phone in a fight
  const p = await open("test&auto&go&fights=1&stake=25", PHONE, true); await p.waitForTimeout(5000); await p.screenshot({ path: `${out}/d-m-fly.png` });
  await until(async () => { const s = await st(p); return s?.D && s.now / SPB - s.D.b0 > 5.5; }, 120000, 60);
  await p.screenshot({ path: `${out}/d-m-fight.png` });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); line(over === 0, "phone in a fight: no sideways overflow", `${over}px`); await p.close();
}
{ // no network for the online script: flying alone must work the same, and asking for a shared sky must say why it cannot
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c.route(/peerjs/, r => r.abort());
  const p = await c.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto(base + "?test"); await p.waitForTimeout(1500);
  const choice = await p.locator("#skySeg button").allTextContents();
  await p.click('#skySeg [data-v="create"]'); await p.waitForFunction(() => /could not load/.test(document.getElementById("skyMsg").textContent), null, { timeout: 8000 }).catch(() => {});
  const msg = (await p.textContent("#skyMsg")).trim(); await p.screenshot({ path: `${out}/d-sky-offline.png` });
  await p.click('#skySeg [data-v="alone"]'); await p.click("#goBtn"); await p.waitForTimeout(2500); const s = await st(p);
  line(/could not load/.test(msg) && s.role === "solo" && !!s.me, "without the online script: flying alone works, and asking for a sky says why it cannot", `[${choice.join(" | ")}] "${msg}" | ${s.riders} riders, carrying ${s.me?.stake} RF`);
  await c.close();
}
bad += await phoneChecks(b, out, errs);
console.log("errors:", errs.slice(0, 6));
console.log(bad || errs.length ? `\n${bad} check(s) failed, ${errs.length} page error(s)` : "\nall single-player checks passed");
await b.close(); process.exit(bad || errs.length ? 1 : 0);

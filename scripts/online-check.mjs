// Shared-sky check in real browsers: a host and two guests (bots) in one sky over the real PeerJS broker.
// It prints what each device saw: the same riders, monsters, pool and events; fights between players ending the same
// on both devices, the crown's three quarters included; shop items applied by the host; a dare rolled by the host;
// carried coins matching the host's; the host's books balancing; forfeit, the away shield, the rejoin path.
//   node scripts/online-check.mjs [folder for screenshots]
import { chromium } from "playwright";
const out = process.argv[2] || null, base = "http://localhost:8827/";
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const errs = []; let bad = 0;
const line = (ok, name, note = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"}  ${name}${note ? "  |  " + note : ""}`); };
const mk = async (who, q) => {
  const c = await b.newContext({ viewport: { width: 1000, height: 640 } });
  const p = await c.newPage(); p.on("pageerror", e => errs.push(`${who}: ${e.message}`)); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(`${who}: ${m.text()}`));
  await p.goto(base + "?" + q); return p;
};
const st = p => p.evaluate(() => window.__sky && window.__sky()).catch(() => null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms, step = 200) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const shot = (p, name) => out ? p.screenshot({ path: `${out}/o-${name}.png` }) : null;
const books = s => `pool0 ${s.books.pool0} + brought ${s.books.brought} = pool ${s.books.pool} + carried ${s.books.carried} + monsters ${s.books.hoards} + burned ${s.books.burned} + home ${s.books.home}`;

// 1. the host opens a sky and takes off; two guests join with its code, one of them with shop items
const host = await mk("host", "test&auto&go&host&stake=25&hunt=cpu&fights=99&dare&name=Hana");
const opened = await until(async () => { const s = await st(host); return s?.role === "host" && s.code && s.myId ? s : null; }, 30000);
if (!opened) { console.log("FAIL  the host could not open a sky (PeerJS broker unreachable, or the script did not load). Nothing else was tested."); console.log("errors:", errs); await b.close(); process.exit(1); }
const code = opened.code; console.log(`sky ${code} opened by the host, flying as rider ${opened.myId}`);
let g1 = await mk("guest1", `test&auto&go&room=${code}&stake=25&items=insure,magnet,bogus&hunt=cpu&fights=99&miss=0.02&dare&name=Bo`);
const g2 = await mk("guest2", `test&auto&go&room=${code}&stake=25&hunt=cpu&fights=99&miss=0.5&name=Cy`);
const pages = [["host", host], ["guest1", g1], ["guest2", g2]];
const flying = await until(async () => { const s = await Promise.all([st(g1), st(g2)]); return s.every(x => x?.role === "guest" && x.myId) ? s : null; }, 40000);
line(!!flying, "both guests joined with the code and took off", flying ? `guest1 is rider ${flying[0].myId}, guest2 is rider ${flying[1].myId}` : "a guest never got into the sky");
if (!flying) { console.log("errors:", errs); await b.close(); process.exit(1); }
const id1 = flying[0].myId; let id2 = flying[1].myId;

// 2. all three see the same sky
const seen = await until(async () => { const s = await Promise.all(pages.map(([, p]) => st(p))); return s.every(x => x && same(x.ids, s[0].ids) && Object.keys(x.humans).length === 3 && x.monsters.length === s[0].monsters.length && Math.abs(x.pool - s[0].pool) <= 3) ? s : null; }, 20000, 120);
line(!!seen, "all three devices see the same riders, monsters and pool", seen ? `${seen[0].riders} riders (3 players + ${seen[0].riders - 3} computer riders), ${seen[0].monsters.length} monsters, pool ${seen.map(x => x.pool).join(" / ")} RF, people listed ${seen.map(x => x.people).join("/")}` : (await Promise.all(pages.map(([, p]) => st(p)))).map(x => `${x?.ids.length} riders, ${x?.monsters.length} monsters`).join(" | "));
const h0 = await st(host), it = h0.info[id1], own = (await st(g1));
line(it && it.insured && it.magnet && same(it.items, ["insure", "magnet"]) && own.purse === 1000 - 25 - 15 && own.burnt === 15 && h0.books.brought === 75, "a guest's shop items were applied by the host (and one it does not sell was dropped)", `host has guest1 with ${JSON.stringify(it?.items)} | guest1's purse 1000 - 25 - 15 = ${own.purse} RF | stakes brought into the sky ${h0.books.brought} RF`);
await shot(g1, "guest-flying");

// sampling: every look compares each guest's coins with the host's and checks the host's books
let samples = 0, stakeBad = 0, bookBad = 0, pvpShot = false, beatOff = Infinity; const t0 = Date.now();
const look = async () => {
  let s = await Promise.all(pages.map(([, p]) => st(p)));
  const off = x => x.slice(1).some(g => g && g.myId != null && g.me && !g.wheel && x[0].humans[g.myId] !== g.me.stake);
  if (off(s)) { await sleep(400); s = await Promise.all(pages.map(([, p]) => st(p))); if (off(s)) stakeBad++; }   // a settlement can be one snapshot away
  samples++; if (!s[0].balanced) bookBad++;
  if (!pvpShot && s[1].D?.pvp && !s[1].D.done) { pvpShot = true; await shot(g1, "guest-pvp"); await shot(host, "host-during-pvp"); }
  if (s[0].D?.pvp && !s[0].D.done) for (let k = 0; k < 3; k++) {   // in a fight between the host and a guest, how far apart are the two song clocks? (best of a few looks, since the two readings are not taken at the same instant)
    const gi = s[1].D?.pvp ? 1 : s[2].D?.pvp ? 2 : 0; if (!gi) break;
    const [h, g] = await Promise.all([st(host), st(pages[gi][1])]); if (h?.D && g?.D) beatOff = Math.min(beatOff, Math.abs(h.now - g.now));
  }
  return s;
};
const fly = async (ms, done) => { const t1 = Date.now(); while (Date.now() - t1 < ms) { const s = await look(); if (await done(s)) return s; await sleep(400); } return null; };
const aim = (h, a, c) => Promise.all([[host, h], [g1, a], [g2, c]].map(([p, v]) => p.evaluate(v => { window.__hunt = v; }, v).catch(() => {})));

// 3. a world event: started on the host, seen by all three
await host.evaluate(() => window.__poke(w => { w.nextEvent = w.t + 0.5; }));
const ev = await fly(15000, s => s.every(x => x.event) && s.every(x => x.event.type === s[0].event.type && x.event.isl === s[0].event.isl));
line(!!ev, "a world event is seen by all three", ev ? `${ev[0].event.type} over island ${ev[0].event.isl}, ${ev.map(x => x.event.up).join("/")} rings up, ${ev.map(x => x.event.left.toFixed(0)).join("/")} s left` : "not on every device");
await shot(g2, "guest-event");

// 4. the crown: guest2 is given the most (out of the pool, so the books stay straight), then guest1 goes for it
await aim("cpu", "Cy", "Bo");
await host.evaluate(id => window.__poke(w => { const r = w.riders.find(x => x.id === id); r.stake += w.take(160); for (const o of w.riders) if (!o.human) { o.rest = w.t + 150; o.goal = null; } }), id2);   // and the computer hunters rest a while, so the crown is still there when guest1 arrives
const crowned = await fly(8000, s => s.every(x => x.crown === id2));
line(!!crowned, "the rider carrying the most wears the crown on every device", crowned ? `rider ${id2} with ${crowned[0].crownStake} RF` : (await Promise.all(pages.map(([, p]) => st(p)))).map(x => x.crown).join("/"));
const crownIt = () => host.evaluate(id => window.__poke(w => { const r = w.riders.find(x => x.id === id), top = Math.max(...w.riders.map(x => x.stake)); if (r && w.crown !== r) r.stake += w.take(top - r.stake + 60); for (const o of w.riders) if (!o.human) { o.rest = w.t + 150; o.goal = null; } }), id2);
await fly(170000, async s => { if (s[1].record.some(f => f.pvp && f.crown && f.amount > 0 && s[2].record.some(h => h.fid === f.fid))) return true; if (s[0].crown !== id2 && !s[2].D) await crownIt(); return false; });   // they fight until the crown has fallen once (a draw moves nothing)
// 5. the host against a guest (both are given something to fight over, out of the pool, and the computer hunters rest)
const fund = ids => host.evaluate(ids => window.__poke(w => { for (const r of w.riders) { if (ids.includes(r.id) && r.stake < 30) r.stake += w.take(30); if (!r.human) { r.rest = w.t + 150; r.goal = null; } } }), ids);
await fund([opened.myId, id1]); await aim("Bo", "Hana", "cpu"); await fly(110000, s => s[0].record.some(f => f.pvp && s[1].record.some(h => h.fid === f.fid)));
// 6. a dare: the host's monster dares guest1, guest1 takes it, the host rolls
await aim("cpu", "cpu", "cpu");
for (let k = 0; k < 4; k++) {   // (a hunter may pick a fight with guest1 at the same moment, which calls the dare off: then once more)
  await until(async () => { const s = await st(g1); return s.me?.state === "fly" && !s.D && !s.wheel && s.me.shield <= 0; }, 40000, 100);
  await host.evaluate(id => window.__poke(w => { const r = w.riders.find(x => x.id === id), m = w.monsters.find(x => x.state === "roam") || w.monsters[0] || w.spawnMonster(); if (m.hoard < 8) m.hoard += w.take(20); m.x = r.x + 9; m.y = r.y + 2; m.z = r.z; m.target = r; m.state = "dare"; m.dareUntil = w.t + 8; }), id1);
  if (await fly(12000, s => s[1].record.some(f => f.dare))) break;
}
// 7. and the guests against computer riders
await fly(70000, s => s.slice(1).every(x => x.record.some(f => !f.pvp && !f.dare)));
console.log(`flew for ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await sleep(2500);
const end = await Promise.all(pages.map(([, p]) => st(p)));
// a fight between two players is in both players' records under the same number
const byFid = new Map(); end.forEach((x, i) => x.record.filter(f => f.pvp).forEach(f => { if (!byFid.has(f.fid)) byFid.set(f.fid, []); byFid.get(f.fid).push({ who: pages[i][0], ...f }); }));
const pairs = [...byFid.values()].filter(v => v.length === 2);
line(pairs.length > 0, "fights between two players happened", `${pairs.length} seen from both sides, ${pairs.filter(v => v[0].amount > 0).length} of them moved coins`);
let agree = 0;
for (const [x, y] of pairs) {
  const ok = same(x.hits, y.hits) && same(x.ids, y.ids) && x.amount === y.amount && x.burn === y.burn && x.gain === y.gain && x.crown === y.crown && x.share === y.share && ((x.result === "draw" && y.result === "draw") || (x.result === "won" && y.result === "lost") || (x.result === "lost" && y.result === "won"));
  if (ok) agree++;
  console.log(`      fight ${x.fid}: ${x.who} says hits ${x.hits.join(":")} ${x.result} ${x.amount} RF moved${x.crown ? " (crown, share " + x.share + ")" : ""} | ${y.who} says hits ${y.hits.join(":")} ${y.result} ${y.amount} RF moved${y.crown ? " (crown, share " + y.share + ")" : ""}${ok ? "" : "   <- differ"}`);
}
line(pairs.length > 0 && agree === pairs.length, "both devices end every such fight with the same hits, winner, share and coins", `${agree} of ${pairs.length} agree`);
line(pairs.some(v => v.every(x => x.who !== "host")), "a fight between the two guests, refereed by the host's device, which was not in it", `${pairs.filter(v => v.every(x => x.who !== "host")).length} such fights, ${pairs.filter(v => v.some(x => x.who === "host")).length} with the host in them`);
line(pairs.some(v => v[0].crown && v[0].share === 0.75 && v[0].amount > 0), "the crowned rider was beaten for three quarters, and both devices say so", pairs.filter(v => v[0].crown && v[0].amount > 0).map(v => `${v[0].amount} RF at share ${v[0].share}`).join(", ") || "the crowned rider never lost a fight to a player in this run");
line(beatOff < 0.06, "the two devices in a fight are on the same beat", beatOff === Infinity ? "no fight with the host in it was caught in progress" : `song clocks ${(beatOff * 1000).toFixed(0)} ms apart (a beat is 484 ms)`);
const dr = end[1].record.filter(f => f.dare);
line(dr.length > 0, "a monster's dare taken by a guest was rolled by the host", dr.map(f => `outcome ${f.k} (${f.result}), ${f.amount} RF moved, ${f.burn} burned`).join("; ") || "guest1 has no dare in its record");
line(end.slice(1).every(x => x.record.some(f => !f.pvp && !f.dare)), "guests also fought computer riders, settled by the host", end.slice(1).map((x, i) => `guest${i + 1}: ${x.record.filter(f => !f.pvp && !f.dare).length}`).join(", "));
line(stakeBad === 0, "each device carries what the host says it carries", `${samples} looks, ${stakeBad} mismatches | now host ${JSON.stringify(end[0].humans)}, guest1 ${end[1].me?.stake}, guest2 ${end[2].me?.stake}`);
line(bookBad === 0 && end[0].balanced, "the host's books balance all the way", `${books(end[0])} (${bookBad} bad looks)`);
console.log(`      rank points and quests are kept on each device: guest1 ${end[1].rp} points, quests ${end[1].quests.map(q => `${q.id} ${q.v}${q.done ? " done" : ""}`).join(", ")}`);

// 8. the menu does not stop a shared sky; guest1 lands from it
await until(async () => { const s = await st(g1); return s.me && s.me.state === "fly" && !s.D && !s.wheel; }, 40000, 100);
await g1.keyboard.press("Escape"); await g1.waitForTimeout(300);
const m1 = await st(g1); await g1.waitForTimeout(900); const m2 = await st(g1);
line(m1.menu && !m1.paused && m2.t - m1.t > 0.5, "Esc opens the menu and the sky keeps moving", `menu open ${m1.menu}, paused ${m1.paused}, sky clock moved ${(m2.t - m1.t).toFixed(2)} s`);
await shot(g1, "guest-menu");
const before = await st(host), carried = before.humans[id1];
if (!(await st(g1)).menu) { await until(async () => { const s = await st(g1); return s.me && !s.D && !s.wheel; }, 40000, 100); await g1.keyboard.press("Escape"); await g1.waitForTimeout(200); }
await g1.click("#quitBtn");
const landed = await until(async () => { const s = await st(g1); return s.landed ? s : null; }, 10000);
const gone = await until(async () => { const s = await Promise.all([st(host), st(g2)]); return s.every(x => !x.ids.includes(id1)) ? s : null; }, 10000);
line(!!landed && !!gone && landed.home === Math.min(25, carried), "a guest who leaves by the menu, away from the Roost, keeps only what it brought, and disappears from the other skies", landed ? `guest1 brought 25 RF, carried ${carried} RF, kept ${landed.home} RF; the rest went back to the pool` : "guest1 did not land");
await shot(g1, "guest-landed");
const hb = await st(host); line(hb.balanced, "books balance after the landing", books(hb));

// 9. guest1 takes off again, then its own link drops: it is told the truth and offered the way back in
await g1.click("#againBtn"); const again = await until(async () => { const s = await st(g1); return s.me ? s : null; }, 10000);
line(!!again, "a landed guest can take off again into the same sky", again ? `now rider ${again.myId} carrying ${again.me.stake} RF` : "did not take off");
await until(async () => { const s = await st(g1); return s.me?.state === "fly" && !s.D && !s.wheel && s.me.shield > 1.5; }, 40000, 50);   // not in a fight (that would be a forfeit), and shielded so none starts
const had = (await st(g1)).me?.stake, purse0 = (await st(g1)).purse;
await g1.evaluate(() => window.__net().links.get("host").c.close());
const lost = await until(async () => { const s = await st(g1); return s.role === "solo" && s.landed ? s : null; }, 20000);
const rejoinText = lost ? (await g1.textContent("#rejoinBtn")).trim() : "", kicker = lost ? (await g1.textContent("#resKicker")).trim() : "";
line(!!lost && lost.why === "lost" && /lost/i.test(kicker) && rejoinText.includes(code) && lost.purse === purse0 + had, "a guest whose own link drops is told so, keeps what it carried, and is offered a rejoin", lost ? `"${kicker}" | carried ${had} RF, purse ${purse0} -> ${lost.purse} RF | button "${rejoinText}"` : "guest1 did not notice");
await shot(g1, "guest-lost");
const offHost = await until(async () => { const s = await st(host); return !s.ids.includes(again.myId) ? s : null; }, 20000);
line(!!offHost && offHost.balanced, "the host takes that rider out of its sky and the books balance", offHost ? books(offHost) : "still there after 20 s");
await g1.click("#rejoinBtn");
const backNote = await until(async () => (await g1.textContent("#resNet")).trim(), 3000, 50) || "";
const back = await until(async () => { const s = await st(g1); return s.role === "guest" ? s : null; }, 25000);
if (back && !back.me && !(await st(g1)).me) await g1.click("#againBtn").catch(() => {});   // (the bot takes off by itself as soon as it is back in)
const re = await until(async () => { const s = await st(g1); return s.me ? s : null; }, 10000);
line(!!back && !!re, "one tap rejoins the same sky and takes off into it again", back ? `${backNote ? `"${backNote}" | ` : ""}now rider ${re?.myId} carrying ${re?.me.stake} RF` : "did not rejoin");

// 10. forfeit: guest2's browser goes away in the middle of a fight with the host
if (!(await st(g2)).me) { await g2.click("#againBtn").catch(() => {}); const s = await until(async () => { const x = await st(g2); return x.me ? x : null; }, 10000); if (s) id2 = s.myId; }   // (guest2 plays badly on purpose and may have been knocked out: then it flies again)
await fund([opened.myId, id2]); await aim("Cy", "cpu", "Hana");
const inFight = await until(async () => { const [h, g] = await Promise.all([st(host), st(g2)]); return h.D?.pvp && !h.D.done && g.D?.pvp && !g.D.done ? h : null; }, 120000, 150);
const stake2 = inFight ? (await st(host)).humans[id2] : 0, n0 = inFight ? (await st(host)).record.length : 0;
if (inFight) await g2.context().close();
const forf = inFight ? await until(async () => { const s = await st(host); return s.record.length > n0 ? s : null; }, 25000) : null, fr = forf?.record.at(-1);
line(!!fr && fr.forfeit && fr.result === "won" && fr.amount > 0 && forf.balanced && !forf.ids.includes(id2), "a player who leaves in the middle of a fight forfeits: the one who stays takes the normal share", fr ? `guest2 carried ${stake2} RF and left mid-fight: the host took ${fr.amount} RF (${fr.burn} burned), share ${fr.share} | ${books(forf)}` : inFight ? "the host's fight did not end as a forfeit" : "no fight between the host and guest2 started in time");
await aim("cpu", "cpu", "cpu");

// 11. a guest in a background tab sends no pose: shielded after a few seconds, landed with what it carries if it stays away
await until(async () => { const s = await st(g1); return s.me?.state === "fly" && !s.D && !s.wheel; }, 40000, 100);
const awayId = (await st(g1)).myId; await g1.evaluate(() => { window.requestAnimationFrame = () => 0; });   // what a hidden tab does: no more frames, but the link stays up
const shielded = await until(async () => { const s = await st(host); return s.away.includes(awayId) && s.info[awayId].shield > 0 ? s : null; }, 15000);
line(!!shielded, "a guest that goes quiet is shielded, so it is nobody's free target", shielded ? `after about 4 s: away, shield ${shielded.info[awayId].shield.toFixed(1)} s and held there` : "not marked away");
const awayStake = shielded?.humans[awayId], awayLanded = await until(async () => { const s = await st(g1); return s.landed && s.why === "away" ? s : null; }, 60000, 500);
const hz = await st(host);
line(!!awayLanded && awayLanded.home === Math.min(25, awayStake) && !hz.ids.includes(awayId) && hz.balanced, "and if it stays quiet it is landed, keeping what it brought", awayLanded ? `"${(await g1.textContent("#resKicker")).trim()}" with ${awayLanded.home} RF (brought 25, the host had it at ${awayStake} RF)` : "still in the sky after 60 s");

// 12. the host leaves: a guest in the sky is told it has closed and lands with what it carries
await g1.context().close();
g1 = await mk("guest1b", `test&auto&go&room=${code}&stake=10&hunt=cpu&fights=99&name=Bo`);
const up = await until(async () => { const s = await st(g1); return s?.me ? s : null; }, 30000);
await g1.waitForTimeout(1500); const hadB = (await st(g1))?.me?.stake, purseB = (await st(g1))?.purse;
await host.evaluate(() => window.dispatchEvent(new Event("pagehide"))); await host.context().close();
const closed = await until(async () => { const s = await st(g1); return s.role === "solo" && s.landed ? s : null; }, 20000);
line(!!up && !!closed && closed.why === "closed" && closed.purse === purseB + hadB, "when the host leaves, the guest is told the sky has closed and is landed with what it carries", closed ? `"${(await g1.textContent("#resKicker")).trim()}" | carried ${hadB} RF, purse ${purseB} -> ${closed.purse} RF | rejoin offered: ${!(await g1.evaluate(() => document.getElementById("rejoinBtn").hidden))}` : "guest still thinks the sky is open");
console.log("errors:", errs.slice(0, 8));
console.log(bad || errs.length ? `\n${bad} check(s) failed, ${errs.length} page error(s)` : "\nall online checks passed");
await b.close(); process.exit(bad || errs.length ? 1 : 0);

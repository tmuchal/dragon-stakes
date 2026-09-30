// Headless checks of the rules: every dragon's numbers really change how it flies, every shop item and the crown
// really change an outcome, the dare wheel pays what its table says, and no coin appears or vanishes:
//   pool at start + stakes brought by players = pool now + carried by riders + held by monsters + burned + taken home
import { readFileSync } from "node:fs";
import { World, DRAGONS, KINDS, DARE, HOARDS, RING_R, CEIL, spoils } from "../js/world.js";
const cast = JSON.parse(readFileSync(new URL("../friends.json", import.meta.url), "utf8")).map(f => ({ ...f, hash: f.id }));
const seed = "a3f1c2d4e5f60718293a4b5c6d7e8f90", dt = 1 / 60, still = { turn: 0, climb: 0, throttle: 0 };
let fail = 0; const line = (ok, name, note) => { if (!ok) fail++; console.log(`${ok ? "통과" : "실패"}  ${name}  ${note}`); };
const quiet = (s = seed, pool) => { const w = new World(s, cast, pool); w.wantRivals = 0; w.wantMonsters = 0; w.nextEvent = Infinity; return w; };   // an empty sky: no computer riders, monsters or events
const solo = (kind, stake = 50, items = []) => { const w = quiet(); w.th0 = w.thermals[0]; w.thermals = []; const r = w.addRider(cast[0], stake, true, kind, items); r.x = 200; r.z = 200; r.y = 100; r.yaw = 0; r.speed = DRAGONS[kind].cruise; r.shield = 0; return [w, r]; };
const run = (w, r, c, secs) => { for (let i = 0; i < secs / dt; i++) w.fly(r, c, dt); };
const book = w => { const b = w.books; return `처음 풀 ${b.pool0} + 들고 온 ${b.brought} = 지금 풀 ${b.pool} + 라이더 ${b.carried} + 몬스터 ${b.hoards} + 소각 ${b.burned} + 들고 내린 ${b.home}`; };

// ---------- the six dragons ----------
const rows = {};
for (const kind of KINDS) {
  let [w, r] = solo(kind); run(w, r, { turn: 1, climb: 0, throttle: 0 }, 1); const turned = Math.abs(r.yaw) * 180 / Math.PI;
  [w, r] = solo(kind); run(w, r, { turn: 0, climb: -1, throttle: 0 }, 1.5); const dive = r.speed;
  run(w, r, still, 3); const kept = r.speed - DRAGONS[kind].cruise;
  [w, r] = solo(kind); run(w, r, still, 5); const sink = (100 - r.y) / 5;
  [w, r] = solo(kind); run(w, r, { turn: 0, climb: 1, throttle: 0 }, 2); const rise = r.y - 100;
  [w, r] = solo(kind); const th = w.th0; w.thermals = [th]; r.x = th.x; r.z = th.z; r.y = 80; r.speed = 0.0001; w.fly(r, { turn: 0, climb: 0, throttle: -2.2 }, dt); const lift = (r.y - 80) / dt;
  [w, r] = solo(kind); const g = w.rings[0]; r.x = g.x; r.y = g.y; r.z = g.z; w.step(dt, still); const ring = r.stake - 50;
  [w, r] = solo(kind); const o = w.addRider(cast[1], 50, false, "ember"); w.settle(r, o); const shield = r.shield;
  rows[kind] = { "1초에 도는 각": turned.toFixed(0) + "°", "1.5초 급강하 속도": dive.toFixed(1), "3초 뒤 남은 속도": "+" + kept.toFixed(1), "손 떼면 침하/초": sink.toFixed(2), "2초 상승 높이": rise.toFixed(1), "기류 상승/초": lift.toFixed(1), "링 RF": ring, "보호막 초": shield };
}
console.table(rows);
const num = (k, f) => parseFloat(rows[k][f]);
line(KINDS.every(k => k === "wyvern" || num("wyvern", "1.5초 급강하 속도") > num(k, "1.5초 급강하 속도") + 2), "서리 와이번이 급강하가 가장 빠르다", rows.wyvern["1.5초 급강하 속도"]);
line(KINDS.every(k => k === "lung" || num("lung", "1초에 도는 각") > num(k, "1초에 도는 각") + 10), "폭풍 용이 가장 급하게 돈다", rows.lung["1초에 도는 각"]);
line(KINDS.every(k => k === "lung" || num("lung", "2초 상승 높이") > num(k, "2초 상승 높이") + 6), "폭풍 용이 가장 빨리 오른다", `${rows.lung["2초 상승 높이"]} · 기본 ${rows.ember["2초 상승 높이"]}`);
line(KINDS.every(k => Math.abs(num(k, "손 떼면 침하/초")) < 0.05), "손을 떼면 어느 드래곤도 가라앉지 않는다", KINDS.map(k => rows[k]["손 떼면 침하/초"]).join(" / "));
line(rows.bone["보호막 초"] === 14 && rows.ember["보호막 초"] === 8, "뼈 와이엄의 보호막이 14초다", `${rows.bone["보호막 초"]}초 / 기본 ${rows.ember["보호막 초"]}초`);
line(rows.gold["링 RF"] === 2 && rows.ember["링 RF"] === 1, "황금 수집가는 링 하나에 2 RF", `${rows.gold["링 RF"]} / 기본 ${rows.ember["링 RF"]}`);
line(KINDS.every(k => k === "jade" || num("jade", "기류 상승/초") > num(k, "기류 상승/초") + 3) && KINDS.every(k => k === "jade" || num("jade", "3초 뒤 남은 속도") > num(k, "3초 뒤 남은 속도") + 2), "비취 깃털뱀이 기류를 가장 잘 타고 속도를 가장 오래 지킨다", `${rows.jade["기류 상승/초"]} · ${rows.jade["3초 뒤 남은 속도"]}`);

// ---------- easier flying ----------
{
  // straight at the tallest island from low down, hands off: the dragon pulls up and never touches the hillside
  const w = quiet(), s = w.islands.slice(1).sort((a, b) => b.h - a.h)[0], r = w.addRider(cast[0], 0, true, "ember");
  const sd = Math.hypot(s.x, s.z), k0 = (sd - s.r - 60) / sd; r.x = s.x * k0; r.z = s.z * k0; r.y = 8; r.yaw = Math.atan2(s.x, s.z); r.pitch = 0; let scrape = 0, top = 0;   // from the Roost side, straight at it let scrape = 0, top = 0;
  for (let i = 0; i < 8 / dt; i++) { w.fly(r, still, dt); const gap = r.y - Math.max(w.heightAt(r.x, r.z), 0); if (gap < 2.45) scrape++; top = Math.max(top, r.y); }
  line(scrape === 0 && top > s.h, "언덕 앞에서 알아서 고개를 든다", `높이 ${s.h.toFixed(0)}짜리 섬을 손 떼고 넘음 · 최고 ${top.toFixed(0)} · 땅에 닿은 프레임 ${scrape}`);
  const [w2, r2] = solo("ember"); r2.pitch = 0.46; run(w2, r2, still, 1); const levelled = Math.abs(r2.pitch) < 0.02;
  const [w3, r3] = solo("ember"); run(w3, r3, { turn: 0, climb: 1, throttle: 0 }, 0.35); const quick = r3.pitch;
  line(levelled && quick > 0.35, "키를 놓으면 수평을 잡고, 누르면 바로 반응한다", `놓고 1초 뒤 기울기 ${r2.pitch.toFixed(3)} · 누르고 0.35초 뒤 ${quick.toFixed(2)} (목표 0.46)`);
  // the stick is analog: half a push is about half a climb, and a full push is what the key gives
  const pitchAt = c => { const [w, r] = solo("ember"); run(w, r, { turn: 0, climb: c, throttle: 0 }, 1.5); return r.pitch; }, ph = [0.25, 0.5, 1, -0.5, -1].map(pitchAt);
  line(ph[0] > 0.08 && ph[0] < ph[1] && ph[1] < ph[2] && Math.abs(ph[1] / ph[2] - 0.5) < 0.06 && ph[3] < 0 && ph[4] < ph[3], "스틱은 민 만큼만 오르내린다", `1/4·1/2·끝까지 밀었을 때 기울기 ${ph.slice(0, 3).map(x => x.toFixed(2)).join(" · ")} · 아래로 ${ph.slice(3).map(x => x.toFixed(2)).join(" · ")}`);
  // up is about as quick as down now
  const vyOf = c => { const [w, r] = solo("ember"); run(w, r, { turn: 0, climb: c, throttle: 0 }, 1); const y0 = r.y; run(w, r, { turn: 0, climb: c, throttle: 0 }, 1); return r.y - y0; }, upV = vyOf(1), downV = vyOf(-1);
  line(upV > 18 && upV / -downV > 0.6, "오르는 속도가 내려가는 속도와 비슷하다", `초당 +${upV.toFixed(1)} / ${downV.toFixed(1)}`);
  // over the Roost a player's dragon slows, so the chance to land lasts
  { const w = quiet(), r = w.addRider(cast[0], 10, true, "ember"); r.x = -120; r.z = 0; r.y = 120; r.yaw = Math.PI / 2; r.speed = 30; let inside = 0; for (let i = 0; i < 20 / dt; i++) { w.fly(r, still, dt); if (w.canLand(r)) inside += dt; }
    line(inside > 4, "둥지 위에서는 느려져서 내릴 시간이 넉넉하다", `둥지를 가로지르는 동안 내릴 수 있는 시간 ${inside.toFixed(1)}초 (전에는 1.7초)`); }
  const [w4, r4] = solo("ember"); w4.colliders = [{ x: 200, z: 240, r: 8, top: 140 }]; let inside = 0;
  for (let i = 0; i < 3 / dt; i++) { w4.fly(r4, still, dt); if (Math.hypot(r4.x - 200, r4.z - 240) < 8) inside++; }
  line(inside === 0 && r4.z > 245, "높은 구조물은 옆으로 비켜 지나간다", `기둥 안에 들어간 프레임 ${inside} · 지나간 뒤 z ${r4.z.toFixed(0)}`);
  // the real landmarks from the view's scenery (no three.js in that file): fly level at every one of them from four sides
  const { landmarkColliders } = await import("../js/scenery-sites.js"); const w6 = quiet(); w6.colliders = landmarkColliders(w6); let hits = 0, tries = 0;
  for (const o of w6.colliders) for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, y = (o.base ?? Math.max(w6.heightAt(o.x, o.z), 0)) + (o.top - (o.base ?? Math.max(w6.heightAt(o.x, o.z), 0))) * 0.6; if (y > CEIL - 2) continue;
    const r = w6.addRider(cast[0], 0, true, "ember"); r.x = o.x - Math.sin(a) * (o.r + 50); r.z = o.z - Math.cos(a) * (o.r + 50); r.y = y; r.yaw = a; r.pitch = 0; tries++;
    for (let i = 0; i < 4 / dt; i++) { w6.fly(r, still, dt); if (r.y < o.top && r.y > (o.base ?? -Infinity) && Math.hypot(r.x - o.x, r.z - o.z) < o.r - 0.01) hits++; }
    w6.leave(r);
  }
  line(w6.colliders.length > 0 && hits === 0, "실제 지형지물 어디에도 파고들지 않는다", `구조물 ${w6.colliders.length}개 · 시도 ${tries}번 · 안에 들어간 프레임 ${hits} · 아래로 지나갈 수 있는 것 ${w6.colliders.filter(o => o.base != null).length}개`);
}

// ---------- the crown, and the shop ----------
{
  const w = quiet(), a = w.addRider(cast[0], 40, true, "ember"), b = w.addRider(cast[1], 100, true, "ember"), c = w.addRider(cast[2], 100, true, "ember", ["insure"]);
  w.step(dt, still); const first = w.drain().filter(e => e.type === "crown").length, wore = w.crown;
  const half = spoils(100), crown = w.spoilsOf(b), got = w.settle(a, b);
  line(wore === b && crown.crown && crown.amount === 75 && crown.burn === 4 && crown.gain === 71 && got.amount === 75 && a.stake === 111 && half.amount === 50, "왕관 쓴 라이더를 이기면 절반이 아니라 4분의 3", `왕관(100 RF) 패배: ${got.amount} 이동, ${got.burn} 소각, ${got.gain} 획득 · 보통은 ${half.amount}`);
  w.step(dt, still); const said = first;
  line(w.crown === a && a.crowned && !b.crowned && said === 1 && a.streak === 1 && b.streak === 0, "가장 많이 든 라이더(50 RF 이상)가 왕관을 쓰고, 연승이 센다", `왕관: ${w.crown?.stake} RF 든 라이더 · 알림 ${said}번 · 연승 ${a.streak}`);
  const ins = w.settle(a, c), second = w.spoilsOf(c);
  line(ins.insured && ins.amount === 34 && c.stake === 66 && !c.insured && second.amount === 33 && second.share === 0.5, "보험: 처음 지는 싸움에서 절반 대신 3분의 1만 잃는다", `100 RF에서 ${ins.amount} 잃음(보험 없으면 50) · 두 번째는 절반 ${second.amount}`);
  const lo = quiet(), p = lo.addRider(cast[0], 49, true, "ember"); lo.step(dt, still);
  line(lo.crown === null && !p.crowned, "50 RF 미만이면 왕관이 없다", `가장 많이 든 라이더 ${p.stake} RF`);
  // ring magnet: fly past a ring at 12 units. Without the magnet it is missed.
  const pass = items => { const [w, r] = solo("ember", 50, items); const g = w.rings[0]; r.x = g.x + 12; r.y = g.y; r.z = g.z - 40; r.yaw = 0; for (let i = 0; i < 3 / dt; i++) w.step(dt, still); return r.stake - 50; };
  const plain = pass([]), mag = pass(["magnet"]);
  line(plain === 0 && mag >= 1, "링 자석: 2.5배 거리에서 링을 얻는다", `링에서 12 떨어져 지나감(링 반경 ${RING_R}) · 자석 없이 +${plain} · 자석으로 +${mag}`);
  const w5 = quiet(), n0 = w5.addRider(cast[0], 50, true, "ember"), n1 = w5.addRider(cast[1], 50, true, "ember", ["start", "nonsense", "start"]);
  line(n0.shield === 5 && n1.shield === 20 && n1.items.length === 1, "빠른 출발: 이륙 보호막이 5초에서 20초로 (모르는 아이템은 무시)", `기본 ${n0.shield}초 · 아이템 ${n1.shield}초 · 받아들인 아이템 ${JSON.stringify(n1.items)}`);
  line(w.balanced && w5.balanced, "상점은 하늘 장부 밖이다: 아이템을 써도 장부가 맞는다", book(w));
}

// ---------- flying free: a rider with nothing ----------
{
  const w = quiet(), me = w.addRider(cast[0], 0, true, "ember"), o = w.addRider(cast[1], 50, false, "ember");
  for (const r of [me, o]) { r.shield = 0; r.y = 120; } me.x = 200; me.z = 200; o.x = 206; o.z = 200; o.mood = "hunter"; o.rest = 0;
  const cant = w.challenge(me, o), cant2 = w.challenge(o, me), near0 = w.near(me);
  for (let i = 0; i < 5 / dt; i++) { o.x = me.x + 6; o.y = me.y; o.z = me.z; w.step(dt, still); }     // a hunter sits right on the free flyer for five seconds
  const left = w.drain().filter(e => e.type === "challenge").length;
  line(!cant && !cant2 && near0 === null && left === 0 && me.state === "fly" && w.riders.includes(me), "빈손 라이더에게는 싸움을 걸 수 없고, 빈손으로는 걸 수도 없다", `건 싸움 ${cant} · 걸린 싸움 ${cant2} · 5초 붙어 있던 사냥꾼이 건 싸움 ${left}번 · 여전히 비행 중`);
  const g = w.rings[0]; me.x = g.x; me.y = g.y; me.z = g.z; o.x = g.x + 8; o.y = g.y; o.z = g.z; o.mood = "drifter"; o.goal = null; w.step(dt, still);
  const got = me.stake, can = w.challenge(me, o), out = w.settle(o, me);
  line(got === 1 && can && out.amount === 1 && me.stake === 0 && w.riders.includes(me) && w.spoilsOf(me).amount === 0, "링으로 1 RF를 모으면 싸울 수 있고, 다시 0이 되어도 계속 난다", `링 뒤 ${got} RF · 싸움 성립 ${can} · 진 뒤 ${me.stake} RF, 하늘에 남음 · 0 RF에서 잃을 몫 ${w.spoilsOf(me).amount}`);
  line(w.balanced && w.brought === 0, "빈손으로 들어와도 장부가 맞는다", book(w));
}

// ---------- world events ----------
{
  const w = quiet(); w.nextEvent = 1; const r = w.addRider(cast[0], 0, true, "ember"); r.shield = 0;
  for (let i = 0; i < 2 / dt; i++) w.step(dt, still);
  const e = w.event, up = e ? e.rings.filter(i => w.rings[i].back <= w.t).length : 0, before = w.pool;
  let paid = 0; if (e) for (const i of e.rings) { const g = w.rings[i]; r.x = g.x; r.y = g.y; r.z = g.z; r.state = "fly"; paid += w.takeRing(r, g); }
  w.step(dt, still); const ended = w.event === null, again = e ? w.claimRing(r, e.rings[0]) : -1;
  line(!!e && up === (e.type === "storm" ? 6 : 1) && paid === (e.type === "storm" ? 12 : 10) && before - w.pool === paid && ended && again === 0 && w.balanced, "이벤트 링은 풀에서 나오고, 다 가져가면 이벤트가 끝난다", `${e?.type}: 링 ${up}개, ${paid} RF 지급, 풀 ${before} → ${w.pool} · 끝난 뒤 다시 받기 ${again}`);
  const w2 = quiet(); w2.nextEvent = 1; for (let i = 0; i < 60 / dt; i++) w2.step(dt, still);
  const gone = w2.event === null && w2.rings.filter(g => g.ev).every(g => g.back === Infinity) && w2.nextEvent - w2.t > 20;
  line(gone, "아무도 안 가져가면 이벤트는 시간이 되어 사라진다", `60초 뒤 남은 이벤트 링 ${w2.rings.filter(g => g.ev && g.back <= w2.t).length}개 · 다음 이벤트까지 ${(w2.nextEvent - w2.t).toFixed(0)}초`);
}

// ---------- the pool ----------
{
  const w = quiet(seed, 3), r = w.addRider(cast[0], 0, true, "gold"); let got = 0;
  for (const g of w.rings.slice(0, 5)) got += w.takeRing(r, g);
  w.wantRivals = 3; w.wantMonsters = 2; w.nextEvent = 0; for (let i = 0; i < 5 / dt; i++) w.step(dt, still);
  line(got === 3 && w.pool === 0 && r.stake === 3 && w.riders.length === 1 && w.monsters.length === 0 && w.event === null && w.rings.every(g => g.back > w.t) && w.balanced, "풀이 바닥나면 아무것도 새로 나오지 않는다", `3 RF짜리 풀: 링 다섯 개에서 ${got} RF만 나옴 · 새 라이더 ${w.riders.length - 1} · 몬스터 ${w.monsters.length} · 떠 있는 링 ${w.rings.filter(g => g.back <= w.t).length}`);
}

// ---------- monsters and the dare ----------
{
  // the wheel, rolled 60,000 times against a fresh 40 RF hoard and a rider carrying 40 RF
  const N = 60000, count = DARE.map(() => 0), w = quiet(); let riderNet = 0, burned = 0, bad = 0;
  const r = w.addRider(cast[0], 40, true, "ember"); r.shield = 0;
  const m = { id: 1, kind: "imp", x: r.x, y: r.y, z: r.z, yaw: 0, hoard: 0, state: "roam", target: null, dareUntil: 0, home: 1, goal: null, think: 9, until: 0, cool: Infinity, line: 0, life: Infinity }; w.monsters.push(m);
  for (let i = 0; i < N; i++) {
    w.pool += m.hoard - 40; m.hoard = 40; w.brought += 40 - r.stake; r.stake = 40;   // reset both sides, keeping the books straight
    m.state = "dare"; m.target = r; r.state = "fly"; const b0 = w.burned, out = w.acceptDare(r, m);
    count[out.k]++; riderNet += r.stake - 40; burned += w.burned - b0; if (!w.balanced || r.stake < 0 || m.hoard < 0) bad++;
  }
  const share = count.map((c, k) => `${(c / N * 100).toFixed(1)}%(표 ${DARE[k].p * 100}%)`).join(" · "), okShare = count.every((c, k) => Math.abs(c / N - DARE[k].p) < 0.008);
  line(okShare && bad === 0, "돌림판은 표에 적힌 확률대로 나온다", share);
  console.log(`      내기 한 번의 기댓값 (보물 더미 40 RF, 든 코인 40 RF): 라이더 ${riderNet / N >= 0 ? "+" : ""}${(riderNet / N).toFixed(2)} RF, 소각 ${(burned / N).toFixed(2)} RF`);
  const ev = (h, c) => DARE.reduce((a, o) => a + o.p * (o.take ? spoils(h, o.take).gain : o.give ? -spoils(c, o.give).amount : 0), 0);
  console.log("      기댓값 표 (라이더 기준, RF): " + HOARDS.map(h => `더미 ${h}: ` + [0, 25, 50, 100].map(c => `${c} RF 들고 ${ev(h, c) >= 0 ? "+" : ""}${ev(h, c).toFixed(1)}`).join(", ")).join(" | "));
  console.log(`      몫으로 보면: 보물 더미의 +${(DARE.reduce((a, o) => a + o.p * (o.take || 0), 0) * 95).toFixed(1)}% (소각 뒤), 든 코인의 −${(DARE.reduce((a, o) => a + o.p * (o.give || 0), 0) * 100).toFixed(1)}%`);
  // nothing to lose, and an empty hoard
  const w2 = quiet(), z = w2.addRider(cast[0], 0, true, "ember"); z.shield = 0; let moved = 0, neg = 0;
  const m2 = { ...m, hoard: 0, id: 2 }; w2.monsters.push(m2);
  for (let i = 0; i < 4000; i++) { w2.pool += m2.hoard - 20; m2.hoard = 20; w2.brought -= z.stake; z.stake = 0; w2.brought += 0; m2.state = "dare"; m2.target = z; z.state = "fly"; const out = w2.acceptDare(z, m2); if (DARE[out.k].give && (out.amount || out.dir)) moved++; if (z.stake < 0 || !Number.isFinite(z.stake)) neg++; }
  line(moved === 0 && neg === 0, "빈손으로 내기를 받으면 잃는 결과에서 아무것도 움직이지 않는다", `잃는 결과가 나온 판 중 코인이 움직인 판 ${moved} · 음수나 NaN ${neg}`);
  // a whole sky for ten minutes: monsters arrive, taunt, dare computer riders, leave, and the pool takes back what they hold
  const w3 = new World(seed, cast); w3.wantRivals = 9; const seen = { taunt: 0, dare: 0, dared: 0, monster: 0, monsterGone: 0 }; let off = 0;
  for (let i = 0; i < 600 / dt; i++) {
    w3.step(dt, still); for (const r of w3.riders) if (r.state === "duel") w3.duelPose(r, dt);
    for (const e of w3.drain()) if (e.type in seen) seen[e.type]++;
    if (!w3.balanced) off++;
  }
  line(seen.monster >= 6 && seen.taunt > seen.dare && seen.dare >= 3 && seen.dared >= 1 && seen.monsterGone >= 1 && off === 0, "몬스터가 오가며 약 올리고 내기를 걸어도 장부가 맞는다", `10분: 등장 ${seen.monster} · 약 올림 ${seen.taunt} · 내기 ${seen.dare} · 받은 내기 ${seen.dared} · 떠남 ${seen.monsterGone} · 어긋난 프레임 ${off}`);
  // a player: a dare is only ever an offer
  const w4 = quiet(), p = w4.addRider(cast[0], 30, true, "ember"); p.shield = 0; p.x = 200; p.z = 200; p.y = 100;
  const m4 = { ...m, id: 3, hoard: 0, x: 200, y: 100, z: 210, cool: 0, think: 9 }; w4.pool -= 30; m4.hoard = 30; w4.monsters.push(m4);
  let dares = 0, stake0 = p.stake; for (let i = 0; i < 200 / dt && dares < 3; i++) { p.x = 200; p.z = 200; p.y = 100; m4.cool = Math.min(m4.cool, w4.t); m4.life = Infinity; w4.step(dt, still); p.state = "fly"; for (const e of w4.drain()) if (e.type === "dare") dares++; }
  const waved = w4.dareFor(p) ? w4.declineDare(p) : true;
  line(dares >= 1 && p.stake === stake0 && waved && w4.balanced, "플레이어에게 내기는 제안일 뿐이다: 받지 않으면 아무것도 움직이지 않는다", `내기 ${dares}번 제안 · 든 코인 ${stake0} → ${p.stake}`);
}

// ---------- a shared sky: riders flown on other devices, ring claims, forfeit ----------
{
  const w = quiet();
  const a = w.addRider(cast[0], 50, true, "ember"), b = w.addRider(cast[1], 25, true, "gold"), c = w.addRider(cast[2], 100, true, "jade"), cpu = w.addRider(cast[3], 50, false, "ember");
  b.remote = "peer-b"; c.remote = "peer-c";
  for (const r of [a, b, c, cpu]) { r.shield = 0; r.y = 120; } a.x = 200; a.z = 200; b.x = 210; b.z = 200; c.x = -200; c.z = 200; cpu.x = -210; cpu.z = 200; cpu.mood = "drifter"; cpu.bye = Infinity;
  const at = [b.x, b.y, b.z]; for (let i = 0; i < 120; i++) w.step(dt, still);
  line(b.x === at[0] && b.y === at[1] && b.z === at[2] && a.z !== 200, "다른 기기가 모는 라이더는 여기서 움직이지 않는다", `원격 (${b.x}, ${b.z}) 그대로 · 내 라이더 z 200 → ${a.z.toFixed(0)}`);
  const g = w.rings[0], far = w.claimRing(b, 0); b.x = g.x + 10; b.y = g.y; b.z = g.z; const near = w.claimRing(b, 0), again = w.claimRing(b, 0);
  line(far === 0 && near === 2 && again === 0 && b.stake === 27, "링 신청은 가까이 있을 때 한 번만 받아 준다", `멀리서 ${far} · 가까이서 ${near} · 다시 ${again} · 든 코인 ${b.stake}`);
  b.x = a.x + 5; b.y = a.y; b.z = a.z; const okAB = w.challenge(b, a), home0 = w.home;
  const goneB = w.leave(b), win = w.drain().find(e => e.type === "settled");            // a player drops out in the middle of a fight
  line(okAB && win && !win.draw && win.left && win.winner === a && win.amount === 14 && a.stake === 63 && goneB === 13 && w.home - home0 === 13 && a.state === "fly" && !w.riders.includes(b), "싸움 중에 나가면 기권패: 남은 쪽이 정해진 몫을 가져간다", `나간 쪽 27 RF 중 ${win?.amount} 이동(${win?.burn} 소각), ${goneB} RF만 들고 떠남 · 남은 쪽 50 → ${a.stake} RF`);
  const okC = w.challenge(c, cpu); w.settle(c, cpu); const pool0 = w.pool; w.leave(cpu); const back = w.pool - pool0; w.leave(c); w.leave(a); w.leave(a);   // leaving twice must not count twice
  line(okC && back === 25 && w.balanced && w.carried === 0, "컴퓨터 라이더가 떠나면 코인은 풀로, 플레이어가 떠나면 집으로", `컴퓨터 라이더 ${back} RF → 풀 · ${book(w)}`);
}

// ---------- ten minutes of a full sky ----------
const w = new World(seed, cast); const me = w.addRider(cast[0], 50, true, "ember"); let ai = 0, mine = 0, joins = 0, gone = 0, events = 0, bad = 0, far = 0, low = 0, off = 0, crowns = 0;
for (let i = 0; i < 600 / dt; i++) {
  w.step(dt, { turn: Math.sin(i / 300) * 0.5, climb: i % 900 < 200 ? 1 : i % 900 < 300 ? -1 : 0, throttle: 0.3 });
  if (!w.balanced || (w.crown && (w.crown.stake < 50 || w.riders.some(r => r.stake > w.crown.stake)))) off++;   // looked at right after the world's own step
  for (const r of w.riders) { if (r.state === "duel") w.duelPose(r, dt); if (!isFinite(r.x + r.y + r.z + r.stake)) bad++; if (r.stake < 0) bad++; if (Math.hypot(r.x, r.z) > 525) far++; if (r.y < Math.max(w.heightAt(r.x, r.z), 0) + 1) low++; }
  for (const m of w.monsters) if (!isFinite(m.x + m.y + m.z + m.hoard) || m.hoard < 0) bad++;
  if (w.dareFor(me)) { if (i % 2) w.acceptDare(me); else w.declineDare(me); }
  for (const e of w.drain()) {
    if (e.type === "aiFight") ai++; if (e.type === "join") joins++; if (e.type === "gone") gone++; if (e.type === "event") events++; if (e.type === "crown") crowns++;
    if (e.type === "challenge") { mine++; const o = e.a.human ? e.b : e.a, win = w.rng() < 0.5; w.settle(win ? me : o, win ? o : me); }
  }
  if (!w.balanced) off++;
}
line(off === 0, "10분 동안 코인이 새거나 생기지 않고, 왕관은 늘 가장 많이 든 라이더에게 있다", book(w));
line(bad === 0 && far === 0 && low === 0, "아무도 월드 밖·땅속으로 나가지 않고, 음수나 NaN이 없다", `NaN·음수 ${bad} · 바깥 ${far} · 땅속 ${low}`);
line(ai >= 6 && ai <= 60 && mine >= 1 && events >= 4 && events <= 9, "싸움과 이벤트가 너무 드물지도 잦지도 않다", `컴퓨터끼리 ${ai}번 · 나에게 ${mine}번 · 이벤트 ${events}번 · 새로 온 라이더 ${joins}명 · 집에 간 라이더 ${gone}명 · 왕관 알림 ${crowns}번`);
{ // leaving anywhere but the Roost keeps only what was brought; a ring claim must name a real ring
  const w = quiet(), a = w.addRider(cast[0], 25, true, "ember"), b = w.addRider(cast[1], 0, true, "ember"), c = w.addRider(cast[2], 25, true, "ember"), d = w.addRider(cast[3], 40, true, "ember");
  a.stake += w.take(84); b.stake += w.take(30); c.stake += w.take(84); d.stake -= 30; w.pool += 30; c.x = 5; c.z = 5;   // a and c won 84, b won 30 from nothing, d lost 30 of its 40
  const pool0 = w.pool, ka = w.leave(a, true), kb = w.leave(b, true), kd = w.leave(d, true), kc = w.leave(c, !w.canLand(c));
  line(ka === 25 && kb === 0 && kd === 10 && kc === 109 && w.pool - pool0 === 84 + 30 && w.home === 25 + 10 + 109 && w.balanced, "둥지가 아닌 곳에서 떠나면 들고 간 만큼만 챙기고 나머지는 풀로 돌아간다", `25 들고 가 109 든 채 떠남 → ${ka} · 빈손으로 가 30 든 채 → ${kb} · 40 들고 가 10 남은 채 → ${kd} · 둥지에서 내리면 → ${kc} · 풀로 돌아간 ${w.pool - pool0}`);
  const w2 = quiet(), g = w2.addRider(cast[0], 0, true, "ember"), p0 = w2.pool; let bad = 0;
  for (const i of ["length", "constructor", "0", -1, 1e9, 0.5, null, undefined, NaN, {}]) { try { bad += w2.claimRing(g, i) ? 1 : 0; } catch { bad += 100; } }
  line(bad === 0 && w2.pool === p0 && g.stake === 0 && w2.balanced, "링 신청은 진짜 링 번호만 받는다", `이상한 번호 10가지 → 지급 ${bad}건, 풀 ${p0} → ${w2.pool}`);
}
const s = spoils(25); line(s.amount === 13 && s.burn === 1 && s.gain === 12 && spoils(1).amount === 1 && spoils(0).amount === 0 && Object.is(spoils(0).gain, 0), "절반 올림·5% 소각, 0에서는 0", `25 RF → ${s.amount} 이동, ${s.burn} 소각, ${s.gain} 획득 · 0 RF → ${spoils(0).amount}`);
console.log(fail ? `\n실패 ${fail}건` : "\n전부 통과"); process.exit(fail ? 1 : 0);

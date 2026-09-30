// Dragon Stakes world: islands, rings, thermals, riders, monsters and the RF they carry.
// Pure rules. No DOM and no drawing in here, so a whole session can be run and checked headless.
//
// The coins. A project puts up a pool for the sky (POOL). Nothing is minted: every coin that enters play from the
// world comes out of that pool (rings, event rings, treasure, a monster's hoard, a computer rider's stake), and goes
// back into it when a computer rider flies home or a monster leaves. A player may bring a stake of their own on top.
// Coins leave the sky for good only by being burned or by a player landing with them. At every moment:
//   pool0 + brought = pool + carried + hoards + burned + home

export function prng(hex) {
  let [a, b, c, d] = [0, 8, 16, 24].map(i => parseInt(hex.slice(i, i + 8), 16) >>> 0);
  return () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export const TIGHT = 0.8, R = 420, CEIL = 170, BURN = 0.05, POOL = 5000;   // TIGHT: the sky is a fifth smaller than it first was, so there is always something near
export const FIGHT_RANGE = 30, RING_R = 6.5, RING_RF = 1, ROOST_R = 26, LAND_R = 44;   // LAND_R: how near the Roost a rider may land (wider than the light, and a player's dragon slows down there)
export const RIVAL_STAKES = [10, 25, 50, 100];
export const CROWN_MIN = 50, CROWN_SHARE = 3 / 4, INSURED_SHARE = 1 / 3;   // the richest rider is crowned from 50 RF; beating it pays three quarters
export const ITEMS = { magnet: 5, insure: 10, start: 5 };                  // the Roost shop: price in RF, good for one flight
export const MAGNET = 2.5, HEAD_START = 20, TAKEOFF_SHIELD = 5;
export const STORM_RF = 2, PRIZE_RF = 10, STORM_SECS = 40, PRIZE_SECS = 45;
// Wild monsters and their dare. The wheel: p is the chance, take the share of the monster's hoard the rider wins,
// give the share of what the rider carries that the monster wins. 5% of what moves is burned, as everywhere.
export const MONSTERS = ["imp", "griffin", "serpent", "gargoyle"], HOARDS = [10, 20, 30, 40];
export const DARE = [{ p: 0.10, take: 1 }, { p: 0.25, take: 0.5 }, { p: 0.25, take: 0.25 }, { p: 0.15 }, { p: 0.20, give: 0.25 }, { p: 0.05, give: 0.5 }];
export const DARE_SECS = 8, SPIN_SECS = 3.4;

// Six dragons. Each flies a little differently; the numbers here are the whole difference.
//   turn: radians per second · cruise: level speed · dive: speed a dive adds · rise: extra climb per second
//   keep: how fast extra speed fades (lower keeps it longer) · lift: climb in a thermal · ring: RF per gold ring · shield: seconds safe after a fight
export const DRAGONS = {
  ember:  { turn: 1.55, cruise: 30, dive: 34, rise: 12, keep: 0.35, lift: 13, ring: 1, shield: 8 },
  wyvern: { turn: 1.40, cruise: 32, dive: 48, rise: 12, keep: 0.35, lift: 13, ring: 1, shield: 8 },
  lung:   { turn: 2.10, cruise: 28, dive: 30, rise: 21, keep: 0.35, lift: 13, ring: 1, shield: 8 },
  bone:   { turn: 1.55, cruise: 30, dive: 34, rise: 12, keep: 0.35, lift: 13, ring: 1, shield: 14 },
  gold:   { turn: 1.45, cruise: 26, dive: 30, rise: 12, keep: 0.35, lift: 13, ring: 2, shield: 8 },
  jade:   { turn: 1.55, cruise: 29, dive: 34, rise: 12, keep: 0.12, lift: 22, ring: 1, shield: 8 },
};
export const KINDS = Object.keys(DRAGONS);

// The winner takes a share of what the loser carries, rounded up: half, or three quarters from the crowned rider,
// or a third from a rider with insurance. 5% of what moves is burned.
export function spoils(loserStake, share = 1 / 2) {
  const amount = Math.max(0, Math.ceil(Math.max(0, loserStake) * share - 1e-9)), burn = Math.round(amount * BURN);
  return { amount, burn, gain: amount - burn };
}

export class World {
  constructor(seedHex, cast, pool = POOL) {
    this.rng = prng(seedHex); this.seedHex = seedHex; this.cast = cast; this.t = 0;
    this.pool0 = this.pool = Math.max(0, Math.round(pool)); this.brought = 0; this.burned = 0; this.home = 0;   // the books, see the top of the file
    this.events = []; this.nextId = 1; this.wantRivals = 9; this.colliders = [];
    this.crown = null; this.crownSaid = 0;
    this.event = null; this.nextEvent = 35 + this.rng() * 20;
    this.monsters = []; this.wantMonsters = 5; this.monsterAt = 0; this.nextMonster = 1001;
    const r = this.rng;
    // the Roost sits in the middle; nine more islands stand around it
    this.islands = [{ x: 0, z: 0, r: 78, h: 30, flat: 0.45 }];
    const lay = [];
    for (let i = 0; i < 9; i++) lay.push({ a: i / 9 * Math.PI * 2 + r() * 0.35, d0: (i % 2 ? 330 : 205) + r() * 60, r: 48 + r() * 50, h: 16 + r() * 40, flat: r() * 0.3 });
    // Pulled in toward the Roost by TIGHT, but the islands keep their sizes: none may run into the Roost's island, and
    // no two may overlap more than they did at full size. Whichever of a crowded pair sits further out moves out a little.
    for (const o of lay) o.d = Math.max(o.d0 * TIGHT, 78 + o.r + 8);
    const gap = (p, q, k) => Math.hypot(Math.sin(p.a) * p[k] - Math.sin(q.a) * q[k], Math.cos(p.a) * p[k] - Math.cos(q.a) * q[k]);
    for (let pass = 0, moved = true; moved && pass < 60; pass++) {
      moved = false;
      for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) {
        const p = lay[i], q = lay[j], was = Math.max(0, p.r + q.r - gap(p, q, "d0")), far = p.d > q.d ? p : q;
        if (p.r + q.r - gap(p, q, "d") > was + 0.5 && far.d + far.r < R - 12) { far.d += 4; moved = true; }
      }
    }
    for (const o of lay) this.islands.push({ x: Math.sin(o.a) * o.d, z: Math.cos(o.a) * o.d, r: o.r, h: o.h, flat: o.flat });
    this.na = r() * 9; this.nb = r() * 9;
    this.roost = { x: 0, z: 0, y: this.heightAt(0, 0) };
    // thermals rise over the outer islands; rings hang in arcs between neighbours and in a spiral over the Roost
    this.thermals = this.islands.slice(1).map(s => ({ x: s.x, z: s.z, r: 16, top: s.h + 95 }));
    this.rings = [];
    const ring = (x, y, z, yaw, arc) => this.rings.push({ x, y: Math.max(y, this.heightAt(x, z) + 9), z, yaw, back: 0, arc });
    const outer = this.islands.slice(1);
    outer.forEach((s, i) => {
      const n = outer[(i + 2) % outer.length];
      for (let k = 1; k <= 5; k++) { const u = k / 6; ring(s.x + (n.x - s.x) * u, 38 + Math.sin(u * Math.PI) * 34 + (i % 3) * 8, s.z + (n.z - s.z) * u, Math.atan2(n.x - s.x, n.z - s.z), i); }
    });
    for (let k = 0; k < 10; k++) { const a = k * 0.7, d = (95 + k * 4) * TIGHT; ring(Math.sin(a) * d, 50 + k * 9, Math.cos(a) * d, a + Math.PI / 2, 9); }
    // Rings for the world events hang at fixed places and stay down until their event: over each outer island a
    // spiral of six storm rings, and one treasure ring just above its summit. (The view builds its rings once.)
    outer.forEach((s, i) => {
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + i; this.rings.push({ x: s.x + Math.sin(a) * 11, y: Math.max(s.h, 0) + 24 + k * 11, z: s.z + Math.cos(a) * 11, yaw: a, back: Infinity, ev: "storm", isl: i + 1, value: STORM_RF }); }
      this.rings.push({ x: s.x, y: this.heightAt(s.x, s.z) + 6, z: s.z, yaw: i, back: Infinity, ev: "prize", isl: i + 1, value: PRIZE_RF });
    });
    this.riders = [];
  }

  heightAt(x, z) {
    let h = -4;
    for (const s of this.islands) {
      const d = Math.hypot(x - s.x, z - s.z) / s.r; if (d >= 1) continue;
      const bump = (1 - d * d) ** 2, top = Math.min(1, bump / (1 - s.flat));   // a flat top on some
      h = Math.max(h, s.h * top + Math.sin(x * 0.11 + this.na) * Math.cos(z * 0.13 + this.nb) * 2.2 * bump - 1);
    }
    return h;
  }

  // ---------- the books ----------
  take(n) { const v = Math.min(Math.max(0, Math.round(n)), this.pool); this.pool -= v; return v; }   // out of the pool: never more than is there
  get carried() { return this.riders.reduce((a, x) => a + x.stake, 0); }
  get hoards() { return this.monsters.reduce((a, m) => a + m.hoard, 0); }
  get books() { return { pool0: this.pool0, brought: this.brought, pool: this.pool, carried: this.carried, hoards: this.hoards, burned: this.burned, home: this.home }; }
  get balanced() { return this.pool0 + this.brought === this.pool + this.carried + this.hoards + this.burned + this.home; }

  // A computer rider's stake comes out of the pool (less if the pool is low). A player's stake is their own, on top.
  // items: what a player bought at the Roost shop for this flight; anything unknown is ignored.
  addRider(friend, stake, human = false, kind = null, items = []) {
    const r = this.rng, a = r() * Math.PI * 2, d = (human ? 60 : 150 + r() * 330) * TIGHT;
    stake = human ? Math.max(0, Math.round(stake)) : this.take(stake);
    const rider = {
      id: this.nextId++, f: friend, human, stake, start: stake, kind: kind || KINDS[Math.floor(r() * KINDS.length)],
      x: Math.sin(a) * d, z: Math.cos(a) * d, y: 0, yaw: human ? a : a + Math.PI * (0.5 + r()), pitch: 0, roll: 0, speed: 30,
      flap: 0, gliding: false, state: "fly", shield: human ? TAKEOFF_SHIELD : 2, edge: false, lift: false,
      mood: human ? "you" : ["hunter", "collector", "drifter"][this.nextId % 3], skill: 0.2 + r() * 0.8,   // one in three hunts
      goal: null, think: 0, tail: 0, rest: 0, won: 0, lost: 0, rings: 0, streak: 0, best: 0, crowned: false,
      items: [], magnet: false, insured: false, away: false, spinEnd: 0,
      bye: human ? Infinity : this.t + 170 + r() * 260,   // a computer rider flies home after a while, and what it carries goes back into the pool
      name: null, remote: null,   // online: a player's display name, and the peer id of the device that flies this rider (null when it is flown here)
    };
    rider.y = Math.max(this.heightAt(rider.x, rider.z), 0) + (human ? 46 : 30 + r() * 60);
    if (human) {   // a player takes off a short glide from one of the rings over the Roost, level with it and facing it
      const g = this.rings.filter(x => x.arc === 9)[rider.id % 4], ga = Math.atan2(g.x, g.z) - 0.55, gd = Math.hypot(g.x, g.z);
      rider.x = Math.sin(ga) * gd; rider.z = Math.cos(ga) * gd; rider.y = Math.max(g.y, Math.max(this.heightAt(rider.x, rider.z), 0) + 10); rider.yaw = Math.atan2(g.x - rider.x, g.z - rider.z);
    }
    if (human) {
      this.brought += stake;
      for (const k of new Set(Array.isArray(items) ? items : [])) if (Object.hasOwn(ITEMS, k)) rider.items.push(k);
      rider.magnet = rider.items.includes("magnet"); rider.insured = rider.items.includes("insure");
      if (rider.items.includes("start")) rider.shield = HEAD_START;
    }
    this.riders.push(rider);
    return rider;
  }
  spawnRival() {
    const used = new Set(this.riders.map(x => x.f.id)), free = this.cast.filter(f => !used.has(f.id));
    if (!free.length || this.pool < 10) return null;
    const f = free[Math.floor(this.rng() * free.length)];
    const rider = this.addRider(f, RIVAL_STAKES[Math.floor(this.rng() * RIVAL_STAKES.length)]);
    this.events.push({ type: "join", rider });
    return rider;
  }
  remove(rider) { this.riders = this.riders.filter(x => x !== rider); for (const m of this.monsters) if (m.target === rider && m.state !== "spin") this.release(m, 8); }
  // A rider leaves the sky with what it carries: a player takes it home, a computer rider's coins go back into the pool.
  // Leaving in the middle of a fight is a forfeit: the one who stays wins and takes the normal share first.
  // A player who leaves anywhere but the Roost (away) keeps only what they brought, at most what they still carry;
  // the rest of what they carry goes back into the pool. Only a landing at the Roost banks winnings.
  leave(rider, away = false) {
    if (!this.riders.includes(rider)) return 0;
    if (rider.state === "duel") {
      const other = this.riders.find(o => o !== rider && o.state === "duel" && o.ring === rider.ring);
      rider.ai = null; if (other) { other.ai = null; this.settle(other, rider, false, true); }
      if (!this.riders.includes(rider)) return 0;                  // a computer rider left with too little already went home in settle()
    }
    const keep = !rider.human ? 0 : away ? Math.min(rider.start, rider.stake) : rider.stake;
    this.home += keep; this.pool += rider.stake - keep;
    this.remove(rider);
    return rider.human ? keep : rider.stake;
  }

  // One flight model for everyone. c = { turn -1..1, climb -1..1 (a stick can ask for part of it), throttle 0..1 (boost) }
  fly(r, c, dt) {
    const k = DRAGONS[r.kind];
    r.yaw = wrap(r.yaw + c.turn * k.turn * dt);
    r.roll += (-c.turn * 0.62 - r.roll) * Math.min(1, dt * 5);
    // With no key held the dragon levels off and holds its height. If the ground ahead is higher than it flies,
    // it pulls up by itself instead of ploughing into the hillside.
    const sx = Math.sin(r.yaw), sz = Math.cos(r.yaw), hs0 = Math.max(14, Math.cos(r.pitch) * r.speed);
    let ahead = 0; for (const s of [0.5, 1.1, 1.9]) ahead = Math.max(ahead, this.heightAt(r.x + sx * hs0 * s, r.z + sz * hs0 * s));
    const up = clamp(c.climb, -1, 1); let pitchT = up > 0 ? 0.46 * up : 0.62 * up;
    if (r.y < ahead + 6) pitchT = Math.max(pitchT, Math.min(0.62, 0.2 + (ahead + 6 - r.y) * 0.06));
    r.pitch += (pitchT - r.pitch) * Math.min(1, dt * 5);
    let want = k.cruise + c.throttle * 14 - Math.sin(r.pitch) * (r.pitch < 0 ? k.dive : 16);   // a dive builds speed, a climb costs a little
    const landing = r.human && Math.hypot(r.x, r.z) < LAND_R;      // over the Roost a player's dragon slows, so there is time to land
    if (landing) want = Math.min(want, 17 + c.throttle * 10);
    r.speed += (want - r.speed) * Math.min(1, dt * (want > r.speed ? 1.4 : landing ? 2.2 : k.keep));   // and the glide keeps it for a while
    let vy = Math.sin(r.pitch) * r.speed + (r.pitch > 0 ? k.rise * Math.min(1, r.pitch / 0.4) : 0);
    r.lift = false;
    for (const th of this.thermals) if (r.y < th.top && Math.hypot(r.x - th.x, r.z - th.z) < th.r) { vy += k.lift; r.lift = true; }
    const hs = Math.cos(r.pitch) * r.speed;
    r.x += sx * hs * dt; r.z += sz * hs * dt; r.y += vy * dt;
    for (const o of this.colliders) if (r.y < o.top && r.y > (o.base ?? -Infinity)) {   // tall landmarks: slide around them (one with a base is solid only above it, so you can fly under)
      const dx = r.x - o.x, dz = r.z - o.z, d = Math.hypot(dx, dz), min = o.r + 2.5;
      if (d < min) {   // pushed back out to the edge, and along it to the side it was already passing on
        const ux = d > 0.01 ? dx / d : -sx, uz = d > 0.01 ? dz / d : -sz, side = sx * uz - sz * ux > 0 ? -1 : 1, slip = (min - d) + hs * dt * 0.6;
        r.x = o.x + ux * min - uz * side * slip; r.z = o.z + uz * min + ux * side * slip;
      }
    }
    const floor = Math.max(this.heightAt(r.x, r.z), 0) + 2.4;
    if (r.y < floor) { r.y = floor; r.pitch = Math.max(r.pitch, 0.06); }
    if (r.y > CEIL) { r.y = CEIL; r.pitch = Math.min(r.pitch, 0); }
    // the sea wind turns you home: gently from a little before the edge, harder the further out
    const d = Math.hypot(r.x, r.z), wind = clamp((d - R * 0.88) / (R * 0.16), 0, 1); r.edge = wind > 0;
    if (r.edge) r.yaw = wrap(r.yaw + clamp(wrap(Math.atan2(-r.x, -r.z) - r.yaw), -1, 1) * 2.4 * wind * dt);
    r.gliding = up <= 0.3 && c.throttle <= 0;
    r.flap += dt * (up > 0.3 ? 10 : c.throttle > 0 ? 7.5 : 0);
  }

  // A computer rider picks somewhere to go, and hunters pick someone to chase.
  steer(r, dt) {
    r.think -= dt;
    if (r.think <= 0) {
      r.think = 1.2 + this.rng() * 1.6;
      const prey = r.mood === "hunter" && r.stake >= 4 && r.rest <= this.t ? this.riders.filter(o => o !== r && o.state === "fly" && o.shield <= 0 && o.stake >= 4 && Math.hypot(o.x - r.x, o.z - r.z) < 170).sort((a, b) => b.stake - a.stake)[0] : null;
      if (prey) r.goal = { rider: prey };
      else if (r.mood !== "drifter") {   // collectors race for an event's rings before the ordinary ones
        const far = g => Math.hypot(g.x - r.x, g.z - r.z) * (g.ev ? 0.3 : 1);
        const open = this.rings.filter(g => g.back <= this.t).sort((a, b) => far(a) - far(b))[0];
        r.goal = open ? { x: open.x, y: open.y, z: open.z } : null;
      } else if (!r.goal || r.goal.rider || Math.hypot(r.goal.x - r.x, r.goal.z - r.z) < 30) {
        const s = this.islands[Math.floor(this.rng() * this.islands.length)];
        r.goal = { x: s.x + (this.rng() - 0.5) * 120, y: s.h + 25 + this.rng() * 60, z: s.z + (this.rng() - 0.5) * 120 };
      }
    }
    const g = r.goal?.rider || r.goal || { x: 0, y: 70, z: 0 };
    if (r.goal?.rider && (g.state !== "fly" || !this.riders.includes(g))) r.goal = null;
    const turn = clamp(wrap(Math.atan2(g.x - r.x, g.z - r.z) - r.yaw) * 1.6, -1, 1), dy = g.y - r.y;
    const ahead = Math.max(this.heightAt(r.x + Math.sin(r.yaw) * 30, r.z + Math.cos(r.yaw) * 30), 0) + 10;
    return { turn, climb: r.y < ahead || dy > 6 ? 1 : dy < -10 ? -1 : 0, throttle: r.goal?.rider ? 0.8 : 0.1 };
  }

  step(dt, input) {
    this.t += dt;
    if (this.pool < 1) for (const g of this.rings) if (!g.ev && g.back <= this.t) g.back = this.t + 3;   // the pool is spent: no ring has a coin to give
    for (const r of [...this.riders]) {
      r.shield = Math.max(0, r.shield - dt);
      if (r.state === "spin") {   // held beside a monster while its wheel turns: a slow drift, safe from everyone
        r.x += Math.sin(r.yaw) * 5 * dt; r.z += Math.cos(r.yaw) * 5 * dt; r.pitch *= 0.9; r.roll *= 0.9; r.speed = 12; r.flap += dt * 6; r.gliding = false;
        if (this.t >= r.spinEnd) { r.state = "fly"; r.shield = Math.max(r.shield, 3); if (!r.human && r.stake < 4) this.leave(r); }
        continue;
      }
      if (r.state !== "fly" || r.remote) continue;   // a remote rider is flown on its own device; its pose and ring claims arrive over the network
      this.fly(r, r.human ? input : this.steer(r, dt), dt);
      const reach = RING_R * (r.magnet ? MAGNET : 1);
      for (const g of this.rings) if (g.back <= this.t && Math.hypot(g.x - r.x, g.y - r.y, g.z - r.z) < reach) this.takeRing(r, g);
    }
    // hunters close in: a rider who stays on someone's tail long enough starts the fight
    for (const r of this.riders) {
      const prey = r.goal?.rider;
      if (r.human || r.state !== "fly" || !prey || prey.state !== "fly" || prey.shield > 0) { r.tail = 0; continue; }
      const d = Math.hypot(prey.x - r.x, prey.y - r.y, prey.z - r.z);
      if (d < FIGHT_RANGE * 2.2 && prey.human && r.tail === 0) this.events.push({ type: "warn", rider: r, prey });
      r.tail = d < FIGHT_RANGE * 2.2 ? r.tail + dt : 0;
      if (d < FIGHT_RANGE && r.tail > 1.6) { r.tail = 0; this.challenge(r, prey); }
    }
    // fights between two computer riders settle on their own after a few seconds of circling
    for (const r of this.riders) if (r.state === "duel" && r.ai && this.t >= r.ai.until) {
      const o = r.ai.other; r.ai = o.ai = null; r.state = o.state = "fly";
      const win = this.rng() < 0.5 + (r.skill - o.skill) * 0.4 ? r : o;
      this.settle(win, win === r ? o : r);
    }
    // computer riders come and go: one that has been up long enough flies home, and a new one arrives while the pool can stake it
    for (const r of [...this.riders]) if (!r.human && r.state === "fly" && this.t > r.bye && !this.monsters.some(m => m.target === r)) { this.events.push({ type: "gone", rider: r }); this.leave(r); }
    while (this.riders.filter(x => !x.human).length < this.wantRivals) if (!this.spawnRival()) break;
    this.stepEvent(); this.stepMonsters(dt); this.crownNow();
  }

  // ---------- rings and world events ----------
  // An ordinary ring pays 1 RF (2 to the Gold Hoarder) and comes back; an event ring pays its own value once. All of it from the pool.
  takeRing(r, g) {
    const value = this.take(g.ev ? g.value : RING_RF * DRAGONS[r.kind].ring);
    g.back = g.ev ? Infinity : this.t + 28; if (!value) return 0;
    r.stake += value; r.rings++; r.speed += 5;
    this.events.push({ type: "ring", rider: r, ring: g, value });
    return value;
  }
  // A remote rider says it flew through ring i. The host only checks that the ring is there and the rider was near it
  // (its pose here trails the real one by a fraction of a second, so the reach is wider than RING_R).
  claimRing(r, i, slack = 15) {
    const g = Number.isInteger(i) && i >= 0 && i < this.rings.length ? this.rings[i] : null;   // only a real ring: never a property name
    if (!g || g.back > this.t || r.state !== "fly" || !this.riders.includes(r) || Math.hypot(g.x - r.x, g.y - r.y, g.z - r.z) > RING_R * (r.magnet ? MAGNET : 1) + slack) return 0;
    return this.takeRing(r, g);
  }
  // One event at a time, every 75 to 110 seconds: a ring storm over one island, or a treasure on a summit.
  stepEvent() {
    const e = this.event;
    if (e) {
      if (this.t < e.until && e.rings.some(i => this.rings[i].back <= this.t)) return;
      for (const i of e.rings) this.rings[i].back = Infinity;
      this.events.push({ type: "eventEnd", event: e }); this.event = null; this.nextEvent = this.t + 75 + this.rng() * 35;
    } else if (this.t >= this.nextEvent) {
      if (this.pool < 12) { this.nextEvent = this.t + 30; return; }   // nothing left to give
      const type = this.rng() < 0.5 ? "storm" : "prize", isl = 1 + Math.floor(this.rng() * (this.islands.length - 1)), s = this.islands[isl];
      const rings = []; this.rings.forEach((g, i) => { if (g.ev === type && g.isl === isl) { g.back = this.t; rings.push(i); } });
      this.event = { type, isl, x: s.x, z: s.z, until: this.t + (type === "storm" ? STORM_SECS : PRIZE_SECS), rings };
      this.events.push({ type: "event", event: this.event });
    }
  }

  // ---------- the crown ----------
  // The rider carrying the most is crowned, if it carries at least 50 RF. On a tie the crown stays where it is.
  crownNow() {
    let top = null;
    for (const r of this.riders) if (r.stake >= CROWN_MIN && (!top || r.stake > top.stake || (r.stake === top.stake && r === this.crown))) top = r;
    if (top === this.crown) return;
    this.crown = top; for (const r of this.riders) r.crowned = r === top;
    if (top && this.t >= this.crownSaid) { this.crownSaid = this.t + 6; this.events.push({ type: "crown", rider: top }); }   // said at most once every few seconds
  }

  // ---------- fights ----------
  // Inside the Roost's light nobody can be challenged.
  safe(r) { return Math.hypot(r.x, r.z) < ROOST_R; }
  canLand(r) { return Math.hypot(r.x, r.z) < LAND_R; }
  near(me) {
    if (this.safe(me) || me.stake < 1) return null;
    return this.riders.filter(o => o !== me && o.state === "fly" && o.shield <= 0 && o.stake >= 1 && !this.safe(o))
      .map(o => ({ o, d: Math.hypot(o.x - me.x, o.y - me.y, o.z - me.z) })).filter(x => x.d < FIGHT_RANGE).sort((a, b) => a.d - b.d)[0]?.o || null;
  }
  challenge(a, b) {
    if (a.state !== "fly" || b.state !== "fly" || b.shield > 0 || a.stake < 1 || b.stake < 1 || this.safe(a) || this.safe(b)) return false;
    a.state = b.state = "duel"; a.goal = b.goal = null;
    a.ring = b.ring = { x: (a.x + b.x) / 2, y: Math.max((a.y + b.y) / 2, Math.max(this.heightAt((a.x + b.x) / 2, (a.z + b.z) / 2), 0) + 22), z: (a.z + b.z) / 2, t0: this.t };
    for (const m of this.monsters) if ((m.target === a || m.target === b) && m.state !== "spin") this.release(m, 10);
    if (a.human || b.human) this.events.push({ type: "challenge", a, b });
    else { a.ai = { other: b, until: this.t + 7 }; b.ai = null; this.events.push({ type: "aiFight", a, b }); }
    return true;
  }
  // What losing a fight would cost this rider right now, and what the winner would get.
  spoilsOf(loser) {
    const crown = loser === this.crown, insured = !!loser.insured, share = insured ? INSURED_SHARE : crown ? CROWN_SHARE : 1 / 2;
    return { ...spoils(loser.stake, share), share, crown, insured };
  }
  // Moves the coins. draw: nothing moves. left: the loser left in the middle of the fight (a forfeit).
  settle(winner, loser, draw = false, left = false) {
    const out = { winner, loser, draw, left, amount: 0, burn: 0, gain: 0, share: 0, crown: false, insured: false };
    for (const x of [winner, loser]) { x.state = "fly"; x.shield = DRAGONS[x.kind].shield; x.ring = null; x.tail = 0; x.goal = null; x.rest = this.t + 20 + this.rng() * 25; }
    if (!draw) {
      Object.assign(out, this.spoilsOf(loser));
      loser.stake -= out.amount; winner.stake += out.gain; this.burned += out.burn; winner.won++; loser.lost++;
      winner.streak++; winner.best = Math.max(winner.best, winner.streak); loser.streak = 0;
      if (out.insured) loser.insured = false;                      // insurance covers the first lost fight only
      if (loser.stake < 4 && !loser.human && !left) { this.pool += loser.stake; this.remove(loser); out.gone = true; }   // too little left to fight for: it flies home
    }
    this.events.push({ type: "settled", ...out });
    return out;
  }
  // Two riders in a fight circle each other. Used by the view for both kinds of fight.
  duelPose(r, dt) {
    const c = r.ring; if (!c) return;
    const other = this.riders.find(o => o !== r && o.ring === c), side = other && other.id < r.id ? Math.PI : 0;
    const a = (this.t - c.t0) * 0.55 + side, k = Math.min(1, dt * 3);
    const tx = c.x + Math.sin(a) * 15, tz = c.z + Math.cos(a) * 15;
    r.x += (tx - r.x) * k; r.z += (tz - r.z) * k; r.y += (c.y - r.y) * k;
    r.yaw = wrap(a + Math.PI / 2); r.pitch *= 0.9; r.roll += (0.35 - r.roll) * k; r.flap += dt * 6; r.gliding = false; r.speed = 12;
  }

  // ---------- wild monsters ----------
  // Not riders: creatures that haunt an island and sit on a hoard taken from the pool. One that notices a rider flies
  // up alongside and taunts; now and then the taunt becomes a dare. Accepting spins the wheel (DARE): pure luck.
  spawnMonster() {
    const used = new Set(this.monsters.map(m => m.home)), free = this.islands.map((_, i) => i).filter(i => i > 0 && !used.has(i));
    if (!free.length || this.pool < 10) return null;
    const home = free[Math.floor(this.rng() * free.length)], s = this.islands[home], a = this.rng() * Math.PI * 2;
    const m = {
      id: this.nextMonster++, kind: MONSTERS[Math.floor(this.rng() * MONSTERS.length)], x: s.x + Math.sin(a) * 30, y: Math.max(s.h, 0) + 40, z: s.z + Math.cos(a) * 30, yaw: a,
      hoard: this.take(HOARDS[Math.floor(this.rng() * HOARDS.length)]), state: "roam", target: null, dareUntil: 0,
      home, goal: null, think: 0, until: 0, cool: this.t + 8, line: 0, life: this.t + 160 + this.rng() * 160,
    };
    this.monsters.push(m); this.events.push({ type: "monster", monster: m });
    return m;
  }
  release(m, cool) { m.target = null; m.state = "roam"; m.goal = null; m.cool = this.t + cool; }
  canTaunt(r) { return r.state === "fly" && r.shield <= 0 && !r.away && !this.safe(r) && !this.monsters.some(o => o.target === r); }
  stepMonsters(dt) {
    while (this.monsters.length < this.wantMonsters && this.t >= this.monsterAt) if (!this.spawnMonster()) { this.monsterAt = this.t + 20; break; }
    for (const m of [...this.monsters]) {
      const tg = m.target, there = tg && this.riders.includes(tg), far = there ? Math.hypot(tg.x - m.x, tg.y - m.y, tg.z - m.z) : 0;
      let goal = null, speed = 16;
      if (m.state === "roam") {
        if (this.t > m.life || m.hoard < 1) { m.state = "flee"; m.until = this.t + 6; continue; }
        m.think -= dt;
        if (m.think <= 0 || !m.goal) { const s = this.islands[m.home]; m.think = 3 + this.rng() * 3; m.goal = { x: s.x + (this.rng() - 0.5) * s.r * 1.7, y: Math.max(s.h, 0) + 22 + this.rng() * 45, z: s.z + (this.rng() - 0.5) * s.r * 1.7 }; }
        goal = m.goal;
        if (this.t >= m.cool) {
          const r = this.riders.filter(o => this.canTaunt(o) && Math.hypot(o.x - m.x, o.y - m.y, o.z - m.z) < 80)[0];
          if (r) { m.target = r; m.state = "taunt"; m.until = this.t + 4; m.line = Math.floor(this.rng() * 1000); this.events.push({ type: "taunt", monster: m, rider: r }); }
        }
      } else if (m.state === "taunt" || m.state === "dare") {
        if (!there || tg.state !== "fly" || this.safe(tg) || far > 130) { this.release(m, 12); continue; }   // outflown, or the rider is busy or safe
        goal = { x: tg.x + Math.cos(tg.yaw) * 10, y: tg.y + 2.5, z: tg.z - Math.sin(tg.yaw) * 10 }; speed = Math.max(34, tg.speed + 16);
        if (m.state === "taunt" && this.t >= m.until) {
          if (far < 45 && m.hoard >= 4 && tg.shield <= 0 && this.rng() < 0.45) {   // most taunts are only that
            m.state = "dare"; m.dareUntil = this.t + DARE_SECS; m.line = Math.floor(this.rng() * 1000); this.events.push({ type: "dare", monster: m, rider: tg });
            if (!tg.human) { if (this.rng() < 0.5) this.acceptDare(tg, m); else this.release(m, 18); }   // a computer rider decides by a coin flip
          } else this.release(m, 14 + this.rng() * 14);
        } else if (m.state === "dare" && this.t >= m.dareUntil) this.release(m, 18);
      } else if (m.state === "spin") {
        if (there) goal = { x: tg.x + Math.cos(tg.yaw) * 10, y: tg.y + 2.5, z: tg.z - Math.sin(tg.yaw) * 10 };
        if (this.t >= m.until) { if (m.hoard < 1) { m.target = null; m.state = "flee"; m.until = this.t + 6; } else this.release(m, 25); }
      } else if (m.state === "flee") {   // gone for good: what it still holds goes back into the pool, and another comes later somewhere else
        if (this.t >= m.until) { this.pool += m.hoard; this.monsters = this.monsters.filter(o => o !== m); this.monsterAt = this.t + 15 + this.rng() * 25; this.events.push({ type: "monsterGone", monster: m }); continue; }
        goal = { x: m.x * 1.6, y: CEIL + 60, z: m.z * 1.6 }; speed = 46;
      }
      if (!goal) continue;
      const dx = goal.x - m.x, dz = goal.z - m.z, d = Math.hypot(dx, dz);
      m.yaw = wrap(m.yaw + clamp(wrap(Math.atan2(dx, dz) - m.yaw), -1, 1) * 3 * dt);
      const v = Math.min(speed, d * 2); m.x += Math.sin(m.yaw) * v * dt; m.z += Math.cos(m.yaw) * v * dt;
      m.y += clamp(goal.y - m.y, -1, 1) * Math.min(22, Math.abs(goal.y - m.y) * 3) * dt;
      if (m.state !== "flee") m.y = clamp(m.y, Math.max(this.heightAt(m.x, m.z), 0) + 5, CEIL);
    }
  }
  dareFor(rider) { return this.monsters.find(m => m.state === "dare" && m.target === rider) || null; }
  // The wheel is rolled here, with the world's seeded rng, and the coins move at once; the devices only show it turning.
  acceptDare(rider, m = this.dareFor(rider)) {
    if (!m || m.state !== "dare" || m.target !== rider || rider.state !== "fly") return null;
    let roll = this.rng(), k = 0; while (k < DARE.length - 1 && roll >= DARE[k].p) { roll -= DARE[k].p; k++; }
    const o = DARE[k], out = { monster: m, rider, k, dir: 0, amount: 0, burn: 0, gain: 0, hoard0: m.hoard, carry0: rider.stake };
    if (o.take) { Object.assign(out, spoils(m.hoard, o.take), { dir: 1 }); m.hoard -= out.amount; rider.stake += out.gain; }
    else if (o.give) { Object.assign(out, spoils(rider.stake, o.give)); if (out.amount) { out.dir = -1; rider.stake -= out.amount; m.hoard += out.gain; } }   // a rider carrying nothing has nothing to lose
    this.burned += out.burn;
    rider.state = "spin"; rider.goal = null; rider.spinEnd = m.until = this.t + SPIN_SECS; m.state = "spin";
    this.events.push({ type: "dared", ...out });
    return out;
  }
  declineDare(rider) { const m = this.dareFor(rider); if (m) this.release(m, 20); return !!m; }

  drain() { const e = this.events; this.events = []; return e; }
}

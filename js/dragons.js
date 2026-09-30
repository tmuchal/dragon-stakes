// The six dragons of Dragon Stakes, plus how they move and their pictures for the picker.
// They are low-poly on purpose: tapered bones, spikes, boxes and flat sheets, flat colours, no textures.
// Contract with the view (do not change these names):
//   buildDragon(kind, hash) -> { g, core, wings, tail, segs, seat, seatY, ripple }
//     g     the whole dragon (the view sets position, yaw and scale on it)      core  the body (the view sets pitch and roll on it)
//     seat  the group the rider's sprite is attached to, seatY its height there
//   animateDragon(v, rider, clock, dt)   called every frame; rider has flap, gliding, roll, id, speed, pitch, state
//   dragonThumbs(kinds, w, h) -> { kind: dataURL }
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// Two colourways per dragon (body, belly or trim, dark or accent, wing skin), so rivals on the same kind still look apart.
const LOOKS = {
  ember:  [["#c8553d", "#f2c6a0", "#8f2d1e", "#ec9440"], ["#a63a52", "#f4c9b0", "#6a1f33", "#f0b04e"]],
  wyvern: [["#5aa9d6", "#e9f7fd", "#2f6f96", "#2f6f96"], ["#8b9fe0", "#eef1ff", "#4a5aa8", "#4a5aa8"]],
  lung:   [["#3f9a8a", "#f3e7b3", "#d9a62e", ""], ["#4a7fc2", "#f3e7b3", "#d9a62e", ""]],
  bone:   [["#ece6d6", "#3a3340", "#a46bff", "#3a3340"], ["#d9d2c0", "#2c2a33", "#ff5e5e", "#2c2a33"]],
  gold:   [["#e9b52e", "#fff1bf", "#a87414", "#c0392b"], ["#dc9a2c", "#ffe9b0", "#8f5a12", "#7a3fa0"]],
  jade:   [["#2fa36b", "#ffd24a", "#d1495b", ""], ["#2a9d9d", "#ffd24a", "#e76f51", ""]],
};
// How each kind beats its wings: swing of the inner panel, swing of the outer panel, how far the outer panel lags,
// how much it folds back on the upstroke, and the upward tilt it holds in a glide.
const FLY = {
  ember:  { amp: 0.60, amp2: 0.50, lag: 0.9, fold: 0.30, di: 0.16 },
  wyvern: { amp: 0.55, amp2: 0.55, lag: 1.0, fold: 0.36, di: 0.14 },
  bone:   { amp: 0.62, amp2: 0.55, lag: 1.1, fold: 0.30, di: 0.16 },
  gold:   { amp: 0.75, amp2: 0.45, lag: 0.7, fold: 0.20, di: 0.22 },
  jade:   { amp: 0.56, amp2: 0.50, lag: 0.9, fold: 0.30, di: 0.15 },
};

// ---------- building blocks ----------
const mats = new Map(), lits = new Map();
const mat = c => { let m = mats.get(c); if (!m) mats.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return m; };
// the same colour, but it keeps more of itself in shadow: ice, polished gold, bleached bone
const sheen = (c, lift) => { const key = c + lift; let m = mats.get(key); if (!m) { mats.set(key, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); m.userData.lift = lift; } return m; };
const lit = c => { let m = lits.get(c); if (!m) lits.set(c, m = new THREE.MeshBasicMaterial({ color: c })); return m; };   // glows: ignores the light
const paint = c => typeof c === "string" ? mat(c) : c;
const shade = (c, f) => "#" + new THREE.Color(c).multiplyScalar(f).getHexString();
const BOX = new THREE.BoxGeometry(1, 1, 1);
const G = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
const box = (parent, c, w, h, d, x, y, z) => { const m = new THREE.Mesh(BOX, paint(c)); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };
const geoOf = pts => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3)); return g; };
const pair = s => typeof s === "number" ? [s, s] : s;
// the outline of one end of a bone: a rectangle, or with `cut` an octagon (corners cut off) so fat bodies read as round
const ring = (w, h, z, cut) => { const x = w / 2, y = h / 2, a = x - cut * w, b = y - cut * h; return cut ? [[-a, -y, z], [a, -y, z], [x, -b, z], [x, b, z], [a, y, z], [-a, y, z], [-x, b, z], [-x, -b, z]] : [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]; };
const AXIS = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
// A tapered bone from point a to point b. s0 and s1 are the [width, height] of its two ends (one number for a square end);
// an end of 0 makes a spike. Necks, tails, horns, legs, claws and wing fingers are all made of these.
function bone(parent, c, a, b, s0, s1 = s0, cut = 0) {
  const [w0, h0] = pair(s0), [w1, h1] = pair(s1), d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const A = ring(w0, h0, 0, cut), B = ring(w1, h1, len, cut), n = A.length, t = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; t.push(A[i], A[j], B[j], A[i], B[j], B[i]); }
  for (let i = 1; i < n - 1; i++) t.push(B[0], B[i], B[i + 1], A[0], A[i + 1], A[i]);
  const m = new THREE.Mesh(geoOf(t), paint(c)); m.position.set(a[0], a[1], a[2]); m.quaternion.setFromUnitVectors(AXIS, d.normalize()); parent.add(m); return m;
}
// A thin slab of triangles (three points each): wing membranes, fins and feathers. Each triangle is a little prism, so a
// wing seen exactly edge-on is still a couple of pixels thick and never thins to nothing.
function sheet(parent, c, pts, th = 0.16) {
  const out = [], n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < pts.length; i += 3) {
    const t = [pts[i], pts[i + 1], pts[i + 2]]; a.set(t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]); b.set(t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]); n.crossVectors(a, b).normalize().multiplyScalar(th / 2);
    const P = t.map(v => [v[0] + n.x, v[1] + n.y, v[2] + n.z]), Q = t.map(v => [v[0] - n.x, v[1] - n.y, v[2] - n.z]);
    out.push(P[0], P[1], P[2], Q[0], Q[2], Q[1]);
    for (let e = 0; e < 3; e++) { const f = (e + 1) % 3; out.push(P[e], Q[e], Q[f], P[e], Q[f], P[f]); }
  }
  const m = new THREE.Mesh(geoOf(out), paint(c)); parent.add(m); return m;
}
// the same triangle with a hole torn in the middle: three strips around its edges
const torn = (A, B, C, keep = 0.5) => { const g = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3], a = mix(g, A, keep), b = mix(g, B, keep), c = mix(g, C, keep); return [A, B, b, A, b, a, B, C, c, B, c, b, C, A, a, C, a, c]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// A flat feather from p to q: one colour per band along its length, the last band comes to a point.
function feather(parent, p, q, hw, cols, cuts = [0, 0.45, 0.72, 1]) {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]), n = new THREE.Vector3().crossVectors(d, UP).normalize().multiplyScalar(hw);
  const at = (t, k) => [p[0] + d.x * t + n.x * k, p[1] + d.y * t + n.y * k, p[2] + d.z * t + n.z * k];
  cols.forEach((c, i) => { const t0 = cuts[i], t1 = cuts[i + 1];
    sheet(parent, c, i === cols.length - 1 ? [at(t0, -1), at(t0, 1), at(t1, 0)] : [at(t0, -1), at(t0, 1), at(t1, 1), at(t0, -1), at(t1, 1), at(t1, -1)], 0.14); });
}

// ---------- the six dragons ----------
// Everything faces +z. Returns the parts the view and animateDragon move: wings, neck, head, jaw, tail joints, body segments, seat.
export function buildDragon(kind, hash = 0) {
  const look = LOOKS[kind][hash % LOOKS[kind].length], skin = look[3], g = new THREE.Group(), core = G(g); let [body, trim, dark] = look;
  const wings = [], tail = [], segs = [], neck = [], feelers = [], fins = []; let sp = 1.2, seat = core, seatY = 0.9, head = null, jaw = null, jawRest = 0.04, heart = null;
  const both = fn => [1, -1].forEach(fn), RND = 0.27;
  const eyes = (parent, c, x, y, z, w = 0.16, h = 0.24, d = 0.34) => both(s => box(parent, lit(c), w, h, d, x * s, y, z));
  // a tail of joints running back from `at`; secs are the cross-sections at each joint, lens the length of each piece
  const chain = (parent, at, secs, lens, col, deco) => { let p = parent, pos = at; lens.forEach((len, k) => { const j = G(p, ...pos); bone(j, typeof col === "function" ? col(k) : col, [0, 0, 0.08], [0, 0, -len], secs[k], secs[k + 1], RND); deco && deco(j, k, len, pair(secs[k])); tail.push(j); p = j; pos = [0, 0, -len]; }); return p; };
  // a neck of joints rising forward from `at`; returns the head group at its end
  const neckOf = (at, steps, secs, col, deco) => { let p = core, pos = at; steps.forEach(([dy, dz], k) => { const j = G(p, ...pos); bone(j, col, [0, -dy * 0.12, -dz * 0.12], [0, dy, dz], secs[k], secs[k + 1], RND); deco && deco(j, k, dy, dz, pair(secs[k])); neck.push(j); p = j; pos = [0, dy, dz]; }); return G(p, ...pos); };
  // A bat wing in two parts. Inner: upper arm, forearm and the membrane back to the body. Outer: the fingers from the wrist
  // and the membrane between them, with a scalloped trailing edge. The trailing edge hangs lower than the arm, so the wing
  // is cupped and shows its upper side from behind. o.tatter tears it: ragged edges, holes, bare finger tips.
  const batWing = (root, o) => both(s => {
    const M = p => [p[0] * s, p[1], p[2]], a = G(root, ...M(o.at)), b = G(a, ...M(o.wrist)), E = M(o.elbow), W = M(o.wrist), O = [0, 0, 0], T = o.thick, n = o.fingers.length;
    bone(a, o.arm, O, E, T, T * 0.85); bone(a, o.arm, E, W, T * 0.85, T * 0.75);
    const last = o.fingers[n - 1], L = M([o.wrist[0] + last[0], o.wrist[1] + last[1], o.wrist[2] + last[2]]), R = M(o.root), two = o.skin2 || o.skin;
    if (o.tatter) {
      const r1 = mix(E, mix(L, R, 0.25), 0.72), r2 = mix(L, R, 0.5), r3 = mix(E, mix(L, R, 0.75), 0.66);
      sheet(a, o.skin, [...torn(E, W, L, 0.42), E, L, r1, E, r2, r3]); sheet(a, two, [E, r1, r2, E, r3, R, O, E, R]);
    } else { const mid = mix(E, mix(L, R, 0.5), 0.8); sheet(a, o.skin, [E, W, L, E, L, mid, E, mid, R]); sheet(a, two, [O, E, R]); }
    o.fingers.forEach((f, i) => {
      const F = M(f); bone(b, o.rib || o.arm, O, F, T * (i ? 0.6 : 0.78), i ? 0.08 : 0.16);
      if (i === n - 1) return;
      const F2 = M(o.fingers[i + 1]), c = i % 2 ? o.skin : two;
      if (o.tatter) {   // a ragged edge of two notches, and a slit torn in every other panel
        const p = mix(O, F, 0.9), q = mix(O, F2, 0.9), e1 = mix(O, mix(p, q, 0.25), 0.7), e2 = mix(O, mix(p, q, 0.5), 1.02), e3 = mix(O, mix(p, q, 0.75), 0.64); e2[1] -= 0.25;
        sheet(b, c, [O, p, e1, O, e2, e3, O, e3, q, ...(i % 2 ? [O, e1, e2] : [O, mix(O, e1, 0.45), mix(O, e2, 0.45), mix(O, e1, 0.66), e1, e2, mix(O, e1, 0.66), e2, mix(O, e2, 0.66)])]);
      } else { const m = mix(O, mix(F, F2, 0.5), 0.76); m[1] -= 0.22; sheet(b, c, [O, F, m, O, m, F2]); }
    });
    if (o.thumb) bone(b, o.claw, O, M(o.thumb), T * 0.7, 0);
    wings.push({ a, b, s });
  });
  // A bird wing: a green arm and shoulder, a row of banded flight feathers behind it, and long primaries fanning from the wrist.
  // The feathers slope down toward the trailing edge, so the wing is cupped and never flat to the eye.
  const featherWing = (root, at, wrist, cols) => both(s => {
    const M = p => [p[0] * s, p[1], p[2]], a = G(root, ...M(at)), b = G(a, ...M(wrist)), W = M(wrist), back = M([wrist[0], wrist[1] - 0.35, wrist[2] - 1.5]);
    bone(a, body, [0, 0, 0], W, [0.6, 0.42], [0.46, 0.36]);
    sheet(a, shade(body, 0.82), [[0, 0.03, 0.15], W, back, [0, 0.03, 0.15], back, [0, -0.3, -1.7]]);
    for (let i = 0; i < 4; i++) { const t = (i + 0.5) / 4, x = wrist[0] * t, y = wrist[1] * t - 0.22 - i * 0.02, z = wrist[2] * t - 0.9; feather(a, M([x, y, z]), M([x + 0.3, y - 0.6, z - 2.4 - t * 0.4]), 0.37, cols); }
    [3.5, 3.9, 3.7, 3.2, 2.7].forEach((len, i) => { const ang = 0.12 + i * 0.32; feather(b, [0, -0.03 * i, -0.1], M([Math.cos(ang) * len, -0.15 - 0.17 * i, -Math.sin(ang) * len]), 0.4, cols); });
    bone(b, body, [0, 0, 0], M([Math.cos(0.12) * 2.3, -0.08, -Math.sin(0.12) * 2.3 + 0.25]), [0.4, 0.32], [0.16, 0.14]);
    sheet(b, shade(body, 0.82), [[0, 0.03, 0.25], M([1.5, 0, -0.1]), M([0.2, -0.3, -1.5])]);
    wings.push({ a, b, s });
  });

  if (kind === "ember") {
    // The classic fire drake: deep chest, four legs, long horns swept back, big bat wings, a spade on the tail.
    bone(core, body, [0, 0, -2.5], [0, 0.05, -0.2], [0.95, 0.9], [1.8, 1.55], RND); bone(core, body, [0, 0.05, -0.2], [0, 0.3, 2.2], [1.8, 1.55], [1.1, 1.05], RND);
    bone(core, trim, [0, -0.3, -2.3], [0, -0.38, -0.2], [0.6, 0.6], [1.2, 1.1]); bone(core, trim, [0, -0.38, -0.2], [0, 0, 2.1], [1.2, 1.1], [0.75, 0.8]);
    [[-2.1, 0.5], [-1.45, 0.62], [-0.8, 0.74], [1.4, 0.82], [2.0, 0.84]].forEach(([z, y]) => bone(core, dark, [0, y, z], [0, y + 0.75, z - 0.45], [0.2, 0.6], 0));
    both(s => {
      bone(core, body, [0.8 * s, -0.3, 1.3], [1.0 * s, -1.05, 0.7], [0.5, 0.6], [0.36, 0.4]); bone(core, body, [1.0 * s, -1.05, 0.7], [0.95 * s, -1.25, 1.5], 0.34, 0.28); bone(core, trim, [0.95 * s, -1.25, 1.5], [0.95 * s, -1.5, 1.95], [0.36, 0.22], 0);
      bone(core, body, [0.75 * s, -0.2, -1.4], [1.05 * s, -0.95, -2.0], [0.7, 0.85], [0.45, 0.5]); bone(core, body, [1.05 * s, -0.95, -2.0], [1.0 * s, -1.0, -3.0], 0.4, 0.3); bone(core, trim, [1.0 * s, -1.0, -3.0], [1.0 * s, -1.25, -3.5], [0.38, 0.22], 0);
    });
    head = neckOf([0, 0.35, 2.0], [[0.6, 1.05], [0.5, 1.05]], [[1.0, 0.95], [0.84, 0.84], [0.72, 0.72]], body, (j, k, dy, dz) => {
      bone(j, trim, [0, -0.22, 0], [0, dy - 0.2, dz], [0.6, 0.6], [0.5, 0.5]); bone(j, dark, [0, 0.36 + dy * 0.5, dz * 0.5 + 0.1], [0, 1.0 + dy * 0.5, dz * 0.5 - 0.35], [0.18, 0.55], 0); });
    bone(head, body, [0, 0.05, -0.4], [0, 0.05, 0.85], [1.1, 0.95], [1.0, 0.8]); bone(head, body, [0, 0, 0.85], [0, -0.1, 2.15], [0.9, 0.6], [0.55, 0.38]);
    box(head, dark, 0.5, 0.18, 0.32, 0, 0.18, 1.95); box(head, trim, 0.66, 0.14, 0.95, 0, -0.34, 1.45);
    both(s => { box(head, dark, 0.3, 0.2, 0.75, 0.45 * s, 0.52, 0.45);
      bone(head, trim, [0.38 * s, 0.45, -0.2], [0.72 * s, 1.05, -1.2], 0.36, 0.22); bone(head, trim, [0.72 * s, 1.05, -1.2], [0.85 * s, 1.0, -2.1], 0.22, 0);
      bone(head, dark, [0.5 * s, -0.1, -0.1], [1.0 * s, -0.05, -1.0], [0.28, 0.32], 0); });
    eyes(head, "#ffe08a", 0.5, 0.3, 0.5);
    head.scale.setScalar(1.22);
    jaw = G(head, 0, -0.32, 0); bone(jaw, body, [0, 0, 0], [0, -0.05, 1.95], [0.8, 0.3], [0.42, 0.2]); box(jaw, lit("#ff9a3c"), 0.42, 0.08, 1.3, 0, 0.17, 1.0); bone(jaw, dark, [0, -0.1, 0.5], [0, -0.55, 0.15], [0.2, 0.22], 0);
    chain(core, [0, 0, -2.3], [[0.95, 0.9], [0.72, 0.7], [0.5, 0.48], [0.32, 0.32], [0.18, 0.18]], [1.5, 1.5, 1.5, 1.2], body, (j, k, len, [w, h]) => {
      if (k < 3) bone(j, dark, [0, h * 0.4, -0.3], [0, h * 0.4 + 0.6 - k * 0.1, -0.75], [0.16, 0.5], 0);
      if (k === 3) { bone(j, dark, [0, 0, -0.9], [0, 0, -1.35], [0.2, 0.18], [1.35, 0.22]); bone(j, dark, [0, 0, -1.35], [0, 0, -2.9], [1.35, 0.22], 0); } });
    batWing(core, { at: [0.75, 0.65, 1.0], elbow: [1.5, 0.45, -0.1], wrist: [3.2, 0.55, 0.9], root: [0, -0.7, -2.9], thick: 0.36, arm: body, rib: dark, skin, skin2: shade(skin, 0.86), claw: trim,
      fingers: [[3.9, -0.15, 0.1], [3.3, -0.55, -2.0], [1.7, -0.8, -3.1], [-0.2, -0.85, -3.2]], thumb: [0.35, 0.15, 0.85] });
  } else if (kind === "wyvern") {
    // The frost wyvern: slim, two taloned legs, a crest of ice on the head, long wings swept back to sharp points, a blade on a whip tail.
    trim = sheen(trim, 0.6);
    bone(core, body, [0, 0, -2.2], [0, 0, 0], [0.7, 0.7], [1.25, 1.15], RND); bone(core, body, [0, 0, 0], [0, 0.25, 2.1], [1.25, 1.15], [0.8, 0.8], RND);
    bone(core, trim, [0, -0.25, -2.0], [0, -0.28, 0], [0.45, 0.5], [0.85, 0.85]); bone(core, trim, [0, -0.28, 0], [0, 0, 2.0], [0.85, 0.85], [0.55, 0.6]);
    [[-1.9, 0.4, 0.7], [-1.3, 0.48, 1.0], [-0.7, 0.55, 0.8], [1.3, 0.62, 0.75], [1.85, 0.64, 0.55]].forEach(([z, y, h]) => bone(core, trim, [0, y, z], [0, y + h, z - 0.35], [0.16, 0.42], 0));
    both(s => {
      bone(core, body, [0.5 * s, -0.3, -1.0], [0.8 * s, -1.15, -1.5], [0.55, 0.75], [0.32, 0.38]); bone(core, body, [0.8 * s, -1.15, -1.5], [0.75 * s, -1.5, -2.5], 0.32, 0.24);
      [-0.28, 0, 0.28].forEach(dx => bone(core, trim, [0.75 * s, -1.5, -2.5], [(0.75 + dx) * s, -2.05, -2.15], [0.2, 0.2], 0)); });
    head = neckOf([0, 0.3, 1.9], [[0.5, 0.95], [0.45, 1.0], [0.2, 1.0]], [[0.75, 0.75], [0.62, 0.62], [0.54, 0.54], [0.5, 0.5]], body, (j, k, dy, dz) => {
      bone(j, trim, [0, -0.17, 0], [0, dy - 0.15, dz], 0.4, 0.36); if (k < 2) bone(j, trim, [0, 0.28 + dy * 0.5, dz * 0.5 + 0.1], [0, 0.8 + dy * 0.5, dz * 0.5 - 0.3], [0.14, 0.4], 0); });
    bone(head, body, [0, 0.05, -0.35], [0, 0.05, 0.75], [0.8, 0.72], [0.72, 0.6]); bone(head, body, [0, 0, 0.75], [0, -0.08, 2.5], [0.62, 0.46], [0.24, 0.2]);
    bone(head, trim, [0, 0.3, -0.1], [0, 0.95, -2.4], [0.3, 0.3], 0);
    both(s => { bone(head, trim, [0.28 * s, 0.22, -0.15], [0.85 * s, 0.6, -2.0], [0.26, 0.26], 0); bone(head, trim, [0.34 * s, -0.12, -0.15], [0.8 * s, -0.2, -1.3], [0.22, 0.22], 0); box(head, dark, 0.22, 0.16, 0.6, 0.32 * s, 0.4, 0.35); });
    eyes(head, "#c8f6ff", 0.37, 0.22, 0.4, 0.14, 0.2, 0.32);
    head.scale.setScalar(1.18);
    jaw = G(head, 0, -0.26, 0); bone(jaw, body, [0, 0, 0], [0, -0.03, 2.2], [0.58, 0.22], [0.2, 0.14]); box(jaw, lit("#c8f6ff"), 0.26, 0.06, 1.3, 0, 0.12, 1.0); bone(jaw, trim, [0, -0.08, 0.5], [0, -0.5, 0.1], [0.16, 0.2], 0);
    chain(core, [0, 0, -2.1], [[0.7, 0.7], [0.5, 0.5], [0.36, 0.36], [0.25, 0.25], [0.15, 0.15]], [1.7, 1.7, 1.7, 1.4], body, (j, k, len, [w, h]) => {
      if (k < 2) bone(j, trim, [0, h * 0.4, -0.4], [0, h * 0.4 + 0.5, -0.8], [0.12, 0.4], 0);
      if (k === 3) { bone(j, trim, [0, 0, -1.2], [0, 0, -1.9], [0.14, 0.14], [0.26, 1.5]); bone(j, trim, [0, 0, -1.9], [0, 0, -3.2], [0.26, 1.5], 0); } });
    batWing(core, { at: [0.6, 0.5, 1.2], elbow: [1.7, 0.4, 0.6], wrist: [3.6, 0.5, 1.5], root: [0, -0.65, -2.7], thick: 0.34, arm: body, rib: trim, skin, skin2: shade(body, 1.18), claw: trim,
      fingers: [[4.5, -0.3, -3.8], [2.0, -0.75, -4.2], [-0.2, -0.8, -3.4]], thumb: [0.5, 0.0, 1.1] });
  } else if (kind === "lung") {
    // The storm lung: a long body that swims in an S, a tall sail of gold fins with sparks on their tips, side fins spread
    // like small wings, clawed legs, antlers, a mane, whiskers that stream back past the rider, a glowing pearl in the tail
    // flame. No wings: that is what it is.
    const n = 10, wOf = k => 1.3 - k * 0.07, spark = lit("#d8fbff"), web = sheen(trim, 0.5); sp = 1.0;
    // a fan of gold rays with pale webbing between them, spreading sideways from the body
    const fin = (parent, d, len, O = [0, 0, 0]) => { const rays = [[-0.2, 0.8, 0], [0.28, 1, -0.12], [0.75, 0.92, -0.3], [1.2, 0.62, -0.42]].map(([a, l, y]) => [O[0] + Math.cos(a) * len * l * d, O[1] + y * len * 0.5, O[2] - Math.sin(a) * len * l]);
      rays.forEach((r, i) => { bone(parent, dark, O, r, i ? 0.2 : 0.3, i ? 0.07 : 0.14); if (i) { const q = rays[i - 1], m = mix(O, mix(q, r, 0.5), 0.8); sheet(parent, web, [O, q, m, O, m, r], 0.14); } }); };
    for (let k = 0; k < n; k++) {
      const s = G(core, 0, 0, 1.4 - k * sp), w = wOf(k), w2 = wOf(k + 1), c = k % 2 ? shade(body, 0.86) : body; s.userData = { k, y: 0 }; segs.push(s);
      bone(s, c, [0, 0, 0.6], [0, 0, -0.6], [w, w * 0.95], [w2, w2 * 0.95], RND); bone(s, trim, [0, -0.2, 0.56], [0, -0.2, -0.56], [w * 0.62, w * 0.8], [w2 * 0.62, w2 * 0.8]);
      if (k !== 1) { const h = k ? 1.7 - k * 0.1 : 1.3, B = [0, w * 0.4, 0.42], tip = [0, w * 0.4 + h, -0.5], m = mix(B, tip, 0.6); bone(s, dark, B, m, [0.3, 0.9], [0.13, 0.38]); bone(s, spark, m, tip, [0.13, 0.38], 0); }   // the sail; no fin under the rider
      if (k === 3 || k === 7) both(d => { bone(s, c, [w * 0.45 * d, -0.15, 0.1], [(w * 0.5 + 0.7) * d, -0.7, -0.2], 0.42, 0.3); bone(s, dark, [(w * 0.5 + 0.7) * d, -0.7, -0.2], [(w * 0.5 + 0.8) * d, -1.15, 0.35], [0.42, 0.34], 0); });
      if (k === 2) both(d => { const f = G(s, w * 0.42 * d, 0.1, 0.2); fin(f, d, 3.0); fins.push({ f, s: d }); });
      if (k === 6) both(d => fin(s, d, 1.9, [w * 0.42 * d, 0.05, 0.1]));
    }
    const tip = segs[n - 1]; [[1.0, -2.2], [0.1, -2.7], [-0.8, -2.0]].forEach(([y, z]) => bone(tip, dark, [0, 0, -0.4], [0, y, z], [0.22, 0.66], 0));
    both(d => bone(tip, dark, [0, 0, -0.4], [1.0 * d, 0.1, -2.1], [0.5, 0.2], 0));
    bone(tip, lit("#fff7c8"), [0, 0.05, -1.25], [0, 0.05, -0.7], 0.8, 0).rotateZ(0.785); bone(tip, lit("#ffe680"), [0, 0.05, -1.25], [0, 0.05, -1.85], 0.8, 0).rotateZ(0.785);
    head = G(core, 0, 0.25, 2.7); head.userData = { k: -1, y: 0.25 }; segs.unshift(head);
    bone(head, body, [0, 0, -0.9], [0, 0.05, 0.5], [1.3, 1.15], [1.45, 1.15]); bone(head, body, [0, -0.1, 0.5], [0, -0.2, 2.2], [1.2, 0.85], [0.95, 0.6]);
    box(head, trim, 1.05, 0.36, 0.5, 0, 0.0, 2.15);
    both(s => { box(head, dark, 0.34, 0.24, 0.8, 0.58 * s, 0.6, 0.25);
      bone(head, dark, [0.45 * s, 0.5, -0.5], [0.95 * s, 1.7, -1.6], 0.34, 0.24); bone(head, dark, [0.95 * s, 1.7, -1.6], [1.55 * s, 2.2, -2.5], 0.24, 0.12); bone(head, spark, [1.55 * s, 2.2, -2.5], [1.8 * s, 2.4, -2.9], 0.14, 0); bone(head, dark, [0.74 * s, 1.2, -1.15], [0.9 * s, 2.1, -0.75], 0.2, 0);
      [[1.6, 0.35, -2.3, 0.0], [1.75, -0.1, -2.0, -0.3], [1.3, -0.75, -1.9, -0.45]].forEach(([x, y, z, y0]) => bone(head, web, [0.6 * s, y0, -0.7], [x * s, y, z], [0.26, 0.6], 0));   // the mane
      const f = G(head, 0.5 * s, -0.12, 1.95); bone(f, web, [0, 0, 0], [1.6 * s, 0.35, -0.4], 0.24, 0.22); bone(f, web, [1.6 * s, 0.35, -0.4], [2.6 * s, 0.2, -2.6], 0.22, 0.18); bone(f, web, [2.6 * s, 0.2, -2.6], [3.0 * s, -0.3, -5.0], 0.18, 0.06); feelers.push({ f, s }); });
    eyes(head, "#fff3b0", 0.72, 0.3, 0.3, 0.2, 0.34, 0.48);
    head.scale.setScalar(1.12);
    jaw = G(head, 0, -0.42, -0.2); bone(jaw, body, [0, 0, 0], [0, -0.05, 2.3], [1.0, 0.3], [0.75, 0.22]); box(jaw, lit("#9fe8ff"), 0.6, 0.08, 1.4, 0, 0.17, 1.2); bone(jaw, trim, [0, -0.1, 1.2], [0, -0.85, 0.3], [0.3, 0.4], 0);
    seat = segs[2]; seatY = 0.75;
  } else if (kind === "bone") {
    // The bone wyrm: a bare spine and ribcage around a glowing heart, a horned skull with burning sockets, torn wings.
    body = sheen(body, 0.45);
    const cord = lit(dark);   // the glow runs down the spine from skull to tail tip and shows between the vertebrae
    box(core, cord, 0.32, 0.4, 5.0, 0, 0.45, -0.2);
    for (let k = 0; k < 7; k++) { const z = 2.0 - k * 0.72; both(s => box(core, body, 0.22, 0.44, 0.4, 0.26 * s, 0.38, z)); if (k < 1 || k > 2) bone(core, body, [0, 0.55, z + 0.1], [0, 1.15, z - 0.3], [0.16, 0.36], 0); }
    [1.0, 1.15, 1.2, 1.05, 0.85].forEach((r, k) => both(s => { const z = 1.7 - k * 0.72;
      bone(core, body, [0.15 * s, 0.4, z], [1.0 * r * s, 0.05, z - 0.12], 0.22); bone(core, body, [1.0 * r * s, 0.05, z - 0.12], [0.9 * r * s, -0.95 * r, z - 0.26], 0.22, 0.18); bone(core, body, [0.9 * r * s, -0.95 * r, z - 0.26], [0.22 * s, -1.35 * r, z - 0.32], 0.18, 0.08); }));
    heart = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), lit(dark)); heart.position.set(0, -0.3, -0.2);
    [-0.1, -0.82, -1.54].forEach((z, i) => both(s => bone(core, cord, [0.2 * s, -0.2, z], [(1.75 - i * 0.2) * s, 0.75, z - 0.35], [0.3, 0.26], 0)));   // its light leaks out between the ribs heart.userData.keep = true; core.add(heart);
    box(core, body, 1.3, 0.3, 0.6, 0, 0.45, 1.75); box(core, body, 1.0, 0.34, 0.7, 0, 0.3, -2.1);
    both(s => { bone(core, body, [0.45 * s, 0.2, -2.1], [0.75 * s, -0.75, -2.5], 0.26, 0.2); bone(core, body, [0.75 * s, -0.75, -2.5], [0.7 * s, -0.95, -3.5], 0.2, 0.16); [-0.22, 0.22].forEach(dx => bone(core, body, [0.7 * s, -0.95, -3.5], [(0.7 + dx) * s, -1.35, -3.85], 0.16, 0)); });
    head = neckOf([0, 0.45, 2.1], [[0.5, 0.9], [0.45, 0.9], [0.25, 0.9]], [0.26, 0.26, 0.26, 0.26], cord, (j, k, dy, dz) => { [0.28, 0.76].forEach(t => box(j, body, 0.52, 0.46, 0.3, 0, dy * t, dz * t).rotation.x = -Math.atan2(dy, dz)); bone(j, body, [0, dy * 0.5 + 0.2, dz * 0.5], [0, dy * 0.5 + 0.7, dz * 0.5 - 0.3], [0.14, 0.3], 0); });
    bone(head, body, [0, 0.1, -0.5], [0, 0.1, 0.6], [1.2, 1.05], [1.1, 0.9]); bone(head, body, [0, 0, 0.6], [0, -0.1, 2.05], [0.85, 0.6], [0.5, 0.36]);
    box(head, trim, 0.3, 0.12, 0.5, 0, 0.26, 1.6);
    both(s => { box(head, trim, 0.2, 0.5, 0.62, 0.5 * s, 0.22, 0.22); box(head, cord, 0.14, 0.28, 0.34, 0.56 * s, 0.22, 0.22);
      bone(head, cord, [0.58 * s, 0.3, 0.05], [1.75 * s, 1.35, -1.5], [0.3, 0.42], 0);   // the socket fire streams back, so it shows from behind
      bone(head, body, [0.45 * s, 0.5, -0.3], [1.15 * s, 0.95, -1.0], 0.4, 0.34); bone(head, body, [1.15 * s, 0.95, -1.0], [1.55 * s, 0.4, -1.5], 0.34, 0.26); bone(head, body, [1.55 * s, 0.4, -1.5], [1.4 * s, -0.35, -0.9], 0.26, 0);
      [0.9, 1.3, 1.7].forEach(z => bone(head, body, [0.26 * s, -0.28, z], [0.26 * s, -0.66, z], 0.17, 0)); });
    head.scale.setScalar(1.2);
    jaw = G(head, 0, -0.42, -0.2); jawRest = 0.2;
    both(s => { bone(jaw, body, [0.45 * s, 0, 0], [0.16 * s, -0.08, 2.1], 0.22, 0.16); [1.2, 1.65].forEach(z => bone(jaw, body, [0.2 * s, 0.0, z], [0.2 * s, 0.34, z], 0.15, 0)); });
    box(jaw, body, 0.44, 0.18, 0.3, 0, -0.08, 2.05);
    chain(core, [0, 0.4, -2.5], [0.26, 0.25, 0.24, 0.22, 0.2, 0.16], [1.0, 1.0, 1.0, 1.0, 1.0], cord, (j, k, len) => {
      const w = 0.48 - k * 0.04; [-0.25, -0.75].forEach(z => box(j, body, w, w * 0.9, 0.3, 0, 0, z)); box(j, cord, 0.2, 0.14, 1.0, 0, w * 0.45, -0.5); bone(j, body, [0, 0.15, -0.3], [0, 0.62 - k * 0.06, -0.62], [0.13, 0.3], 0);
      if (k === 4) { bone(j, body, [0, 0, -0.9], [0, 0.5, -2.3], [0.2, 0.5], 0); bone(j, body, [0, 0, -0.9], [0, -0.35, -1.7], [0.18, 0.36], 0); } });
    batWing(core, { at: [0.55, 0.6, 1.4], elbow: [1.5, 0.5, 0.4], wrist: [3.3, 0.6, 1.2], root: [0, -0.6, -2.6], thick: 0.32, arm: body, skin, skin2: shade(skin, 1.7), claw: body, tatter: true,
      fingers: [[4.1, -0.15, -0.3], [3.6, -0.5, -2.6], [2.0, -0.75, -3.7], [-0.2, -0.8, -3.4]], thumb: [0.4, 0.1, 0.9] });
    seatY = 0.7;
  } else if (kind === "gold") {
    // The gold hoarder: a fat round body on stubby legs, a wide head with jowls, a little crown, wings far too small for it.
    body = sheen(body, 0.42);
    bone(core, body, [0, -0.1, -2.3], [0, -0.4, -1.2], [1.6, 1.5], [3.0, 2.9], RND); bone(core, body, [0, -0.4, -1.2], [0, -0.4, 0.6], [3.0, 2.9], [3.4, 3.3], RND); bone(core, body, [0, -0.4, 0.6], [0, 0.2, 2.1], [3.4, 3.3], [1.6, 1.5], RND);
    bone(core, trim, [0, -0.6, -2.1], [0, -1.0, -1.2], [1.1, 1.2], [2.2, 2.4], RND); bone(core, trim, [0, -1.0, -1.2], [0, -1.0, 0.6], [2.2, 2.4], [2.6, 2.8], RND); bone(core, trim, [0, -1.0, 0.6], [0, -0.2, 2.0], [2.6, 2.8], [1.2, 1.2], RND);
    [[-2.0, 0.78], [-1.3, 1.08], [-0.6, 1.22], [1.4, 0.98]].forEach(([z, y]) => bone(core, dark, [0, y - 0.1, z], [0, y + 0.45, z - 0.2], [0.5, 0.6], [0.2, 0.2]));
    both(s => { [[1.1, 1.15], [-1.4, 1.15]].forEach(([z, x]) => { bone(core, body, [x * s, -1.1, z], [(x + 0.25) * s, -2.3, z + 0.2], [0.95, 0.95], [0.7, 0.7], RND); [-0.25, 0, 0.25].forEach(dx => bone(core, trim, [(x + 0.25 + dx) * s, -2.25, z + 0.4], [(x + 0.25 + dx * 1.4) * s, -2.5, z + 0.95], [0.24, 0.3], 0)); }); });
    head = neckOf([0, 0.35, 1.9], [[0.55, 0.85]], [[1.5, 1.4], [1.3, 1.25]], body, (j, k, dy, dz) => bone(j, trim, [0, -0.35, 0], [0, dy - 0.35, dz], [1.0, 0.9], [0.9, 0.8]));
    bone(head, body, [0, 0.1, -0.5], [0, 0.1, 0.8], [1.7, 1.45], [1.6, 1.3], 0.2); bone(head, body, [0, -0.1, 0.8], [0, -0.22, 1.95], [1.35, 0.95], [1.05, 0.7], 0.2);
    box(head, dark, 0.8, 0.2, 0.34, 0, 0.22, 1.8);
    both(s => { box(head, trim, 0.36, 0.6, 0.8, 0.78 * s, -0.35, 0.35); box(head, dark, 0.34, 0.2, 0.6, 0.62 * s, 0.85, 0.4); bone(head, trim, [0.7 * s, 0.7, -0.3], [1.15 * s, 1.25, -0.9], 0.4, 0); });
    eyes(head, "#ffffff", 0.8, 0.5, 0.4, 0.14, 0.3, 0.36);
    box(head, lit("#fff3a0"), 0.9, 0.24, 0.9, 0, 0.95, -0.05); [[-0.34, 0.3], [0.34, 0.3], [-0.34, -0.4], [0.34, -0.4], [0, 0.3]].forEach(([x, z], i) => bone(head, lit("#fff3a0"), [x, 1.05, z], [x, i === 4 ? 1.85 : 1.6, z], 0.26, 0));
    box(head, lit("#ff4d6d"), 0.26, 0.2, 0.1, 0, 0.95, 0.42);
    jaw = G(head, 0, -0.55, -0.1); bone(jaw, body, [0, 0, 0], [0, -0.03, 1.95], [1.3, 0.4], [0.95, 0.3]); box(jaw, lit("#ffb347"), 0.7, 0.08, 1.2, 0, 0.22, 1.1);
    chain(core, [0, -0.1, -2.2], [[1.5, 1.4], [1.05, 0.95], [0.66, 0.6], [0.36, 0.34]], [1.1, 1.0, 0.9], body, (j, k, len, [w, h]) => {
      box(j, dark, 0.46, 0.3, 0.44, 0, h * 0.42, -len * 0.5); if (k === 2) { bone(j, lit("#fff6c8"), [0, 0, -1.4], [0, 0, -0.8], [1.0, 1.0], 0).rotateZ(0.785); bone(j, lit("#ffe27a"), [0, 0, -1.4], [0, 0, -2.15], [1.0, 1.0], 0).rotateZ(0.785); } });
    batWing(core, { at: [1.4, 1.0, 0.7], elbow: [0.9, 0.35, -0.1], wrist: [1.8, 0.5, 0.5], root: [0, -0.65, -1.7], thick: 0.36, arm: body, rib: body, skin, skin2: shade(skin, 0.8), claw: trim,
      fingers: [[2.0, -0.1, -0.2], [1.5, -0.45, -1.5], [-0.1, -0.55, -1.8]], thumb: [0.25, 0.1, 0.6] });
    seatY = 1.25;
  } else {
    // The jade serpent: a feathered snake. Banded bird wings, a headdress of plumes, a beak, three long tail feathers.
    const n = 6, sp = 1.2, wOf = k => 1.3 - k * 0.13, cols = [body, trim, dark];
    for (let k = 0; k < n; k++) {
      const s = G(core, 0, 0, 1.4 - k * sp), w = wOf(k), w2 = wOf(k + 1), c = k % 2 ? shade(body, 0.86) : body; s.userData = { k, y: 0 }; segs.push(s);
      bone(s, c, [0, 0, 0.7], [0, 0, -0.7], [w, w * 0.92], [w2, w2 * 0.92], RND); bone(s, trim, [0, -0.2, 0.66], [0, -0.2, -0.66], [w * 0.6, w * 0.78], [w2 * 0.6, w2 * 0.78]);
      if (k > 1) bone(s, k % 2 ? dark : trim, [0, w * 0.4, 0.3], [0, w * 0.4 + 0.55, -0.5], [0.22, 0.7], 0);
    }
    [[0, 4.8, 0], [1, 4.0, 0.42], [-1, 4.0, -0.42]].forEach(([s, len, a], i) => { const f = G(segs[n - 1], 0.18 * s, 0, -0.5); feather(f, [0, 0, 0.2], [Math.sin(a) * len, 0, -Math.cos(a) * len], i ? 0.42 : 0.5, [body, trim, dark, "#ffffff"], [0, 0.5, 0.7, 0.86, 1]); f.userData.sway = a; tail.push(f); });
    featherWing(segs[0], [0.6, 0.35, -0.2], [2.8, 0.45, 0.5], cols);
    head = G(core, 0, 0.45, 2.75); head.userData = { k: -1, y: 0.45 }; segs.unshift(head);
    bone(head, body, [0, -0.45, -0.85], [0, 0.1, 0.1], [1.15, 1.05], [1.0, 0.95]); bone(head, trim, [0, -0.62, -0.75], [0, -0.1, 0.1], [0.7, 0.8], [0.6, 0.7]);
    bone(head, body, [0, 0.12, -0.2], [0, 0.12, 0.95], [1.2, 1.05], [1.05, 0.85]); bone(head, trim, [0, 0.1, 0.95], [0, -0.2, 2.3], [0.85, 0.62], [0.26, 0.2]);
    both(s => box(head, dark, 0.26, 0.18, 0.6, 0.5 * s, 0.62, 0.45));
    eyes(head, "#ffffff", 0.56, 0.35, 0.45, 0.14, 0.26, 0.34);
    [[0, 2.5, trim], [0.5, 2.2, dark], [-0.5, 2.2, dark], [1.0, 1.8, trim], [-1.0, 1.8, trim]].forEach(([a, len, c]) => bone(head, c, [Math.sin(a) * 0.3, 0.55, -0.2], [Math.sin(a) * len, 0.55 + Math.cos(a) * len * 0.8, -0.2 - len * 0.55], [0.36, 0.3], [0.12, 0.1]));
    head.scale.setScalar(1.12);
    jaw = G(head, 0, -0.3, 0); bone(jaw, trim, [0, 0, 0], [0, -0.1, 1.9], [0.8, 0.3], [0.22, 0.14]); box(jaw, lit("#ff7a59"), 0.34, 0.06, 1.0, 0, 0.16, 0.9);
    seat = segs[2]; seatY = 0.8;
  }
  bake(g);
  return { g, core, wings, tail, segs, seat, seatY, ripple: kind === "lung" ? [0.5, 1.2] : kind === "jade" ? [0.22, 0.4] : null, kind, neck, head, jaw, jawRest, heart, feelers, fins, sp, fly: FLY[kind] || null };
}

// A dragon is a few hundred triangles in dozens of pieces. Drawing each piece separately is slow with ten dragons in the
// sky, so the pieces that move together (the body, the head, each wing panel, each tail joint) are merged into one mesh
// per group, with the colour on the vertices. Glowing pieces go in the same mesh: `glow` tells the shader to skip the light.
// LIFT is how much of its own colour every piece keeps in shadow, which holds the flat, 2D look from any side.
const LIFT = 0.22, BOXN = BOX.toNonIndexed(), PAINT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
PAINT.onBeforeCompile = s => {
  s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float glow;\nvarying float vGlow;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = glow;");
  s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vGlow;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;\ndiffuseColor.rgb *= 1.0 - vGlow;");
};
function bake(root) {
  const groups = []; root.traverse(o => { if (o.isGroup) groups.push(o); });
  const v = new THREE.Vector3();
  for (const grp of groups) {
    const parts = grp.children.filter(m => m.isMesh && !m.userData.keep); if (!parts.length) continue;
    const pos = [], col = [], glow = [];
    for (const m of parts) {
      m.updateMatrix(); const p = (m.geometry === BOX ? BOXN : m.geometry.index ? m.geometry.toNonIndexed() : m.geometry).attributes.position, c = m.material.color, e = m.material.isMeshBasicMaterial ? 1 : m.material.userData.lift ?? LIFT;
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).applyMatrix4(m.matrix); pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); glow.push(e); }
      grp.remove(m);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute("glow", new THREE.Float32BufferAttribute(glow, 1));
    geo.computeVertexNormals(); grp.add(new THREE.Mesh(geo, PAINT));
  }
}

// ---------- movement ----------
// Wings beat with the outer panel a little behind the inner one and folding back on the way up; in a glide they spread,
// hold and tremble. The neck and head lean into a turn while the tail swings out behind it. Long bodies ripple.
export function animateDragon(v, r, clock, dt) {
  const A = v.anim || (v.anim = { glide: r.gliding ? 1 : 0, jaw: 0 }), ease = Math.min(1, (dt || 0.016) * 6);
  A.glide += ((r.gliding ? 1 : 0) - A.glide) * ease;
  const gl = A.glide, beat = 1 - gl, f = r.flap, id = r.id || 0, roll = r.roll || 0, pitch = r.pitch || 0, duel = r.state === "duel";
  const tuck = Math.max(0, Math.min(1, ((r.speed || 30) - 38) / 20)) * (0.4 + 0.6 * gl);      // fast: the wings sweep back
  const up = Math.max(0, Math.cos(f)), F = v.fly;
  if (F) for (const w of v.wings) {
    const flutter = Math.sin(clock * 9 + id + w.s) * 0.025 + Math.sin(clock * 1.3 + id) * 0.04;
    w.a.rotation.z = (beat * (0.08 + Math.sin(f) * F.amp) + gl * (F.di + flutter - tuck * 0.1)) * w.s;          // a glide holds a gull shape: arms up, hands down
    w.b.rotation.z = (beat * (Math.sin(f - F.lag) * F.amp2 - up * 0.25) + gl * (-F.di * 1.3 + flutter * 1.6)) * w.s;
    w.a.rotation.y = (beat * up * F.fold * 0.4 + tuck * 0.3) * w.s;
    w.b.rotation.y = (beat * up * F.fold + tuck * 0.5) * w.s;
    w.a.rotation.x = -Math.cos(f) * 0.14 * beat;
  }
  if (!v.ripple) v.core.position.y = -Math.sin(f) * 0.16 * beat;                                  // the body bobs against the wing beat
  v.neck?.forEach((j, k) => { j.rotation.y = -roll * 0.28 + Math.sin(clock * 1.6 + id + k) * 0.04; j.rotation.x = pitch * 0.12 + Math.sin(f - 0.6 - k * 0.5) * 0.05 * beat + (duel ? -0.1 : 0); });
  if (v.head && !v.ripple) { v.head.rotation.z = -roll * 0.55; v.head.rotation.y = -roll * 0.3 + Math.sin(clock * 0.9 + id) * 0.06; v.head.rotation.x = Math.sin(f - 1.6) * 0.06 * beat + (duel ? -0.12 : 0.04); }
  if (v.jaw) { const want = duel ? 0.42 + Math.sin(clock * 7 + id) * 0.2 : v.jawRest + Math.max(0, Math.sin(clock * 0.8 + id * 2)) * 0.05; A.jaw += (want - A.jaw) * ease; v.jaw.rotation.x = A.jaw; }
  v.tail.forEach((j, k) => {
    if (j.userData.sway !== undefined) { j.rotation.y = j.userData.sway * Math.sin(clock * 1.9 + id) * 0.35 + Math.sin(clock * 2.6 + id - k) * 0.1 - roll * 0.3; j.rotation.x = Math.sin(clock * 3.1 + id + k * 1.3) * 0.1; return; }
    j.rotation.y = Math.sin(clock * 2.2 + id - k * 0.7) * (0.12 + k * 0.03) - roll * 0.32;
    j.rotation.x = Math.sin(clock * 1.7 + id - k * 0.6) * 0.05 + pitch * 0.1 - Math.cos(f - 0.8 - k * 0.5) * 0.06 * beat;
  });
  if (v.ripple) {
    // Long bodies swim: a quick ripple up and down, and a slow wide S from side to side that grows toward the tail and
    // leaves the head and the rider steady. Each piece turns along the curve so the body reads as one bending line.
    const [ay, ax] = v.ripple, sp = v.sp || 1.2;
    const Y = k => Math.sin(clock * 3.4 + id - k * 0.75) * ay * Math.min(1, 0.35 + (k + 1) * 0.16);
    const X = k => Math.sin(clock * 1.9 + id - k * 0.8) * ax * Math.min(1, Math.max(0, k - 1) / 4) - roll * Math.max(0, k) * 0.12;
    for (const sg of v.segs) {
      const k = sg.userData.k; sg.position.y = sg.userData.y + Y(k); sg.position.x = X(k);
      sg.rotation.x = Math.atan((Y(k + 0.5) - Y(k - 0.5)) / sp); sg.rotation.y = -Math.atan((X(k + 0.5) - X(k - 0.5)) / sp);
      if (k < 0) { sg.rotation.z = -roll * 0.5; sg.rotation.y += -roll * 0.45 + Math.sin(clock * 0.9 + id) * 0.06; sg.rotation.x += duel ? -0.15 : 0; }
    }
  }
  for (const w of v.fins || []) { w.f.rotation.z = (0.12 + Math.sin(clock * 2.6 + id) * 0.16 - tuck * 0.15) * w.s; w.f.rotation.y = (Math.sin(clock * 1.3 + id) * 0.08 + tuck * 0.5) * w.s - roll * 0.25; }
  for (const w of v.feelers || []) { w.f.rotation.y = Math.sin(clock * 2.4 + id + w.s) * 0.18 - roll * 0.3; w.f.rotation.z = Math.sin(clock * 3.1 + id) * 0.12 * w.s; }
  if (v.heart) { v.heart.scale.setScalar(1 + Math.max(0, Math.sin(clock * 5 + id)) * 0.28); v.heart.rotation.y = clock * 1.5; }
}

// ---------- pictures for the picker ----------
// Small pictures of each dragon, drawn by the same code that draws them in the sky: posed mid-beat, framed to fill the
// picture, with a dark one-pixel edge so pale dragons still read on the pale button.
export function dragonThumbs(kinds, w = 168, h = 120) {
  const r = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(w, h, false);
  const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight("#ffffff", "#8aa08a", 1.25));
  const sun = new THREE.DirectionalLight("#fff3d6", 1.4); sun.position.set(-0.5, 1, 0.6); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 400), out = {}, p = new THREE.Vector3();
  const flat = document.createElement("canvas"); flat.width = w; flat.height = h; const x = flat.getContext("2d");
  const edge = document.createElement("canvas"); edge.width = w; edge.height = h; const e = edge.getContext("2d");
  for (const kind of kinds) {
    const v = buildDragon(kind, 0); v.anim = { glide: 0, jaw: 0.25 }; if (v.ripple) v.ripple = [v.ripple[0] * 1.5, v.ripple[1] * 1.2];   // a long body shows best in a curve
    animateDragon(v, { flap: 0.75, gliding: false, roll: 0, pitch: 0, speed: 30, id: 0.6, state: "fly", kind }, 0.4, 0);
    for (const wg of v.wings) { wg.a.rotation.set(0, 0, 0.5 * wg.s); wg.b.rotation.set(0, 0.15 * wg.s, 0.2 * wg.s); }
    scene.add(v.g); v.g.updateMatrixWorld(true);
    // stand off to the front quarter, then slide and step the camera until the dragon's own points fill the frame
    const dir = new THREE.Vector3(0.74, 0.46, 0.5).normalize(), look = new THREE.Box3().setFromObject(v.g).getCenter(new THREE.Vector3()); let dist = 30;
    for (let pass = 0; pass < 5; pass++) {
      cam.position.copy(look).addScaledVector(dir, dist); cam.lookAt(look); cam.updateMatrixWorld(true);
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      v.g.traverse(m => { if (!m.isMesh) return; const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i++) { p.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).project(cam); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } });
      const half = Math.tan(cam.fov * Math.PI / 360) * dist, right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      look.addScaledVector(right, (x0 + x1) / 2 * half * cam.aspect).addScaledVector(upv, (y0 + y1) / 2 * half);
      dist *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / 0.9;
    }
    cam.position.copy(look).addScaledVector(dir, dist); cam.lookAt(look); r.render(scene, cam); scene.remove(v.g);
    e.clearRect(0, 0, w, h); for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) e.drawImage(r.domElement, dx, dy);
    e.globalCompositeOperation = "source-in"; e.fillStyle = "#23304a"; e.fillRect(0, 0, w, h); e.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, w, h); x.drawImage(edge, 0, 0); x.drawImage(r.domElement, 0, 0); out[kind] = flat.toDataURL("image/png");
  }
  r.dispose(); r.forceContextLoss?.();
  return out;
}

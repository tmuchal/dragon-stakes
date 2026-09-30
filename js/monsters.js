// The wild monsters of Dragon Stakes: an imp, a griffin, a sea serpent and a gargoyle. They carry a hoard and no rider.
// Same flat low-poly style as the dragons, but none of them can be mistaken for one: different shapes, different colours,
// and the hoard (a sack, a chest, a gold collar with a purse) always in plain sight. A bigger hoard is a bigger sack.
// Contract with the view:
//   buildMonster(kind) -> { g, core, wings, segs, sack, mark, scale, tall, kind }
//     g     the whole monster (the view sets position, yaw and scale)      core  the body (animateMonster leans and rolls it)
//     sack  the hoard, scaled by how much it holds                          mark  the "!" in a ring shown while it dares someone
//     tall  how high above it a speech bubble goes
//   animateMonster(v, monster, clock)   every frame; monster has state "roam" | "taunt" | "dare" | "spin" | "flee" and hoard
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { Bag, G } from "./scenery.js";

export const MONSTER_KINDS = ["imp", "griffin", "serpent", "gargoyle"];
const PAINT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const SHINE = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
const GOLD = "#ffd24a", COIN = "#ffe27a", UP = Math.PI / 2;

// One moving piece: a group at a joint, with every shape drawn into it merged into a single mesh.
function part(parent, x, y, z, draw, material = PAINT) {
  const g = new THREE.Group(), bag = new Bag(); g.position.set(x, y, z); parent.add(g);
  draw((geo, c, sx, sy, sz, px, py, pz, ry, rx, rz) => bag.add(G[geo], c, sx, sy, sz, px, py, pz, ry, rx, rz));
  g.add(bag.mesh(material)); return g;
}
// the dare sign, the same for all four: a fat "!" inside a gold ring, drawn without light so it shows from far away
let MARK = null;
const markGeo = () => {
  if (MARK) return MARK;
  const b = new Bag(); b.add(G.box, "#fff3b0", 0.5, 1.3, 0.5, 0, 0.3, 0); b.add(G.box, "#fff3b0", 0.5, 0.45, 0.5, 0, -0.85, 0);
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; b.add(G.box, k % 2 ? GOLD : "#ffb52e", 0.82, 0.26, 0.26, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0, 0, 0, a + UP); }
  return MARK = b.geometry();
};
// a sack of coins: a round bag, a tied neck, gold showing at the top and a coin stitched on the front
const sackInto = (add, cloth, dark) => {
  add("blob", cloth, 1, 1.05, 1, 0, -0.85, 0, 0.4); add("blob", dark, 0.8, 0.5, 0.8, 0, -1.35, 0, 1.1); add("cyl", dark, 0.34, 0.3, 0.34, 0, 0.05, 0);
  add("blob", COIN, 0.42, 0.26, 0.42, 0, 0.32, 0); add("oct", GOLD, 0.34, 0.1, 0.34, 0, -0.8, 0.93, 0, UP);
};

export function buildMonster(kind) {
  const g = new THREE.Group(), core = new THREE.Group(), wings = [], segs = []; g.add(core);
  let sack, scale = 1.5, tall = 5, beat = 9, swing = 0.7, rest = 0;   // rest: how far the wings are held up between beats
  // a wing of one or two panels: `inner` and `outer` draw each panel, s is +1 for one side and -1 for the other
  // `twist` tips the leading edge up, so the wing shows some of its face from in front and is never just a line
  // A slab of wing between a front edge (zf, yf) and a rear edge (zr, yr) that hangs lower. Wings are built from these,
  // so every wing is curved like a hand held into the wind and has a face to show from dead ahead and dead behind.
  const slab = (add, c, cx, w, zf, yf, zr, yr, th = 0.2) => { const dz = zf - zr, dy = yf - yr, len = Math.hypot(dz, dy); add("box", c, w, th, len, cx, (yf + yr) / 2, (zf + zr) / 2, 0, -Math.asin(dy / len)); };
  const wing = (x, y, z, len, inner, outer, twist = 0) => [1, -1].forEach(s => {
    const a = part(core, x * s, y, z, add => inner(add, s)); a.rotation.x = -twist;
    const b = outer ? part(a, len * s, 0, 0, add => outer(add, s)) : null; wings.push({ a, b, s });
  });

  if (kind === "imp") {
    // The imp: a small purple pest with bat ears bigger than its head, a wide grin, and a sack swinging from its feet.
    const body = "#9b4fd0", belly = "#dcaef2", dark = "#5a2a86";
    part(core, 0, 0, 0, add => {
      add("blob", body, 1.1, 1, 1.4, 0, 0, 0); add("blob", belly, 0.8, 0.7, 1, 0, -0.28, 0.2, 1); add("blob", body, 1.2, 1.1, 1.15, 0, 0.8, 1.35, 0.5);
      for (const s of [1, -1]) {
        add("pyr", body, 0.62, 1.9, 0.2, 1.0 * s, 1.95, 1.15, 0, 0, -0.55 * s); add("pyr", "#ff8ac2", 0.36, 1.25, 0.22, 0.98 * s, 1.8, 1.22, 0, 0, -0.55 * s);
        add("box", "#ffe14a", 0.36, 0.42, 0.12, 0.43 * s, 0.98, 2.36); add("box", "#1a1024", 0.14, 0.24, 0.14, 0.43 * s, 0.95, 2.4);
        add("box", dark, 0.22, 0.9, 0.22, 0.34 * s, -1.0, 0.05); add("pyr", "#ffffff", 0.12, 0.26, 0.12, 0.26 * s, 0.34, 2.36, 0, Math.PI);
      }
      add("box", "#3a1656", 0.84, 0.16, 0.12, 0, 0.5, 2.34); add("box", dark, 0.14, 0.14, 1.7, 0, 0.2, -1.8, 0, -0.35); add("cone", dark, 0.4, 0.7, 0.4, 0, 0.95, -2.75, 0, -UP - 0.35);
    });
    wing(0.55, 0.55, -0.15, 0, (add, s) => {
      add("box", body, 2.5, 0.26, 0.28, 1.25 * s, 0.08, 0.62);
      slab(add, dark, 1.2 * s, 2.3, 0.55, 0, -0.15, -0.24, 0.17); slab(add, "#7038a6", 1.2 * s, 2.3, -0.15, -0.24, -0.7, -0.62, 0.17);
      for (let k = 0; k < 3; k++) add("pyr", "#7038a6", 0.38, 0.75, 0.17, (0.5 + k * 0.75) * s, -0.82, -0.98, 0, -UP - 0.62);
    }, null, 0.12);
    sack = part(core, 0, -1.5, 0.05, add => sackInto(add, "#c69a55", "#8a6a3f"));
    scale = 1.45; tall = 4.6; beat = 17; swing = 0.8; rest = 0.3;
  } else if (kind === "griffin") {
    // The griffin: a lion's body, an eagle's white head and yellow beak, broad banded wings, a treasure chest in its claws.
    const fur = "#d9a441", pale = "#f0cf8a", white = "#fbf7ee", beak = "#ffb52e", brown = "#8a5a3a", dark = "#3a2a20";
    part(core, 0, 0, 0, add => {
      add("box", fur, 1.9, 1.7, 4.2, 0, 0, 0); add("box", pale, 1.4, 0.5, 3.6, 0, -0.9, 0); add("blob", white, 1.3, 1.35, 1.2, 0, 0.2, 2); add("box", white, 1.1, 1.4, 1.3, 0, 1.05, 2.6, 0, -0.5);
      add("box", white, 1.25, 1.2, 1.5, 0, 1.8, 3.4); add("box", beak, 0.6, 0.42, 1.0, 0, 1.78, 4.5); add("pyr", beak, 0.42, 0.7, 0.42, 0, 1.36, 4.86, Math.PI / 4, Math.PI); add("box", "#e08a1a", 0.42, 0.18, 0.7, 0, 1.46, 4.3);
      for (const s of [1, -1]) {
        add("box", "#1a1024", 0.12, 0.3, 0.32, 0.63 * s, 1.95, 3.75); add("box", beak, 0.1, 0.12, 0.5, 0.64 * s, 2.18, 3.75); add("pyr", white, 0.28, 0.8, 0.28, 0.46 * s, 2.6, 3.0, 0, -0.45);
        add("box", fur, 0.65, 1.4, 0.8, 0.78 * s, -1.2, -1.4); add("box", pale, 0.7, 0.35, 1.0, 0.78 * s, -1.95, -1.25); add("box", beak, 0.34, 1.3, 0.34, 0.7 * s, -1.35, 1.35);
      }
      add("box", fur, 0.26, 0.26, 2.8, 0, 0.35, -3.4, 0, 0.28); add("blob", brown, 0.55, 0.55, 0.8, 0, 1.15, -4.85);
    });
    const feathers = (add, s, len, tip) => {
      add("box", dark, len, 0.38, 0.52, len / 2 * s, 0.1, 1.2);
      for (let k = 0; k < 4; k++) {   // four strips side by side, each banded brown, white, brown, curving down to a pointed tip
        const w = len / 4, x = (k + 0.5) * w * s, q = tip ? 1 - k * 0.14 : 1, end = tip && k > 1 ? dark : brown;
        slab(add, brown, x, w + 0.02, 1, 0, 1 - 1.4 * q, -0.24 * q, 0.22); slab(add, white, x, w + 0.02, 1 - 1.4 * q, -0.24 * q, 1 - 2 * q, -0.48 * q, 0.2); slab(add, end, x, w + 0.02, 1 - 2 * q, -0.48 * q, 1 - 2.9 * q, -1.02 * q, 0.2);
        add("pyr", end, w * 0.62, 0.8, 0.18, x, -1.2 * q, 1 - 3.22 * q, 0, -UP - 0.55);
      }
    };
    wing(0.95, 0.85, 0.5, 3.7, (add, s) => feathers(add, s, 3.7, false), (add, s) => feathers(add, s, 3.5, true), 0.06);
    sack = part(core, 0, -2.75, 1.25, add => {
      add("box", "#7a4a2a", 1.7, 1.0, 1.15, 0, 0, 0); add("box", "#5a3420", 1.8, 0.35, 1.25, 0, 0.72, -0.3, 0, -0.5); add("box", COIN, 1.4, 0.3, 0.85, 0, 0.55, 0.05);
      for (const x of [-0.6, 0.6]) add("box", GOLD, 0.2, 1.06, 1.2, x, 0, 0); add("box", GOLD, 0.34, 0.4, 0.12, 0, 0.1, 0.6);
    });
    scale = 1.35; tall = 6.4; beat = 5.5; swing = 0.5; rest = 0.24;
  } else if (kind === "serpent") {
    // The sea serpent: a long indigo body that swims through the air in waves, coral fins, a frill, a gold collar with a purse.
    const body = "#3b4fc4", belly = "#a8e0ff", fin = "#ff7a6b", dark = "#232a7a", N = 7, wOf = k => 1.35 - k * 0.12;
    const head = part(core, 0, 0.1, 2.4, add => {
      add("box", body, 1.5, 1.2, 2.2, 0, 0, 0.3); add("box", belly, 1.2, 0.4, 1.9, 0, -0.62, 0.45); add("box", body, 1.1, 0.7, 1.2, 0, -0.1, 1.9); add("box", dark, 1.6, 0.4, 0.8, 0, 0.62, -0.4);
      for (const s of [1, -1]) {
        add("box", "#fff3b0", 0.12, 0.36, 0.42, 0.76 * s, 0.22, 0.75); add("box", "#1a1024", 0.14, 0.2, 0.16, 0.78 * s, 0.22, 0.8);
        for (let k = 0; k < 3; k++) add("pyr", fin, 0.5, 1.7 - k * 0.3, 0.22, (0.95 + k * 0.12) * s, 0.2 - k * 0.45, -0.5, 0, 0, (-1.1 - k * 0.35) * s);    // the frill
        add("box", belly, 0.08, 0.08, 1.8, 0.5 * s, -0.4, 2.9, 0.3 * s); add("pyr", "#ffffff", 0.14, 0.34, 0.14, 0.34 * s, -0.5, 2.3, 0, Math.PI);
      }
      add("pyr", fin, 0.24, 1.3, 1.0, 0, 1.1, 0.1);
    });
    head.userData.k = -1; segs.push(head);
    for (let k = 0; k < N; k++) {
      const w = wOf(k), s = part(core, 0, 0, 1.1 - k * 1.65, add => {
        add("box", k % 2 ? dark : body, w, w * 0.92, 1.8, 0, 0, 0); add("box", belly, w * 0.7, 0.28, 1.6, 0, -w * 0.46, 0);
        if (k < N - 1) add("pyr", fin, 0.24, 1.25 - k * 0.1, 1.1, 0, w * 0.46 + 0.5, 0);
        if (k === 0) add("oct", GOLD, w * 0.78, 0.55, w * 0.78, 0, 0, 0.35, 0, UP);                                       // the collar
        if (k === 1 || k === 4) for (const d of [1, -1]) add("pyr", fin, 0.7, 1.9, 0.24, (w / 2 + 0.7) * d, -0.15, 0, 0, 0.5, -1.2 * d);
        if (k === N - 1) { add("pyr", fin, 0.26, 2.2, 1.5, 0, 0.5, -1.5, 0, -0.9); add("pyr", fin, 0.26, 2.0, 1.4, 0, -0.5, -1.5, 0, -2.2); }
      });
      s.userData.k = k; segs.push(s);
    }
    sack = part(segs[1], 0, -0.75, 0.35, add => { add("box", GOLD, 0.12, 0.5, 0.12, 0, -0.1, 0); add("blob", "#c0392f", 0.6, 0.66, 0.6, 0, -0.75, 0, 0.4); add("blob", COIN, 0.34, 0.22, 0.34, 0, -0.18, 0); add("oct", GOLD, 0.24, 0.1, 0.24, 0, -0.75, 0.56, 0, UP); });
    scale = 1.3; tall = 4.4;
  } else {
    // The gargoyle: a block of grey stone with horns and burning eyes, wings far too small, hugging its sack to its chest.
    const stone = "#8f9299", dark = "#5f6269", light = "#b4b8bf", moss = "#6f8f5a", eye = "#ff5a3a";
    part(core, 0, 0, 0, add => {
      add("box", stone, 2.4, 2.2, 2.6, 0, 0, 0); add("box", light, 3, 1, 1.7, 0, 1.0, 0.4); add("box", stone, 1.55, 1.35, 1.45, 0, 0.95, 1.95); add("box", dark, 1.35, 0.45, 1.05, 0, 0.22, 2.25);
      add("box", dark, 1.6, 0.24, 0.34, 0, 1.4, 2.55); add("box", moss, 1.3, 0.14, 1.1, 0.45, 1.56, 0.3); add("box", moss, 0.7, 0.12, 0.8, -0.7, 1.16, -0.7);
      for (const s of [1, -1]) {
        add("pyr", dark, 0.4, 1.5, 0.4, 0.62 * s, 2.1, 1.6, 0, -0.45, -0.35 * s); add("box", eye, 0.32, 0.24, 0.12, 0.4 * s, 1.1, 2.68); add("pyr", "#e6e2d6", 0.16, 0.4, 0.16, 0.42 * s, 0.62, 2.7);
        add("box", stone, 0.75, 1.5, 0.8, 1.5 * s, -0.35, 0.7, 0, -0.5); add("box", light, 0.8, 0.7, 0.9, 1.2 * s, -0.95, 1.55); add("box", dark, 0.85, 1.2, 1, 0.75 * s, -1.65, -0.5); add("box", stone, 0.9, 0.4, 1.3, 0.75 * s, -2.3, -0.2);
      }
      add("box", stone, 0.42, 0.42, 1.7, 0, -0.35, -2.05); add("blob", dark, 0.65, 0.65, 0.65, 0, -0.35, -3.05);
    });
    wing(1.25, 1.25, -0.4, 0, (add, s) => {
      add("box", stone, 2.1, 0.4, 0.5, 1.05 * s, 0.08, 0.8);
      slab(add, dark, 1.0 * s, 2.0, 0.65, 0, -0.2, -0.32, 0.28); slab(add, "#6d7077", 1.0 * s, 2.0, -0.2, -0.32, -1.0, -0.88, 0.28);
      for (let k = 0; k < 2; k++) add("pyr", light, 0.36, 0.8, 0.26, (0.6 + k * 0.9) * s, -1.08, -1.3, 0, -UP - 0.6);
    }, null, 0.2);
    sack = part(core, 0, -0.75, 1.75, add => sackInto(add, "#b88a4a", "#7a5a34"));
    scale = 1.5; tall = 5.6; beat = 13; swing = 0.4; rest = 0.55;
  }
  const mark = new THREE.Mesh(markGeo(), SHINE); mark.userData.shared = true; mark.visible = false; mark.position.y = tall - 0.6; g.add(mark);
  return { g, core, wings, segs, sack, mark, scale, tall, kind, beat, swing, rest, ph: Math.random() * 6.283, grow: 1 };
}

// How big the hoard looks: a few coins is a small purse, a fortune is a sack bigger than the imp that carries it.
const hoardSize = h => 0.75 + Math.min(1.5, Math.log2(1 + Math.max(0, h || 0) / 8) * 0.34);

export function animateMonster(v, m, clock) {
  const st = m.state, t = clock + v.ph, core = v.core, dare = st === "dare", spin = st === "spin", flee = st === "flee", taunt = st === "taunt";
  const rate = v.beat * (flee ? 1.6 : taunt ? 1.25 : dare || spin ? 1 : 0.7), amp = v.swing * (flee ? 1.1 : st === "roam" ? 0.45 : 1);   // roaming is mostly a glide
  for (const w of v.wings) { w.a.rotation.z = (v.rest + Math.sin(t * rate) * amp) * w.s; if (w.b) w.b.rotation.z = (Math.sin(t * rate - 0.9) * amp * 0.75 - v.rest * 1.7) * w.s; }   // the outer panel hangs below the arm: a gull's wing
  // the body: lazy when roaming, a cheeky wobble and a barrel roll when taunting, upright when daring, nose down when fleeing
  let pitch = Math.sin(t * 0.9) * 0.06, roll = Math.sin(t * 0.7) * 0.1, bob = Math.sin(t * 1.3) * 0.3, shake = 0;
  if (taunt) { const loop = t % 3.2; roll = Math.sin(t * 7) * 0.4 + (loop < 0.75 ? loop / 0.75 * 6.283 : 0); bob = Math.sin(t * 5) * 0.45; pitch = Math.sin(t * 3.5) * 0.15; }
  else if (dare) { pitch = v.kind === "serpent" ? -0.25 : -0.5; roll = Math.sin(t * 2) * 0.08; bob = Math.sin(t * 2.4) * 0.5; }
  else if (spin) { pitch = -0.35; shake = Math.sin(t * 38) * 0.12; bob = Math.abs(Math.sin(t * 9)) * 0.4; }
  else if (flee) { pitch = 0.28; roll = Math.sin(t * 9) * 0.12; bob = 0; }
  core.rotation.set(pitch, 0, roll, "YXZ"); core.position.set(shake, bob, 0);
  // a long body swims: each piece rides the same wave a little later than the one in front
  if (v.segs.length) {
    const sp = flee ? 7 : taunt ? 5 : 3, hi = flee ? 0.45 : taunt ? 0.9 : 0.65;
    for (const s of v.segs) { const k = s.userData.k, ph = t * sp - k * 0.75, a = k < 0 ? 0.4 : 1; s.position.y = (k < 0 ? 0.1 : 0) + Math.sin(ph) * hi * a; s.rotation.x = -Math.cos(ph) * hi * 0.32 * a; s.position.x = Math.sin(ph * 0.5) * 0.35 * a; }
  }
  // the hoard: it swells toward its true size, and it is shaken hard while the wheel spins
  v.grow += (hoardSize(m.hoard) - v.grow) * 0.08; v.sack.scale.setScalar(v.grow * (spin ? 1 + Math.sin(t * 26) * 0.14 : 1));
  v.sack.rotation.z = spin ? Math.sin(t * 31) * 0.55 : Math.sin(t * 2.2) * 0.12; v.sack.rotation.x = spin ? Math.sin(t * 23) * 0.3 : taunt ? Math.sin(t * 6) * 0.25 : 0;
  v.mark.visible = dare; if (dare) { v.mark.rotation.y = t * 2.6; v.mark.position.y = v.tall - 0.4 + Math.abs(Math.sin(t * 5)) * 0.7; v.mark.scale.setScalar(1 + Math.sin(t * 8) * 0.08); }
}

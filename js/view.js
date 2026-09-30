// Dragon Stakes view: a low-resolution 3D world with flat colours, and Friends drawn as 2D pixel sprites that
// always face the camera. The four on-chain views (front, back, left, right) are picked by where the camera is.
// The world itself (islands, sea, sky, clouds) is built in scenery.js; sparks and wing trails live in view-fx.js;
// the wild monsters are built in monsters.js.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { buildDragon, animateDragon } from "./dragons.js";
import { buildScenery, HAZE, Bag, G } from "./scenery.js";
import { buildMonster, animateMonster, MONSTER_KINDS } from "./monsters.js";
import { Sparks, Ribbon, setRY } from "./view-fx.js";

const BOX = new THREE.BoxGeometry(1, 1, 1), COIN = new THREE.CylinderGeometry(0.9, 0.9, 0.25, 8), COIN_MAT = new THREE.MeshBasicMaterial({ color: "#ffd24a" });
// The shield: a bubble of light that shows only at its rim, where you look along its skin, so it rings the dragon
// without covering it or the view. The player's own is fainter than everyone else's.
const BUBBLE = new THREE.SphereGeometry(6.6, 20, 14);
const bubble = strength => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { tint: { value: new THREE.Color("#bfeaff") }, strength: { value: strength } },
  vertexShader: "varying vec3 vN, vV; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }",
  fragmentShader: `uniform vec3 tint; uniform float strength; varying vec3 vN, vV;
    void main() {
      float rim = 1. - abs(dot(normalize(vN), normalize(vV))), a = floor(smoothstep(.66, 1., rim) * 3. + .5) / 3.;   // three flat bands, no soft gradient
      if (a <= 0.) discard;
      gl_FragColor = vec4(tint, a * strength);
      #include <colorspace_fragment>
    }`,
});
const SHIELD_MINE = bubble(0.3), SHIELD_THEIRS = bubble(0.75);
// a rider whose player has gone quiet is drawn as a pale ghost
const GHOST = new THREE.MeshLambertMaterial({ color: "#c9d6e6", flatShading: true, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false });
// light for the events: a shaft that fades out toward its top
const shaft = (r, h, color, opacity) => {
  const g = new THREE.CylinderGeometry(r, r, h, 14, 1, true).translate(0, h / 2, 0), c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) { const v = g.attributes.position.getY(i) > h / 2 ? 0.05 : 1; c.set([v, v, v], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); m.visible = false; m.frustumCulled = false; return m;
};
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), ease = u => u * u * (3 - 2 * u);
// marks a rider can wear: a gold crown for the one on top, a ring of light under another real player
const SHINE = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), PLAYER_RING = new THREE.TorusGeometry(5.4, 0.17, 4, 24).rotateX(Math.PI / 2), PLAYER_MAT = new THREE.MeshBasicMaterial({ color: "#7fe8ff", fog: false });
let CROWN = null;
const crownGeo = () => {
  if (CROWN) return CROWN;
  const b = new Bag(); b.add(G.oct, "#ffd24a", 1.15, 0.5, 1.15, 0, 0, 0); b.add(G.oct, "#ffb52e", 1.2, 0.16, 1.2, 0, -0.2, 0);
  for (let k = 0; k < 5; k++) { const a = k * 1.2566; b.add(G.pyr, "#ffd24a", 0.36, 0.95, 0.36, Math.sin(a) * 0.86, 0.7, Math.cos(a) * 0.86, a); b.add(G.box, k % 2 ? "#ff5a6a" : "#fff6df", 0.24, 0.24, 0.24, Math.sin(a) * 0.86, 1.25, Math.cos(a) * 0.86, a); }
  return CROWN = b.geometry();
};
const ORBITS = [[52, 15], [38, 12], [50, 32], [28, 9], [40, 46], [24, 22]];   // fight camera: how far out and how high, in order of preference
const FOG_NEAR = 300, FOG_FAR = 1080, LAUNCH = 2.6, PULL = 2.4, LIT = Math.atan2(-0.55, 0.5), rnd = Math.random;
const K = Object.fromEntries(Object.entries({
  white: "#ffffff", ice: "#cfefff", foam: "#e6f7ff", gold: "#ffd24a", pale: "#fff1c2", cream: "#fff6df", ember: "#ff8a2a", fire: "#ffd24a", hot: "#ff5a1f",
  smoke1: "#4a4348", smoke2: "#6a6268", smoke3: "#8b8388", steam: "#f1ede6", pink: "#f7a8c4", blush: "#fcd3e1", leaf1: "#e0782f", leaf2: "#e8b13a", fly: "#e8ff8a",
}).map(([k, v]) => [k, new THREE.Color(v)]));
const _box = new THREE.Box3(), texKey = (f, face, moving, i) => `${f.id}:${face}:${moving ? 1 : 0}:${i % 8}`;
// how far a wing panel reaches from its joint, so the trail can start at the tip
const reach = o => { let m = 0; for (const c of o.children) if (c.isMesh) { c.geometry.computeBoundingBox(); c.updateMatrix(); _box.copy(c.geometry.boundingBox).applyMatrix4(c.matrix); m = Math.max(m, _box.max.x, -_box.min.x); } return m; };
// free what one dragon or monster owns (its merged meshes), leaving shared shapes alone
const freeBody = g => g.traverse(o => { if (o.isMesh && (o.userData.mat || o.material).vertexColors && o.geometry !== CROWN && !o.userData.shared) o.geometry.dispose(); });

export class View {
  constructor(canvas, world, spriteOf) {
    this.canvas = canvas; this.world = world; this.spriteOf = spriteOf;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(HAZE); this.scene.fog = new THREE.Fog(HAZE, FOG_NEAR, FOG_FAR);
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.5, 2600);
    // late afternoon: warm light from the sun's side, cool light in the shade
    this.scene.add(new THREE.HemisphereLight("#fff8ea", "#8c9cc4", 1.75));
    const sun = new THREE.DirectionalLight("#ffe6bd", 2.3); sun.position.set(-0.55, 0.72, 0.5); this.scene.add(sun);
    this.riders = new Map(); this.monsters = new Map(); this.tex = new Map(); this.jobs = []; this.fx = []; this.bolts = []; this.coinPool = [];
    this.camYaw = 0; this.camLift = 0; this.dist = 19; this.look = new THREE.Vector3(); this.clock = 0; this.frame = 0; this.bank = 0;
    this._pos = new THREE.Vector3(); this._look = new THREE.Vector3(); this._v = new THREE.Vector3();
    this.acc = { lines: 0, lift: 0 };
    this.land = buildScenery(this.scene, world); this.land.fog(FOG_NEAR, FOG_FAR);
    this.smokes = this.land.emit.filter(e => e.kind === "smoke"); this.orbit = 0; this.fight = null;
    this.sparks = new Sparks(this.scene); this.trails = [new Ribbon(this.scene, 15), new Ribbon(this.scene, 15)];
    this.buildSky(); this.resize();
    // the camera's own story: a tour of cuts on the title, a launch move at take-off, a pull-back at landing
    const I = world.islands, of = t => I[Math.max(1, this.land.themes.indexOf(t))] || I[0];
    this.cuts = [{ kind: "sea", isl: I[0], dur: 6.5 }, { kind: "pass", n: 0, dur: 6 }, { kind: "hero", isl: of("volcano"), dur: 6 }, { kind: "rise", dur: 7 },
      { kind: "sea", isl: of("sakura"), dur: 6 }, { kind: "with", n: 1, dur: 6 }, { kind: "hero", isl: of("snow"), dur: 5.5 }, { kind: "wide", dur: 6.5 }];
    // each island shot stands on the lit side if it can, turned just far enough that no other island is in the way
    // (for a long-lens shot, `alone` also asks that no other island stands beside or in front of the subject)
    const alone = (t, a, d) => { const cx = t.x + Math.sin(a) * d, cz = t.z + Math.cos(a) * d; return I.every(o => { if (o === t) return true; const ox = o.x - cx, oz = o.z - cz, od = Math.hypot(ox, oz); return od - o.r > d + t.r * 0.6 || Math.acos(Math.max(-1, Math.min(1, (ox * (t.x - cx) + oz * (t.z - cz)) / (od * d)))) - Math.atan2(o.r, od) > 0.6; }); };
    const clear = (t, d0, d1, prefer, lens) => { for (let k = 0; k < 24; k++) { const a = prefer + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26; if ((!lens || alone(t, a, d0)) && [d0, (d0 + d1) / 2, d1].every(d => I.every(o => o === t || Math.hypot(t.x + Math.sin(a) * d - o.x, t.z + Math.cos(a) * d - o.z) > o.r + 30))) return a; } return prefer; };
    for (const c of this.cuts) if (c.kind === "sea") c.a = clear(c.isl, c.isl.r + 70, c.isl.r + 155, LIT + 0.35); else if (c.kind === "hero") { c.d = c.isl.r * 1.5 + 70; c.a = clear(c.isl, c.d, c.d, LIT - 0.5, true); }
    this.cut = 0; this.tourT = 0; this.pass = null; this.was = null; this.launchT = LAUNCH; this.outT = PULL; this.outFrom = new THREE.Vector3(); this.outAt = new THREE.Vector3(); this.duo = 0; this.duoSide = 0; this.duoP = new THREE.Vector3(); this.duoL = new THREE.Vector3();
    this.warm();
    // test hook: lets a script move the rider, stage monsters (view.stage = [...]), pick a title cut, and read draw calls
    if (/[?&]test\b/.test(location.search)) window.__view = this;
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    const px = Math.max(2, Math.round(h / 300));                   // about 300 rows of pixels, scaled up without smoothing
    this.r.setPixelRatio(1); this.r.setSize(Math.round(w / px), Math.round(h / px), false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.w = w; this.h = h;
  }
  // Compile every shader now, behind the title, so the first fight, crown or monster does not stall a frame.
  warm() {
    const tmp = new THREE.Group(), beasts = MONSTER_KINDS.map(k => buildMonster(k));
    tmp.add(new THREE.Mesh(BOX, new THREE.MeshBasicMaterial()), new THREE.Mesh(COIN, COIN_MAT), new THREE.Mesh(BUBBLE, SHIELD_MINE), new THREE.Mesh(BUBBLE, SHIELD_THEIRS), new THREE.Mesh(BOX, GHOST), new THREE.Mesh(crownGeo(), SHINE), new THREE.Mesh(PLAYER_RING, PLAYER_MAT), ...beasts.map(b => b.g));
    this.scene.add(tmp);
    try { this.r.compile(this.scene, this.cam); } catch { /* a missed warm-up only costs one slow frame later */ }
    this.scene.remove(tmp); beasts.forEach(b => freeBody(b.g));
  }
  // Drop everything this view made, so another view can be built on another world.
  dispose() {
    if (this.dead) return; this.dead = true;
    this.scene.traverse(o => { o.geometry?.dispose(); for (const m of o.material ? [].concat(o.material) : []) { m.map?.dispose(); m.dispose(); } o.dispose?.(); });
    for (const t of this.tex.values()) t.dispose(); this.tex.clear(); this.jobs.length = 0; this.riders.clear(); this.monsters.clear(); this.fx.length = 0;
    for (const m of [...this.bolts, ...this.coinPool]) m.material.dispose();
    this.scene.clear(); this.r.dispose(); this.r.forceContextLoss();
    if (window.__view === this) delete window.__view;
  }

  // The things in the air that the rules care about: gold rings, thermals, and a soft shadow under every flyer.
  buildSky() {
    const W = this.world, inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(m); return m; };
    const torus = new THREE.TorusGeometry(5.2, 0.75, 5, 16);
    this.ringMesh = inst(torus, new THREE.MeshBasicMaterial({ color: "#ffd24a" }), W.rings.length);
    // event rings: a storm's rings are electric blue under a shaft of pale light; the prize is a great gem under a tall beacon
    this.stormMesh = inst(torus, new THREE.MeshBasicMaterial({ color: "#8fdcff", fog: false }), Math.max(1, W.rings.filter(g => g.ev === "storm").length)); this.stormMesh.count = 0;
    this.stormShaft = shaft(17, 1, "#9fd8ff", 0.16); this.beacon = shaft(1.7, 340, "#ffd0ea", 0.8); this.beaconWide = shaft(7, 150, "#ffc0e0", 0.16);
    const gem = new Bag(); gem.add(G.pyr, "#ff7ab8", 2.4, 2.6, 2.4, 0, 1.3, 0); gem.add(G.pyr, "#ffb3d6", 2.4, 1.5, 2.4, 0, -0.75, 0, 0, Math.PI); gem.add(G.pyr, "#fff1f8", 1.1, 1.4, 1.1, 0, 2.1, 0, 0.78); gem.add(G.oct, "#ffd24a", 2.9, 0.3, 2.9, 0, -2.2, 0);
    this.gem = gem.mesh(SHINE); this.gem.visible = false; this.gem.frustumCulled = false; this.scene.add(this.stormShaft, this.beacon, this.beaconWide, this.gem); this.bolt = 0;
    this.ringGlow = inst(new THREE.RingGeometry(4.2, 7.4, 16), new THREE.MeshBasicMaterial({ color: "#ffc93a", transparent: true, opacity: 0.13, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, blending: THREE.AdditiveBlending }), W.rings.length);
    this.ringOn = W.rings.map(() => false);
    // thermals: a faint warm column, pale rings that keep rising and motes that spiral up, so a glider can see where the air lifts
    const n = W.thermals.length;
    this.liftCol = inst(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.05, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, blending: THREE.AdditiveBlending }), n);
    this.bases = W.thermals.map(th => Math.max(W.heightAt(th.x, th.z), 0));
    W.thermals.forEach((th, i) => setRY(this.liftCol.instanceMatrix.array, i, th.x, this.bases[i], th.z, 0, th.r, th.top - this.bases[i], th.r));
    this.liftRings = inst(new THREE.TorusGeometry(1, 0.045, 4, 18).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#fff6df", transparent: true, opacity: 0.75, depthWrite: false }), n * 5);
    this.liftMotes = inst(BOX, new THREE.MeshBasicMaterial({ color: "#ffe9a8" }), n * 12);
    this.shadows = inst(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#0b1830", transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 40);
  }

  dragon(rider, look) {
    const v = buildDragon(rider.kind, look);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.5 })); sprite.scale.set(3.3, 3.3, 1); sprite.position.set(0, v.seatY + 1.65, 0.3); v.seat.add(sprite);
    const shield = new THREE.Mesh(BUBBLE, SHIELD_THEIRS); shield.visible = false; v.g.add(shield);
    // where the trail starts: the two wing tips, or the end of the body for a dragon with no wings
    const tips = v.wings.length ? v.wings.map(w => ({ o: w.b, x: reach(w.b) * w.s })) : [{ o: v.segs[v.segs.length - 1] || v.core, x: 0 }];
    this.scene.add(v.g);
    // the Friend's pictures from every side and every step, drawn a couple per frame from now on, before they are needed
    for (const face of rider.f.family === "Colossus" ? ["left", "right"] : ["up", "down", "left", "right"]) for (let i = 0; i < 8; i++) this.jobs.push(rider.f, face, i);
    return { ...v, sprite, shield, tips, look, size: 1, seen: 0, face: "", fi: -1, crown: null, ring: null, ghost: false, turn: 0, toward: 0 };
  }
  // A Friend's pixels, unchanged, with a one-pixel cream edge so the black art reads against sea and sky.
  texture(f, face, moving, i) {
    const key = texKey(f, face, moving, i); let t = this.tex.get(key); if (t) return t;
    const src = this.spriteOf(f, face, moving, i), c = document.createElement("canvas"); c.width = c.height = 18;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) x.drawImage(src, dx, dy);
    x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff6df"; x.fillRect(0, 0, 18, 18);
    x.globalCompositeOperation = "source-over"; x.drawImage(src, 1, 1);
    t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; this.tex.set(key, t); return t;
  }

  // cam: null for the chase camera behind `me`, or { x, y, z, yaw } to circle a fight
  update(me, dt, cam) {
    if (this.dead) return;
    const W = this.world, C = this.cam, S = this.sparks; this.clock += dt; this.frame++;
    const clock = this.clock, SH = this.shadows.instanceMatrix.array; this.shadowN = 0;
    let built = 0;
    for (const r of W.riders) {
      const look = r.look ?? r.f.hash; let v = this.riders.get(r.id);
      if (v && v.look !== look) { this.scene.remove(v.g); if (v.crown) this.scene.remove(v.crown); v.sprite.material.dispose(); freeBody(v.g); this.riders.delete(r.id); v = null; }      // a new colourway was picked
      // Building a dragon is the heaviest thing the view does, so only one is built per frame (the player's own never waits);
      // when many riders arrive together they appear one after another over a few frames instead of stalling one frame.
      if (!v) { if (built && r !== me) continue; built++; this.riders.set(r.id, v = this.dragon(r, look)); }
      v.seen = this.frame;
      // held beside a monster while its wheel turns: the two turn to face each other, and turn back when it is over
      const mate = r.state === "spin" ? this.partner(r) : null; let yaw = r.yaw;
      v.turn = Math.max(0, Math.min(1, v.turn + dt * (mate ? 2.5 : -2.5))); if (mate) v.toward = Math.atan2(mate.x - r.x, mate.z - r.z);
      if (v.turn > 0) yaw += wrap(v.toward - r.yaw) * ease(v.turn);
      v.g.position.set(r.x, r.y, r.z); v.g.rotation.set(0, yaw, 0); v.core.rotation.set(-r.pitch, 0, r.roll, "YXZ");
      // a player who has gone quiet: a pale ghost that bobs where it was left, so nobody takes it for a live target
      const ghost = r.away === true;
      if (ghost !== v.ghost) { v.ghost = ghost; v.g.traverse(o => { if (!o.isMesh || o === v.shield || o === v.crown || o === v.ring) return; if (ghost) { o.userData.mat = o.material; o.material = GHOST; } else if (o.userData.mat) { o.material = o.userData.mat; o.userData.mat = null; } }); v.sprite.material.opacity = ghost ? 0.62 : 1; }
      if (ghost) v.g.position.y += Math.sin(clock * 1.3 + r.id) * 0.9;
      const want = 0.85 + Math.min(1.1, Math.log2(1 + r.stake / 25) * 0.3);          // a dragon grows with what it carries
      v.size += (want - v.size) * Math.min(1, dt * 2); v.g.scale.setScalar(v.size);
      animateDragon(v, r, clock, dt);
      // the shield blinks in its last moments, so you know when you can be challenged again
      const safe = r.shield > 0 && r.state === "fly"; v.shield.visible = safe && (r.shield > 1.6 || Math.floor(clock * 9) % 2 === 0);
      if (safe) { v.shield.material = r === me ? SHIELD_MINE : SHIELD_THEIRS; v.shield.scale.setScalar(1 + Math.sin(clock * 3 + r.id) * 0.035); }
      const ang = Math.atan2(C.position.x - r.x, C.position.z - r.z) - yaw, rel = Math.atan2(Math.sin(ang), Math.cos(ang));
      let face = Math.abs(rel) < 0.8 ? "down" : Math.abs(rel) > 2.35 ? "up" : rel > 0 ? "left" : "right";
      if (r.f.family === "Colossus" && (face === "down" || face === "up")) face = "right";
      const fi = Math.floor(clock * 8 + r.id);
      if (fi !== v.fi || face !== v.face) { v.fi = fi; v.face = face; v.sprite.material.map = this.texture(r.f, face, true, fi); }
      const far = Math.hypot(C.position.x - r.x, C.position.y - r.y, C.position.z - r.z);
      // a few glints ride on the shield's skin and keep pace with the dragon
      if (v.shield.visible && dt > 0 && far < 220 && rnd() < dt * (r === me ? 3 : 7)) {
        const a = rnd() * 6.283, h = rnd() * 2 - 1, w = Math.sqrt(1 - h * h) * 6.6 * v.size, sp = r.speed || 30;
        S.add(r.x + Math.sin(a) * w, r.y + h * 6.6 * v.size, r.z + Math.cos(a) * w, Math.sin(r.yaw) * sp, Math.sin(r.pitch) * sp, Math.cos(r.yaw) * sp, 0.45, 0.24, rnd() < 0.5 ? K.ice : K.white);
      }
      // the crown: gold over whoever wears it, and it grows with distance so it can be picked out across the sea
      // It hangs in the world, not on the dragon: always upright, straight above the rider's head however the dragon banks.
      if (r.crowned === true && !v.crown) { v.crown = new THREE.Mesh(crownGeo(), SHINE); v.crown.frustumCulled = false; this.scene.add(v.crown); }
      if (v.crown) {
        v.crown.visible = r.crowned === true;
        if (v.crown.visible) { const s = Math.max(1, Math.min(5, far / 55)), e = v.sprite.matrixWorld.elements; v.sprite.updateWorldMatrix(true, false); v.crown.scale.setScalar(s); v.crown.position.set(e[12], e[13] + 2 * v.size + s * 1.05 + Math.sin(clock * 2.2) * 0.2, e[14]); v.crown.rotation.y = clock * 1.3; }
      }
      // another real player: a ring of light turns under their dragon
      const other = r.human === true && r !== me; if (other && !v.ring) { v.ring = new THREE.Mesh(PLAYER_RING, PLAYER_MAT); v.ring.position.y = -2.4; v.g.add(v.ring); }
      if (v.ring) { v.ring.visible = other; if (other) { v.ring.rotation.y = clock * 1.5; v.ring.scale.setScalar(1 + Math.sin(clock * 3.2) * 0.06); } }
      // a winning streak burns: fire streams from the wing tips, a little more for every win up to five
      if (r.streak >= 2 && dt > 0 && far < 320 && r.state === "fly") {
        const n = Math.min(5, r.streak), V = this._v;
        for (const t of v.tips) if (rnd() < dt * (26 + n * 14)) { V.set(t.x, 0, 0).applyMatrix4(t.o.matrixWorld); S.add(V.x + (rnd() - 0.5) * 0.5, V.y + (rnd() - 0.5) * 0.5, V.z + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.5, 1 + rnd() * 2, (rnd() - 0.5) * 1.5, 0.25 + n * 0.06 + rnd() * 0.15, 0.24 + n * 0.055, rnd() < 0.3 ? K.fire : rnd() < 0.6 ? K.ember : K.hot, -3); }
      }
      // a soft shadow straight below, so height over sea and land is easy to judge
      const floor = Math.max(W.heightAt(r.x, r.z), 0), up = r.y - floor;
      if (this.shadowN < 40 && up < 150) setRY(SH, this.shadowN++, r.x, floor + (floor > 0 ? 0.7 : 0.15), r.z, r.yaw, v.size * 3.4 * (1 - Math.min(0.65, up / 170)));
      if (dt > 0 && r.state === "fly" && up < 4.6 && floor === 0) this.spray(r, dt, up);
    }
    for (const [id, v] of this.riders) if (v.seen !== this.frame) {     // this rider has left the sky
      this.scene.remove(v.g); if (v.crown) this.scene.remove(v.crown); v.sprite.material.dispose(); freeBody(v.g); this.riders.delete(id);
    }
    for (let n = 0, J = this.jobs; J.length && n < 2;) {               // warm sprite pictures: two new ones a frame at most
      const i = J.pop(), face = J.pop(), f = J.pop(); if (this.tex.has(texKey(f, face, true, i))) continue;
      this.r.initTexture(this.texture(f, face, true, i)); n++;
    }
    // wild monsters, plus any a test has put on stage
    if (W.monsters) for (const m of W.monsters) this.monster(m, dt);
    if (this.stage) for (const m of this.stage) this.monster(m, dt);
    for (const [id, v] of this.monsters) if (v.seen !== this.frame) { this.scene.remove(v.g); freeBody(v.g); this.monsters.delete(id); }
    this.shadows.count = this.shadowN; this.shadows.instanceMatrix.needsUpdate = true;

    // gold rings: they breathe, glow, and burst into sparks when someone flies through
    const RM = this.ringMesh.instanceMatrix.array, GM = this.ringGlow.instanceMatrix.array, SM = this.stormMesh.instanceMatrix.array; let plain = 0, stormN = 0, storm = null, prize = null;
    for (let i = 0; i < W.rings.length; i++) {
      const g = W.rings[i], on = g.back <= W.t; if (this.ringOn[i] && !on) this.burst(g); this.ringOn[i] = on;
      const s = on ? Math.min(1, (W.t - g.back) * 2.5 + 0.05) : 0, a = g.yaw + Math.sin(clock * 2 + i) * 0.15;
      if (!g.ev) { setRY(RM, plain, g.x, g.y, g.z, a, s * (1 + Math.sin(clock * 3 + i) * 0.04)); setRY(GM, plain++, g.x, g.y, g.z, a, s * (1.02 + Math.sin(clock * 4 + i * 1.7) * 0.12)); }
      else if (!on) continue;
      else if (g.ev === "prize") prize = g;
      else {
        storm = g; setRY(SM, stormN++, g.x, g.y, g.z, g.yaw + clock * 1.4, s * (1 + Math.sin(clock * 9 + i) * 0.07));
        if (dt > 0 && rnd() < dt * 9) {   // it crackles: short white sparks jump along the ring
          const t = rnd() * 6.283, c = Math.cos(t) * 5.2, ya = g.yaw + clock * 1.4, dx = rnd() - 0.5, dy = rnd() - 0.5, dz = rnd() - 0.5, dl = Math.hypot(dx, dy, dz) || 1;
          S.add(g.x + Math.cos(ya) * c, g.y + Math.sin(t) * 5.2, g.z - Math.sin(ya) * c, 0, 0, 0, 0.09 + rnd() * 0.08, 0.2, rnd() < 0.5 ? K.white : K.ice, 0, 0, 0, 1.4 + rnd() * 1.8, dx / dl, dy / dl, dz / dl);
        }
      }
    }
    this.ringMesh.count = this.ringGlow.count = plain; this.stormMesh.count = stormN;
    this.ringMesh.instanceMatrix.needsUpdate = true; this.ringGlow.instanceMatrix.needsUpdate = true; this.stormMesh.instanceMatrix.needsUpdate = true;
    this.stormShaft.visible = !!storm; this.gem.visible = this.beacon.visible = this.beaconWide.visible = !!prize;
    if (storm) {
      // the storm: a shaft of pale light over its island, and now and then a fork of lightning down to one of the rings
      const isl = W.islands[storm.isl] || storm, base = Math.max(W.heightAt(isl.x, isl.z), 0), top = (isl.h || storm.y) + 105;
      this.stormShaft.position.set(isl.x, base, isl.z); this.stormShaft.scale.set(1, top - base, 1); this.stormShaft.material.opacity = 0.13 + Math.sin(clock * 5) * 0.03;
      if (dt > 0 && (this.bolt -= dt) <= 0) {
        this.bolt = 0.35 + rnd() * 0.9; let x = isl.x + (rnd() - 0.5) * 22, y = top - 8, z = isl.z + (rnd() - 0.5) * 22;
        for (let k = 0; k < 6; k++) { const nx = storm.x + (x - storm.x) * (5 - k) / 6 + (rnd() - 0.5) * 7, ny = storm.y + (top - 8 - storm.y) * (5 - k) / 6, nz = storm.z + (z - storm.z) * (5 - k) / 6 + (rnd() - 0.5) * 7, d = Math.hypot(nx - x, ny - y, nz - z) || 1; S.add((x + nx) / 2, (y + ny) / 2, (z + nz) / 2, 0, 0, 0, 0.16, 0.34, k % 2 ? K.white : K.ice, 0, 0, 0, d, (nx - x) / d, (ny - y) / d, (nz - z) / d); x = nx; y = ny; z = nz; }
      }
    }
    if (prize) {
      const y = prize.y - 0.5 + Math.sin(clock * 2) * 0.6; this.gem.position.set(prize.x, y, prize.z); this.gem.rotation.y = clock * 1.2; this.gem.scale.setScalar(1.7 + Math.sin(clock * 4) * 0.1);
      this.beacon.position.set(prize.x, y, prize.z); this.beaconWide.position.set(prize.x, y - 3, prize.z); this.beacon.material.opacity = 0.7 + Math.sin(clock * 6) * 0.12;
      if (dt > 0 && rnd() < dt * 12) { const a = rnd() * 6.283; S.add(prize.x + Math.sin(a) * 4, y + rnd() * 3, prize.z + Math.cos(a) * 4, 0, 5 + rnd() * 5, 0, 0.8, 0.34, rnd() < 0.5 ? K.gold : K.blush); }
    }
    // thermals (left out of the title tour, where they would only be in the way)
    const air = !!me || !!cam; this.liftCol.visible = this.liftRings.visible = this.liftMotes.visible = air;
    if (air) {
      const LR = this.liftRings.instanceMatrix.array, LM = this.liftMotes.instanceMatrix.array;
      for (let i = 0; i < W.thermals.length; i++) {
        const th = W.thermals[i], base = this.bases[i], span = th.top - base - 4;
        for (let k = 0; k < 5; k++) { const u = (clock * 0.16 + k / 5) % 1; setRY(LR, i * 5 + k, th.x, base + 4 + u * span, th.z, 0, th.r * (0.7 + u * 0.4) * Math.min(1, (1 - u) * 6)); }
        for (let k = 0; k < 12; k++) { const u = (clock * 0.11 + k / 12 + i * 0.37) % 1, a = clock * 1.1 + k * 1.9 + i, rad = th.r * (0.35 + 0.5 * ((k * 7) % 5) / 5), s = Math.min(1, u * 8, (1 - u) * 5); setRY(LM, i * 12 + k, th.x + Math.sin(a) * rad, base + 3 + u * span, th.z + Math.cos(a) * rad, a, 0.55 * s, 1.5 * s, 0.55 * s); }
      }
      this.liftRings.instanceMatrix.needsUpdate = true; this.liftMotes.instanceMatrix.needsUpdate = true;
    }

    // bolts of fire and flying coins
    let live = 0;
    for (let i = 0; i < this.fx.length; i++) {
      const p = this.fx[i]; p.t += dt / p.dur; const u = Math.max(0, Math.min(1, p.t)), e = u * u * (3 - 2 * u), m = p.m;
      m.position.set(p.a.x + (p.b.x - p.a.x) * e, p.a.y + (p.b.y - p.a.y) * e + Math.sin(u * Math.PI) * p.arc, p.a.z + (p.b.z - p.a.z) * e); m.rotation.y += dt * 9; m.visible = p.t > 0;
      if (dt > 0 && p.t > 0) {
        if (p.bolt) for (let k = 0; k < 2; k++) S.add(m.position.x + (rnd() - 0.5), m.position.y + (rnd() - 0.5), m.position.z + (rnd() - 0.5), (rnd() - 0.5) * 4, 1 + rnd() * 3, (rnd() - 0.5) * 4, 0.22 + rnd() * 0.2, 0.9 + rnd() * 0.6, k ? m.material.color : K.fire);
        else if (rnd() < 0.25) S.add(m.position.x, m.position.y, m.position.z, 0, 0, 0, 0.35, 0.45, K.cream);
      }
      if (u < 1) { this.fx[live++] = p; continue; }
      this.scene.remove(m); (p.bolt ? this.bolts : this.coinPool).push(m);
      for (let k = 0, n = p.bolt ? 14 : 3; k < n; k++) S.add(m.position.x, m.position.y, m.position.z, (rnd() - 0.5) * 22, (rnd() - 0.2) * 18, (rnd() - 0.5) * 22, 0.3 + rnd() * 0.3, p.bolt ? 0.9 : 0.5, p.bolt && k % 3 ? m.material.color : p.bolt ? K.white : K.gold, 20, 0, 2);
    }
    this.fx.length = live;

    // camera: a fight, the launch move into the chase, the pull-back after landing, or the title tour
    const P = this._pos, L = this._look; let fov = 62, bank = 0, k = 1, cutTo = false;
    if (me && (me !== this.was || !this.first) && !this.noLaunch) this.launchT = 0;
    if (!me && this.was) { this.outT = 0; this.outFrom.copy(C.position); this.outAt.set(this.was.x, this.was.y, this.was.z); }
    this.was = me || null;
    this.fight = cam || null;
    if (cam) {
      // The fight camera circles the two dragons. If cloud, volcano smoke or a hill would come between, it moves in
      // closer or higher (and stays there while that spot is clear) instead of flying through it.
      this.launchT = LAUNCH; const sx = Math.sin(cam.yaw), sz = Math.cos(cam.yaw);
      let clear = false;
      for (let n = 0; n < ORBITS.length && !clear; n++) { const o = ORBITS[this.orbit]; clear = this.sees(cam.x + sx * o[0], cam.y + o[1], cam.z + sz * o[0], cam.x, cam.y + 2, cam.z); if (!clear) this.orbit = (this.orbit + 1) % ORBITS.length; }
      // no clear line from anywhere (the fight itself is beside a cloud): at least stand somewhere that is not inside one
      for (let n = 0; n < ORBITS.length && !clear; n++) { const o = ORBITS[this.orbit]; clear = !this.murky(cam.x + sx * o[0], cam.y + o[1], cam.z + sz * o[0]); if (!clear) this.orbit = (this.orbit + 1) % ORBITS.length; }
      const o = ORBITS[this.orbit]; P.set(cam.x + sx * o[0], cam.y + o[1], cam.z + sz * o[0]); L.set(cam.x, cam.y + 2, cam.z); k = this.first ? Math.min(1, dt * 2.5) : 1;
    }
    else if (me) {
      const a = me.yaw + this.camYaw, fast = Math.max(0, me.speed - 30), d = this.dist * (0.9 + (this.riders.get(me.id)?.size || 1) * 0.25) * (1 + Math.min(0.12, fast * 0.004));
      // The camera rides above and behind and looks over the dragon's back, so the dragon sits in the lower third of the
      // picture and whatever it is flying at (a ring, a rider, the treasure) shows above it instead of behind it.
      P.set(me.x - Math.sin(a) * d, me.y + d * (0.43 + this.camLift) - Math.sin(me.pitch) * 5, me.z - Math.cos(a) * d);
      L.set(me.x + Math.sin(me.yaw) * 12, me.y + 6.6 + Math.sin(me.pitch) * 6, me.z + Math.cos(me.yaw) * 12);
      fov = 62 + Math.min(24, fast * 0.62); bank = me.roll * 0.24;       // the view opens up with speed and leans a little into a turn
      if (this.launchT < LAUNCH) {
        // take-off: start in front of the dragon and a little below, looking back at it and the Roost's light, then sweep round behind
        this.launchT += dt * (Math.abs(this.camYaw) > 0.05 ? 5 : 1);   // a player who grabs the camera gets it at once
        const u = Math.min(1, this.launchT / LAUNCH), e = u * u * (3 - 2 * u), a2 = a + (1 - e) * 2.8, d2 = d * (0.78 + 0.22 * e);
        P.set(me.x - Math.sin(a2) * d2, me.y + (P.y - me.y) * e - d * 0.14 * (1 - e), me.z - Math.cos(a2) * d2);
        L.set(me.x + (L.x - me.x) * e, me.y + 1.5 + (L.y - me.y - 1.5) * e, me.z + (L.z - me.z) * e); bank *= e;
      } else k = this.first ? Math.min(1, dt * 7) : 1;
      // The luck wheel: a calm two-shot. The rider and the monster sit side by side across the top of the picture, seen
      // from far enough back that the middle of the screen, where the wheel is, stays clear. It eases in, and back out.
      const mate = me.state === "spin" ? this.partner(me) : null; this.duo = Math.max(0, Math.min(1, this.duo + dt * (mate ? 1.7 : -1.3)));
      if (mate) {
        const mx = (me.x + mate.x) / 2, my = (me.y + mate.y) / 2, mz = (me.z + mate.z) / 2, dx = mate.x - me.x, dz = mate.z - me.z, dl = Math.hypot(dx, dz) || 1;
        if (!this.duoSide) this.duoSide = (C.position.x - mx) * dz - (C.position.z - mz) * dx >= 0 ? 1 : -1;     // stay on the side the camera is already on
        const tall = Math.max(44, 40 / C.aspect), back = tall / 0.9326;
        this.duoP.set(mx + dz / dl * back * this.duoSide, my + 4, mz - dx / dl * back * this.duoSide); this.duoL.set(mx, my - tall * 0.38, mz);
      } else if (this.duo === 0) this.duoSide = 0;
      if (this.duo > 0) { const e = ease(this.duo); P.lerp(this.duoP, e); L.lerp(this.duoL, e); fov += (50 - fov) * e; bank *= 1 - e; }
      P.y = Math.max(P.y, Math.max(W.heightAt(P.x, P.z), 0) + 2);
    } else if (this.outT < PULL) {
      // landing: draw back and up from where the rider was
      this.outT += dt; const u = Math.min(1, this.outT / PULL), e = u * (2 - u), A = this.outFrom, T = this.outAt, dx = A.x - T.x, dz = A.z - T.z, dl = Math.hypot(dx, dz) || 1;
      P.set(A.x + dx / dl * 42 * e, A.y + 26 * e, A.z + dz / dl * 42 * e); L.copy(T);
      if (u >= 1) { this.tourT = 0; this.pass = null; }
    } else { fov = this.tour(dt, P, L); cutTo = true; }
    C.position.lerp(P, k); this.look.lerp(L, k); const snapped = !this.first; this.first = true;
    const f2 = cutTo ? fov : C.fov + (fov - C.fov) * Math.min(1, dt * 3); if (Math.abs(f2 - C.fov) > 0.01) { C.fov = f2; C.updateProjectionMatrix(); }
    this.bank += (bank - this.bank) * Math.min(1, dt * 4);
    const fx = this.look.x - C.position.x, fz = this.look.z - C.position.z, fl = Math.hypot(fx, fz) || 1, sb = Math.sin(this.bank);
    C.up.set(-fz / fl * sb, Math.cos(this.bank), fx / fl * sb); C.lookAt(this.look);

    if (me && !cam && me.state === "fly") this.flight(me, dt, snapped); else { this.trails[0].reset(); this.trails[1].reset(); }
    if (dt > 0) this.ambient(dt);
    S.update(dt); this.land.update(clock, C);
    this.r.render(this.scene, C);
  }

  // The title screen is a trailer of the game itself: a loop of short shots, each with one gentle move, cut together.
  // Writes where the camera stands and what it looks at, and returns the lens for the shot.
  tour(dt, P, L) {
    const W = this.world; this.tourT += dt;
    let c = this.cuts[this.cut]; if (this.tourT >= c.dur) { this.tourT = 0; this.cut = (this.cut + 1) % this.cuts.length; this.pass = null; c = this.cuts[this.cut]; }
    const u = this.tourT, s = c.isl; let fov = 60;
    if ((c.kind === "pass" || c.kind === "with") && this.dragonShot(c, dt, P, L)) fov = c.kind === "pass" ? 40 : 46;
    else if (c.kind === "sea") {
      // low over the water toward an island
      const a = c.a + u * 0.012, d = s.r + 150 - u * 12; P.set(s.x + Math.sin(a) * d, 4.5 + u * 0.5, s.z + Math.cos(a) * d); L.set(s.x, s === W.islands[0] ? W.roost.y + 24 : s.h * 0.7, s.z); fov = 52;
    } else if (c.kind === "hero") {
      // a long lens on one peak, drifting sideways, under the lowest clouds
      const a = c.a + u * 0.03; P.set(s.x + Math.sin(a) * c.d, Math.min(43, s.h * 0.5 + 10 + u * 1.2), s.z + Math.cos(a) * c.d); L.set(s.x, s.h * 0.72, s.z); fov = 40;
    } else if (c.kind === "rise") {
      // up the Roost's light, from the foot of the tower to just above its nest, well outside the light itself
      const e = u / c.dur, up = e * e * (3 - 2 * e), a = LIT + 1.2 + u * 0.07; P.set(Math.sin(a) * 62, W.roost.y + 5 + up * 58, Math.cos(a) * 62); L.set(0, W.roost.y + 20 + up * 32, 0); fov = 58;
    } else { const a = 2.2 + u * 0.05; P.set(Math.sin(a) * 270, 95, Math.cos(a) * 270); L.set(0, 34, 0); }   // the whole sea at once, between the two cloud layers
    P.y = Math.max(P.y, Math.max(W.heightAt(P.x, P.z), 0) + 3);
    // composition: the subject sits in the upper part of the picture and a little right of the middle, which leaves
    // room for a title at the bottom or down the left side
    const dx = L.x - P.x, dz = L.z - P.z, hl = Math.hypot(dx, dz) || 1, half = Math.hypot(dx, L.y - P.y, dz) * Math.tan(fov * Math.PI / 360), side = half * Math.min(1.6, this.cam.aspect) * 0.17;
    L.y -= half * 0.3; L.x += dz / hl * side; L.z -= dx / hl * side;
    return fov;
  }
  // Is there a hill, a cloud or volcano smoke at this point?
  murky(x, y, z) {
    if (y < Math.max(this.world.heightAt(x, z), 0) + 2.5 || this.land.inCloud(x, y, z)) return true;
    for (const e of this.smokes) if (y > e.y - 2 && y < e.y + 62 && Math.hypot(x - e.x - 7, z - e.z) < e.r + 15) return true;
    return false;
  }
  // Can a camera at (x, y, z) see the point (tx, ty, tz) with nothing murky in between? (The point itself is not tested.)
  sees(x, y, z, tx, ty, tz) { for (let k = 0; k < 5; k++) { const u = k / 5; if (this.murky(x + (tx - x) * u, y + (ty - y) * u, z + (tz - z) * u)) return false; } return true; }
  // Is this a fair place to stand a camera: not in a hill, not in a cloud, not in the Roost's light?
  standable(x, y, z) { return y > Math.max(this.world.heightAt(x, z), 0) + 2.5 && Math.hypot(x, z) > 38 && !this.land.inCloud(x, y, z); }
  // The two dragon shots of the tour. "pass": a rival flies past a camera that stands still and turns to follow; when the
  // dragon has gone by, the camera cuts to a new spot ahead of it. "with": the camera flies alongside one rival.
  // Either way a dragon is large in the picture for the whole cut. Returns false when there is nobody to film.
  dragonShot(c, dt, P, L) {
    const W = this.world; let q = this.pass;
    if (q && (!W.riders.includes(q.r) || !this.riders.has(q.r.id))) q = this.pass = null;
    if (c.kind === "pass") {
      if (q) { q.t += dt; const far = Math.hypot(q.x - q.r.x, q.y - q.r.y, q.z - q.r.z); if (q.t > 1 && far > 58 && far > q.far) q = null; else q.far = far; }   // gone by, or turned away: cut
      if (!q) {
        const n = W.riders.length, first = this.pass ? W.riders.indexOf(this.pass.r) : c.n * 4 + 1;
        find: for (let k = 0; k < n; k++) {
          const r = W.riders[(first + k) % n]; if (r.state !== "fly" || !this.riders.has(r.id)) continue;
          const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw), sp = r.speed || 30;
          for (const lead of [1.5, 1.1, 2]) for (const side of [16, -16, 23]) for (const drop of [3.5, -2]) {
            const x = r.x + fx * sp * lead + fz * side, z = r.z + fz * sp * lead - fx * side, y = Math.max(r.y - drop, Math.max(W.heightAt(x, z), 0) + 3);
            if (y < r.y + 8 && this.standable(x, y, z)) { q = { r, x, y, z, t: 0, far: 1e9 }; break find; }
          }
        }
        this.pass = q;
      }
      if (!q) return false;
      P.set(q.x, q.y, q.z); L.set(q.r.x, q.r.y + 1, q.r.z); return true;
    }
    if (q && (q.t += dt) > 0.6 && !this.standable(this._pos.x, this._pos.y, this._pos.z)) { if (q.flip) q = null; else { q.side = -q.side; q.flip = true; q.t = 0; } }   // about to fly into something: change sides once, then change dragon
    if (!q) {
      const n = W.riders.length, first = this.pass ? W.riders.indexOf(this.pass.r) + 1 : c.n * 4 + 1;
      for (let k = 0; k < n && !q; k++) { const r = W.riders[(first + k) % n]; if (r.state === "fly" && this.riders.has(r.id) && Math.hypot(r.x, r.z) > 70 && r.y > Math.max(W.heightAt(r.x, r.z), 0) + 14 && !this.land.inCloud(r.x, r.y, r.z)) q = { r, yaw: r.yaw, side: 1, t: 0, flip: false }; }
      this.pass = q;
    }
    if (!q) return false;
    const r = q.r; q.yaw += Math.atan2(Math.sin(r.yaw - q.yaw), Math.cos(r.yaw - q.yaw)) * Math.min(1, dt * 1.5);      // follow its heading a little late, so turns are soft
    const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), ahead = 18 - this.tourT * 1.3;
    P.set(r.x + fx * ahead + fz * 15 * q.side, r.y - 1.5, r.z + fz * ahead - fx * 15 * q.side); L.set(r.x, r.y + 1, r.z); return true;
  }

  // One wild monster: build it the first time it is seen, then move it, animate it and let it shed sparks.
  monster(m, dt) {
    const S = this.sparks, W = this.world, C = this.cam.position; let v = this.monsters.get(m.id);
    if (v && v.kind !== m.kind) { this.scene.remove(v.g); freeBody(v.g); v = null; }
    if (!v) { v = buildMonster(MONSTER_KINDS.includes(m.kind) ? m.kind : "imp"); v.kind = m.kind; v.g.scale.setScalar(v.scale); this.scene.add(v.g); this.monsters.set(m.id, v); }
    const held = m.state === "spin" && m.target; v.turn = Math.max(0, Math.min(1, (v.turn || 0) + dt * (held ? 2.5 : -2.5))); if (held) v.toward = Math.atan2(m.target.x - m.x, m.target.z - m.z);
    v.seen = this.frame; v.g.position.set(m.x, m.y, m.z); v.g.rotation.y = (m.yaw || 0) + (v.turn > 0 ? wrap(v.toward - (m.yaw || 0)) * ease(v.turn) : 0);
    animateMonster(v, m, this.clock);
    const floor = Math.max(W.heightAt(m.x, m.z), 0), up = m.y - floor;
    if (this.shadowN < 40 && up < 150) setRY(this.shadows.instanceMatrix.array, this.shadowN++, m.x, floor + (floor > 0 ? 0.7 : 0.15), m.z, 0, v.scale * 2.4 * (1 - Math.min(0.65, up / 170)));
    if (dt <= 0 || Math.hypot(m.x - C.x, m.z - C.z) > 320) return;
    const e = v.sack.matrixWorld.elements;                          // where the hoard was a frame ago: close enough for sparks
    if (m.state === "spin") { if (rnd() < dt * 34) S.add(e[12], e[13], e[14], (rnd() - 0.5) * 9, 5 + rnd() * 7, (rnd() - 0.5) * 9, 0.6 + rnd() * 0.3, 0.42, rnd() < 0.75 ? K.gold : K.cream, 22); }
    else if (m.state === "dare") { if (rnd() < dt * 9) { const a = rnd() * 6.283, y = m.y + v.tall * v.scale; S.add(m.x + Math.sin(a) * 3, y + (rnd() - 0.5) * 3, m.z + Math.cos(a) * 3, 0, 2.5, 0, 0.6, 0.34, K.gold); } }
    else if (m.state === "flee") { if (rnd() < dt * 26) S.add(m.x + (rnd() - 0.5) * 1.5, m.y + (rnd() - 0.5) * 1.5, m.z + (rnd() - 0.5) * 1.5, 0, 0.5, 0, 0.5 + rnd() * 0.3, 0.6 + rnd() * 0.5, K.steam, 0, 0.8); }
    else if (m.state === "taunt" && rnd() < dt * 3) S.add(e[12], e[13], e[14], (rnd() - 0.5) * 3, 3, (rnd() - 0.5) * 3, 0.5, 0.36, K.gold, 14);
  }

  // What speed looks like around the player: streaks of wind, trails from the wing tips, rising air in a thermal.
  flight(me, dt, snapped) {
    const S = this.sparks, v = this.riders.get(me.id), V = this._v; if (!v) return;
    const cp = Math.cos(me.pitch), fx = Math.sin(me.yaw) * cp, fy = Math.sin(me.pitch), fz = Math.cos(me.yaw) * cp, rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;         // "up" across the line of flight
    this.acc.lines += dt * 80 * Math.max(0, Math.min(1, (me.speed - 35) / 26));
    while (this.acc.lines >= 1) {
      this.acc.lines--; const a = rnd() * 6.283, rad = 9 + rnd() * 20, ahead = 30 + rnd() * 40, c = Math.cos(a) * rad, s = Math.sin(a) * rad;
      S.add(me.x + fx * ahead + rx * c + ux * s, me.y + fy * ahead + uy * s, me.z + fz * ahead + rz * c + uz * s, 0, 0, 0, (ahead + 12) / me.speed, 0.13, K.white, 0, 0, 0, 2.5 + me.speed * 0.07, fx, fy, fz);
    }
    if (me.lift) {
      this.acc.lift += dt * 46;
      while (this.acc.lift >= 1) { this.acc.lift--; const a = rnd() * 6.283, rad = 3 + rnd() * 6; S.add(me.x + Math.sin(a) * rad, me.y - 5 + rnd() * 5, me.z + Math.cos(a) * rad, 0, 24, 0, 0.45, 0.13, K.pale, 0, 0, 0, 2.8, 0, 1, 0); }
    }
    // wing tips leave a trail in a dive, at full speed and in a hard turn
    const amt = Math.max(0, Math.min(1, Math.max((me.speed - 34) / 12, Math.abs(me.roll) * 2.4 - 0.4)));
    if (snapped) { this.trails[0].reset(); this.trails[1].reset(); }
    v.g.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const t = v.tips[i], T = this.trails[i]; if (!t) { T.reset(); continue; }
      const e = t.o.matrixWorld.elements; V.set(t.x, 0, 0).applyMatrix4(t.o.matrixWorld);
      let wx = V.x - e[12], wy = V.y - e[13], wz = V.z - e[14], wl = Math.hypot(wx, wy, wz);
      if (wl < 0.01) { wx = rx; wy = 0; wz = rz; wl = 1; }
      T.set(V.x, V.y, V.z, wx / wl, wy / wl, wz / wl, amt, dt);
    }
  }
  // A dragon skimming the sea throws spray to both sides and leaves a line of foam.
  spray(r, dt, up) {
    const S = this.sparks, C = this.cam.position; if (Math.hypot(r.x - C.x, r.z - C.z) > 260) return;
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw), low = 1 - Math.max(0, up - 2.4) / 2.2;
    let n = r.speed * 2.6 * dt * low; n = Math.floor(n) + (rnd() < n % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const side = rnd() < 0.5 ? -1 : 1, out = 4 + rnd() * 8;
      S.add(r.x - fx * 2 + fz * side * (0.4 + rnd() * 1.4), 0.3, r.z - fz * 2 - fx * side * (0.4 + rnd() * 1.4), fz * side * out + fx * r.speed * 0.3, 5 + rnd() * 8 * low, -fx * side * out + fz * r.speed * 0.3, 0.5 + rnd() * 0.35, 0.24 + rnd() * 0.3, rnd() < 0.6 ? K.white : K.ice, 26);
    }
    if (rnd() < dt * 22) S.add(r.x - fx * 3 + (rnd() - 0.5) * 1.6, 0.12, r.z - fz * 3 + (rnd() - 0.5) * 1.6, 0, 0, 0, 1.5, 0.7 + rnd() * 0.6, K.foam);
  }
  // A ring has gone. If a rider is there it was taken: sparks fly outward in the ring's own plane (blue for a storm
  // ring, a great burst for the prize), and a ring pulled in by a magnet streams across to its rider.
  // If nobody is near, the ring only ran out, and it goes quietly.
  burst(g) {
    const S = this.sparks, ax = Math.cos(g.yaw), az = -Math.sin(g.yaw); let who = null, near = 32;
    for (const r of this.world.riders) { const d = Math.hypot(r.x - g.x, r.y - g.y, r.z - g.z); if (d < near) { near = d; who = r; } }
    if (!who) return;
    const a1 = g.ev === "storm" ? K.ice : g.ev === "prize" ? K.blush : K.gold, a2 = g.ev === "prize" ? K.gold : K.white, n = g.ev === "prize" ? 40 : 26;
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283, c = Math.cos(a), s = Math.sin(a), sp = 14 + rnd() * 12;
      S.add(g.x + ax * c * 5.2, g.y + s * 5.2, g.z + az * c * 5.2, ax * c * sp, s * sp, az * c * sp, 0.45 + rnd() * 0.25, 0.6, k % 3 ? a1 : a2, 0, 0, 3);
    }
    if (g.ev === "prize") for (let k = 0; k < 70; k++) {   // the gem breaks into a fountain
      const a = rnd() * 6.283, up = 10 + rnd() * 26, out = 4 + rnd() * 16;
      S.add(g.x, g.y, g.z, Math.sin(a) * out, up, Math.cos(a) * out, 0.9 + rnd() * 0.7, 0.5 + rnd() * 0.5, k % 3 === 0 ? K.white : k % 3 === 1 ? K.gold : K.pink, 24, 0, 0.6);
    }
    if (who.magnet && near > 8) for (let k = 0; k < 12; k++) {   // pulled in from a distance: the coin flies across
      const t = 0.22 + k * 0.02; S.add(g.x, g.y, g.z, (who.x - g.x) / t + Math.sin(who.yaw) * (who.speed || 30), (who.y - g.y) / t, (who.z - g.z) / t + Math.cos(who.yaw) * (who.speed || 30), t, 0.5, k % 2 ? K.gold : K.cream);
    }
  }
  // the monster whose wheel this rider is held at, if any
  partner(r) {
    const W = this.world; if (W.monsters) for (const m of W.monsters) if (m.target === r && m.state === "spin") return m;
    if (this.stage) for (const m of this.stage) if (m.target === r && m.state === "spin") return m;
    return null;
  }
  // Each place breathes a little: smoke over the volcano, petals, snow, leaves, fireflies, gold dust in the Roost's light.
  ambient(dt) {
    const S = this.sparks, W = this.world, C = this.cam.position;
    for (const e of this.land.emit) {
      if (Math.hypot(e.x - C.x, e.z - C.z) > 460) continue;
      const kind = e.kind; e.acc += dt * (kind === "smoke" ? 12 : kind === "snow" ? 16 : kind === "petal" ? 12 : kind === "leaf" ? 8 : kind === "gold" ? 9 : kind === "foam" ? 12 : kind === "firefly" ? 5 : 2);
      while (e.acc >= 1) {
        e.acc--; const a = rnd() * 6.283, d = Math.sqrt(rnd()) * e.r, x = e.x + Math.sin(a) * d, z = e.z + Math.cos(a) * d;
        if (kind === "smoke" && this.fight && Math.hypot(e.x - this.fight.x, e.z - this.fight.z) < 80) continue;   // a fight over the crater: the volcano holds its breath
        if (kind === "smoke") {
          if (rnd() < 0.45) S.add(x, e.y + 1, z, (rnd() - 0.5) * 3, 12 + rnd() * 8, (rnd() - 0.5) * 3, 1.4 + rnd(), 0.55, rnd() < 0.5 ? K.ember : K.fire, 4);
          else S.add(x, e.y + 2, z, 1.5 + rnd() * 1.5, 8 + rnd() * 4, (rnd() - 0.5) * 2, 5 + rnd() * 1.5, 2.6 + rnd() * 2.4, rnd() < 0.4 ? K.smoke1 : rnd() < 0.6 ? K.smoke2 : K.smoke3, 0, 1.5, 0.12);
        }
        else if (kind === "snow") S.add(x, e.y + 8 + rnd() * 40, z, 1.5, -5 - rnd() * 3, 0.8, 4.5, 0.36, K.white);
        else if (kind === "petal") S.add(x, Math.max(W.heightAt(x, z), 0) + 5 + rnd() * 22, z, 2.5 + rnd() * 2, -2.2 - rnd(), 1 + rnd() * 2, 4.2, 0.42, rnd() < 0.6 ? K.pink : K.blush);
        else if (kind === "leaf") S.add(x, Math.max(W.heightAt(x, z), 0) + 5 + rnd() * 16, z, 2 + rnd() * 2, -2.6 - rnd(), 1 + rnd() * 2, 3.6, 0.42, rnd() < 0.5 ? K.leaf1 : K.leaf2);
        else if (kind === "gold") S.add(x, e.y + rnd() * 70, z, 0, 5 + rnd() * 5, 0, 3.5, 0.42, rnd() < 0.7 ? K.gold : K.cream);
        else if (kind === "foam") S.add(x, e.y, z, (rnd() - 0.5) * 5, 3 + rnd() * 4, (rnd() - 0.5) * 5, 0.7, 0.6, K.white, 14);
        else if (kind === "firefly") S.add(x, e.y + rnd() * 12, z, (rnd() - 0.5) * 2, (rnd() - 0.5) * 1.5, (rnd() - 0.5) * 2, 3, 0.34, K.fly);
        else S.add(e.x, e.y, e.z, 0.8, 2.6, 0.3, 3.2, 0.9, K.steam, 0, 1.4);
      }
    }
  }

  // where something at (x, y, z) lands on screen, or null when it is behind the camera or too far
  pin(x, y, z) {
    const v = this._v.set(x, y, z), d = v.distanceTo(this.cam.position);
    v.project(this.cam); if (v.z > 1 || d > 420) return null;
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, d };
  }
  // where a rider's name tag goes on screen
  tag(r) { return this.pin(r.x, r.y + 6.2 * (this.riders.get(r.id)?.size || 1), r.z); }
  // where a monster's speech bubble goes on screen
  monsterTag(m) { const v = this.monsters.get(m.id); return this.pin(m.x, m.y + (v ? v.tall * v.scale : 7) + 1.2, m.z); }
  // a bolt of fire from one dragon to the other, one per call tap. It drags sparks behind it and bursts where it lands.
  shot(from, to, color = "#ff8a3d") {
    const m = this.bolts.pop() || new THREE.Mesh(BOX, new THREE.MeshBasicMaterial()); m.material.color.set(color); m.scale.setScalar(1.7); m.visible = false; this.scene.add(m);
    this.fx.push({ m, a: from, b: to, t: 0, dur: 0.32, arc: 1.5, bolt: true });
  }
  coins(from, to, n) {
    for (let i = 0; i < Math.min(14, Math.max(3, n)); i++) {
      const c = this.coinPool.pop() || new THREE.Mesh(COIN, COIN_MAT); c.rotation.z = Math.PI / 2; c.visible = false; this.scene.add(c);
      this.fx.push({ m: c, a: from, b: to, t: -i * 0.06, dur: 0.9, arc: 5 + Math.random() * 6, bolt: false });
    }
  }
}

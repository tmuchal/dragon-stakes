// Dragon Stakes scenery: everything in the world that is not a rider. Ten islands that are ten different places,
// a sea with shallows and foam, a sky dome with a low sun, three layers of cloud, far mountains, birds and boats.
// All of it is flat colour and merged into a handful of meshes, so the whole world costs about twenty draw calls.
// Nothing here changes the rules: the shape of the land is still world.heightAt, and tall things stand off to the
// side of where riders climb in a thermal.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { R, ROOST_R } from "./world.js";
import { setRY } from "./view-fx.js";
import { themesFor, sites, shoreOf, aside } from "./scenery-sites.js";
export { islandColors, islandThemes, landmarkColliders } from "./scenery-sites.js";

export const HAZE = "#f6dfbc";                                        // the colour of far away: fog and the horizon
export const SUN = new THREE.Vector3(-0.62, 0.36, 0.68).normalize();  // where the sun hangs in the sky
const lcg = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// ---------- a bag of coloured triangles: many small shapes become one mesh ----------
const prim = g => g.index ? g.toNonIndexed() : g;
export const G = {
  box: prim(new THREE.BoxGeometry(1, 1, 1)), cone: prim(new THREE.ConeGeometry(1, 1, 5)), pyr: prim(new THREE.ConeGeometry(1, 1, 4)),
  cyl: prim(new THREE.CylinderGeometry(1, 1, 1, 6)), oct: prim(new THREE.CylinderGeometry(1, 1, 1, 8)), taper: prim(new THREE.CylinderGeometry(0.72, 1, 1, 8)),
  blob: prim(new THREE.IcosahedronGeometry(1, 0)), puff: prim(new THREE.IcosahedronGeometry(1, 1)),
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
export class Bag {
  constructor() { this.pos = []; this.col = []; }
  add(geo, color, sx, sy, sz, x, y, z, ry = 0, rx = 0, rz = 0) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, "YXZ")), _s.set(sx, sy, sz)); _c.set(color);
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) { _v.fromBufferAttribute(P, i).applyMatrix4(_m); this.pos.push(_v.x, _v.y, _v.z); this.col.push(_c.r, _c.g, _c.b); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos), 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.computeVertexNormals(); return g;
  }
  mesh(material) { return new THREE.Mesh(this.geometry(), material); }
}
const litMat = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// The colour of one triangle of ground. y is its height, d its distance from the island's middle.
function ground(theme, s, x, y, z, steep, par) {
  const yf = y / s.h, rnd = hash(Math.round(x), Math.round(z)), d = Math.hypot(x - s.x, z - s.z), two = (a, b) => par ? a : b, beach = y < 1.3;
  switch (theme) {
    case "roost":
      if (d < 18) return two("#ddd4c0", "#cfc5ae");
      if (beach) return "#f1dfae"; if (steep) return "#a39a8c";
      if (yf > 0.9) return rnd < 0.1 ? "#ffd95e" : two("#a5d873", "#98cf6a");
      return yf < 0.3 ? two("#72b65e", "#6bad58") : two("#86c96a", "#7bbf62");
    case "snow":
      if (beach) return "#e3ebf0";
      if (yf > 0.46 + (rnd - 0.5) * 0.16) return steep ? "#c3d0de" : two("#ffffff", "#ecf3fb");
      if (steep) return "#7f8a9a";
      if (yf > 0.26) return rnd < 0.3 ? "#f1f6fb" : two("#8c9aa6", "#97a5b0");
      return two("#5f9a6e", "#57906a");
    case "volcano": {
      const river = Math.sin(Math.atan2(x - s.x, z - s.z) * 4 + Math.sin(d * 0.08) * 1.5);
      if (yf > 0.9) return rnd < 0.15 ? "#fff0a0" : two("#ffb52e", "#ff7a1a");
      if (river > 0.9 && yf > 0.22) return two("#ff5a1f", "#ff8a2a");
      if (beach) return "#4b434b"; if (steep) return "#2e282c";
      if (yf > 0.55) return two("#3d3336", "#463a3b");
      if (yf > 0.2) return two("#574845", "#4f423f");
      return rnd < 0.35 ? "#6a7a4c" : "#5e4f48";
    }
    case "sakura":
      if (beach) return "#f8e6cf"; if (steep) return "#b7a9a6"; if (rnd < 0.16) return "#f6c3d6";
      return yf > 0.6 ? two("#b9e09a", "#aed892") : two("#9fd685", "#94cd7c");
    case "desert":
      if (beach) return "#f2dcaa";
      if (yf > 0.55 || steep) return Math.floor(y / 2.5) % 2 ? (steep ? "#b5653a" : "#d48a52") : "#c4733f";
      return rnd < 0.07 ? "#c9b37a" : two("#ecd29a", "#e5c88b");
    case "autumn":
      if (beach) return "#f0dfae"; if (steep) return "#8f8377"; if (rnd < 0.14) return "#d98a3a"; if (rnd > 0.9) return "#b5523a";
      return yf > 0.6 ? two("#c4b055", "#b8a44d") : two("#a9b85a", "#9eae54");
    case "ruins":
      if (beach) return "#eee0b8"; if (steep) return "#918b80";
      if (d < 24) return rnd < 0.25 ? "#a9c48f" : two("#c9c3b2", "#bdb6a4");
      return rnd < 0.08 ? "#c9c3b2" : two("#a9c48f", "#9fbb86");
    case "jungle":
      if (beach) return "#fff1c9"; if (steep) return "#5f6f58"; if (rnd < 0.12) return "#2a7a44";
      return yf > 0.6 ? two("#3a9452", "#338a4c") : two("#47a65c", "#3f9c55");
    case "harbor":
      if (beach) return "#f3e2b3"; if (steep) return "#f2eee2";
      return rnd < 0.08 ? "#f5f0a0" : two("#8fd06f", "#83c665");
    default: {                                                        // lavender: rows of purple between rows of grass
      if (beach) return "#f1dfae"; if (steep) return "#9a8f86";
      const row = ((Math.floor((x * 0.7 + z * 0.7) / 6) % 2) + 2) % 2;
      return yf > 0.12 && yf < 0.85 && row ? two("#a98bdc", "#b597e6") : two("#8fcb72", "#86c26a");
    }
  }
}

// The land, cut into flat triangles. Returns the mesh and hAt, the height of the drawn surface (so things sit on what you see).
function terrain(W, themes) {
  const size = R * 2.5, n = 200, st = size / n, half = size / 2, row = n + 1, H = new Float32Array(row * row);
  for (let iz = 0; iz <= n; iz++) for (let ix = 0; ix <= n; ix++) H[iz * row + ix] = W.heightAt(ix * st - half, iz * st - half);
  const owner = (x, z) => { let best = -1, top = -9; W.islands.forEach((s, i) => { const d = Math.hypot(x - s.x, z - s.z) / s.r; if (d >= 1.03) return; const b = Math.max(0, 1 - d * d) ** 2, v = s.h * Math.min(1, b / (1 - s.flat)); if (v > top) { top = v; best = i; } }); return best; };
  const pos = [], col = [], c = new THREE.Color();
  const tri = (x0, y0, z0, x1, y1, z1, x2, y2, z2, par) => {
    const hi = Math.max(y0, y1, y2); if (hi < -1.2) return;                       // open sea floor is never seen
    const x = (x0 + x1 + x2) / 3, y = (y0 + y1 + y2) / 3, z = (z0 + z1 + z2) / 3, i = owner(x, z);
    c.set(i < 0 ? "#e9d8a6" : ground(themes[i], W.islands[i], x, y, z, (hi - Math.min(y0, y1, y2)) / st > 1.12, par));
    pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  };
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x0 = ix * st - half, z0 = iz * st - half, x1 = x0 + st, z1 = z0 + st, a = H[iz * row + ix], b = H[iz * row + ix + 1], d = H[(iz + 1) * row + ix], e = H[(iz + 1) * row + ix + 1];
    tri(x0, a, z0, x0, d, z1, x1, b, z0, 0); tri(x1, b, z0, x0, d, z1, x1, e, z1, 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3)); g.computeVertexNormals();
  const hAt = (x, z) => {
    const fx = (x + half) / st, fz = (z + half) / st, ix = Math.floor(fx), iz = Math.floor(fz); if (ix < 0 || iz < 0 || ix >= n || iz >= n) return -4;
    const u = fx - ix, v = fz - iz, a = H[iz * row + ix], b = H[iz * row + ix + 1], d = H[(iz + 1) * row + ix], e = H[(iz + 1) * row + ix + 1];
    return u + v <= 1 ? a + u * (b - a) + v * (d - a) : e + (1 - u) * (d - e) + (1 - v) * (b - e);
  };
  return { mesh: new THREE.Mesh(g, litMat()), hAt };
}

// ---------- the sea: depth by distance to land, foam that walks up the beach, sparkle toward the sun ----------
function sea(W) {
  const col = c => ({ value: new THREE.Color(c) });
  const m = new THREE.ShaderMaterial({
    defines: { N: W.islands.length },
    uniforms: {
      isl: { value: W.islands.map(s => new THREE.Vector4(s.x, s.z, s.r, s.h)) }, flt: { value: W.islands.map(s => s.flat) }, na: { value: W.na }, nb: { value: W.nb }, t: { value: 0 },
      fogC: col(HAZE), fogN: { value: 1 }, fogF: { value: 2 }, sun: { value: new THREE.Vector2(SUN.x, SUN.z).normalize() },
      deep: col("#2873c0"), mid: col("#3a8fd2"), shal: col("#4dbbd8"), pale: col("#93e4de"), foam: col("#ffffff"), glint: col("#fff3cf"),
    },
    vertexShader: "varying vec3 wp; void main() { vec4 w = modelMatrix * vec4(position, 1.); wp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform vec4 isl[N]; uniform float flt[N]; uniform float na, nb, t, fogN, fogF; uniform vec2 sun; uniform vec3 fogC, deep, mid, shal, pale, foam, glint; varying vec3 wp;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = wp.xz; float h = -4., nd = 9.;
        for (int i = 0; i < N; i++) {                                 // the same height rule as the world, so the shore line is exact
          float d = length(p - isl[i].xy) / isl[i].z; nd = min(nd, d);
          if (d < 1.) { float b = 1. - d * d; b *= b; h = max(h, isl[i].w * min(1., b / (1. - flt[i])) + sin(p.x * .11 + na) * cos(p.y * .13 + nb) * 2.2 * b - 1.); }
        }
        float dist = length(wp - cameraPosition), near = 1. - smoothstep(200., 560., dist);
        float swell = sin(p.x * .045 + sin(p.y * .03 + t * .2) * 2.2 + t * .5) * sin(p.y * .06 - t * .35);
        vec3 c = mix(deep, mid, step(.5, swell) * .5 * near);
        nd += sin(p.x * .09 + t * .4) * sin(p.y * .08 - t * .3) * .03;
        if (nd < 1.34) c = mid; if (nd < 1.16) c = shal; if (nd < 1.) c = h > -.6 ? pale : shal;
        float chop = hash(floor(p / 2.2));
        if (h > -.2 || (h > -1. && fract(h * 2.6 - t * .35) < .17 && chop > .3)) c = foam;
        float cell = dist < 110. ? 1.3 : dist < 300. ? 3.2 : 8.; vec2 g = floor(p / vec2(cell * 2.6, cell));   // short dashes of light
        float tw = hash(g + floor(t * 3. + hash(g) * 7.)), toSun = max(0., dot(normalize(p - cameraPosition.xz), sun));
        if (nd > 1.02 && tw > mix(.994, .8, pow(toSun, 22.) * smoothstep(50., 260., dist))) c = glint;
        c = mix(c, fogC, smoothstep(fogN, fogF, dist));
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4400, 4400).rotateX(-Math.PI / 2), m); mesh.frustumCulled = false;
  return mesh;
}

// ---------- the sky: a dome that travels with the camera, painted in bands from warm haze up to blue, with the sun ----------
function dome() {
  const col = c => ({ value: new THREE.Color(c) });
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: col("#2f6fd8"), mid: col("#86c8f3"), low: col(HAZE), core: col("#fffdf0"), halo: col("#ffe9b0"), sun: { value: SUN } },
    vertexShader: "varying vec3 dir; void main() { dir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
    fragmentShader: `
      uniform vec3 top, mid, low, core, halo, sun; varying vec3 dir;
      void main() {
        vec3 d = normalize(dir); float dth = (mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.) - .5) / 22.;
        float k = floor((clamp(d.y, 0., 1.) + dth) * 22. + .5) / 22.;  // cut into bands, with a one-pixel checker on each edge
        vec3 c = mix(low, mid, smoothstep(.0, .26, k)); c = mix(c, top, smoothstep(.26, .9, k));
        float s = dot(d, sun), ring = floor(smoothstep(.9, .998, s) * 4. + dth * 8.) / 4.;
        c = mix(c, halo, ring * .6);
        if (s > .9972) c = core;
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2000, 20, 12), m); mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}

// Far mountains and a bank of cloud on the horizon. They keep their distance from the camera, so the world feels wide.
function backdrop() {
  const bag = new Bag(), rng = lcg(4242);
  for (let k = 0; k < 34; k++) {
    const a = k / 34 * 6.283 + rng() * 0.12, far = rng() < 0.5, d = far ? 1850 : 1700, w = 130 + rng() * 190, h = (far ? 150 : 90) + rng() * 170;
    bag.add(G.pyr, far ? "#e6d3c0" : "#cfc1bf", w, h, w, Math.sin(a) * d, h / 2 - 4, Math.cos(a) * d, rng() * 3);
    if (h > 200) bag.add(G.pyr, "#fff7ea", w * 0.3, h * 0.3, w * 0.3, Math.sin(a) * (d - 6), h * 0.85 - 4 + 0.5, Math.cos(a) * (d - 6), 0);
  }
  for (let k = 0; k < 26; k++) {
    const a = rng() * 6.283, d = 1600, y = 60 + rng() * 260, w = 240 + rng() * 300;
    bag.add(G.box, "#fff4e2", w, 16 + rng() * 22, 40, Math.sin(a) * d, y, Math.cos(a) * d, a);
    bag.add(G.box, "#fffaf0", w * 0.5, 24 + rng() * 20, 40, Math.sin(a + 0.02) * d, y + 18, Math.cos(a + 0.02) * d, a);
  }
  const mesh = bag.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); mesh.frustumCulled = false; mesh.renderOrder = -9;
  return mesh;
}

// Clouds are stacks of boxes with a flat base. Three layers turn slowly at different speeds; you can fly through all of them.
function clouds(W) {
  const rng = lcg(777), layers = [], balls = [];
  // would a cloud here hide a gold ring, fill a thermal, or sit on a hill?
  const bad = (x, y, z, half, s) => W.rings.some(g => Math.hypot(g.x - x, g.z - z) < half + 9 && Math.abs(g.y - y - 4 * s) < 12 * s + 8)
    || W.thermals.some(t => y - 3 * s < t.top && Math.hypot(t.x - x, t.z - z) < half + t.r + 4)
    || [[0, 0], [half, 0], [-half, 0], [0, half], [0, -half]].some(([a, b]) => W.heightAt(x + a, z + b) > y - 3 * s - 28);
  const layer = (count, y0, y1, s0, s1, near, spread, flat, still) => {
    const bag = new Bag();
    for (let k = 0; k < count; k++) {
      let x, y, z, s, w, dp, tries = 0;
      do { const a = rng() * 6.283, d = near + Math.sqrt(rng()) * spread; x = Math.sin(a) * d; z = Math.cos(a) * d; y = y0 + rng() * (y1 - y0); s = s0 + rng() * (s1 - s0); w = (36 + rng() * 30) * s; dp = (20 + rng() * 14) * s; }
      while (still && ++tries < 40 && bad(x, y, z, Math.hypot(w, dp) / 2, s));
      if (tries >= 40) continue;
      const turn = rng() * 3;
      bag.add(G.box, "#ffffff", w, 5 * s, dp, x, y, z, turn);
      for (let j = 0, n = flat ? 1 : 3 + Math.floor(rng() * 3); j < n; j++) {
        const w2 = w * (0.3 + rng() * 0.3), h2 = (flat ? 3 : 6 + rng() * 9) * s, off = (rng() - 0.5) * w * 0.55;
        bag.add(G.box, "#ffffff", w2, h2, dp * (0.5 + rng() * 0.35), x + Math.cos(turn) * off, y + 2 * s + h2 / 2, z - Math.sin(turn) * off, turn);
      }
      if (still) balls.push(x, y + 4 * s, z, Math.hypot(w, dp) / 2, 10 * s);   // middle, reach across, reach up and down
    }
    const m = bag.mesh(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: "#93a6d6", emissiveIntensity: 0.42 })); m.frustumCulled = false; layers.push(m);
  };
  layer(18, 48, 76, 0.4, 0.7, 95, R * 0.95, false, true);         // low wisps between the islands
  layer(60, 104, 162, 0.9, 1.5, 140, R * 0.95, false, true);      // the big ones you climb into
  layer(18, 235, 300, 2.0, 3.2, 90, R * 2.2, true, false);       // a high thin sheet above the ceiling, the only one that drifts
  // is this point inside (or right beside) one of the clouds that stand still?
  const inCloud = (x, y, z) => { for (let i = 0; i < balls.length; i += 5) if (Math.abs(y - balls[i + 1]) < balls[i + 4] + 4 && Math.hypot(x - balls[i], z - balls[i + 2]) < balls[i + 3] + 5) return true; return false; };
  return { layers, inCloud };
}

export function buildScenery(scene, W) {
  const themes = themesFor(W), tall = sites(W, themes), { mesh: land, hAt } = terrain(W, themes); scene.add(land);
  const lit = new Bag(), glow = new Bag(), emit = [], keep = [], rng = lcg(12345), pick = a => a[Math.floor(rng() * a.length)];
  const L = (g, c, sx, sy, sz, x, y, z, ry, rx, rz) => lit.add(G[g], c, sx, sy, sz, x, y, z, ry, rx, rz);
  const U = (g, c, sx, sy, sz, x, y, z, ry, rx, rz) => glow.add(G[g], c, sx, sy, sz, x, y, z, ry, rx, rz);
  const at = (s, ang, dist) => { const x = s.x + Math.sin(ang) * dist, z = s.z + Math.cos(ang) * dist; return { x, y: hAt(x, z), z }; };
  const shore = (s, ang) => shoreOf(W, s, ang), on = q => ({ x: q.x, y: hAt(q.x, q.z), z: q.z });

  // ---- plants and small things ----
  const pine = (x, y, z, s, a = "#2f7d4a", b = "#3d8f57") => { L("cyl", "#6b4a2b", 0.5 * s, 2.4 * s, 0.5 * s, x, y + 1.1 * s, z); L("cone", a, 2.6 * s, 5 * s, 2.6 * s, x, y + 4.4 * s, z); L("cone", b, 1.9 * s, 4.2 * s, 1.9 * s, x, y + 7.2 * s, z, 0.6); };
  const round = (x, y, z, s, a, b) => { L("cyl", "#5e4330", 0.45 * s, 3.2 * s, 0.45 * s, x, y + 1.5 * s, z); L("blob", a, 2.7 * s, 2.3 * s, 2.7 * s, x, y + 4.6 * s, z, x); L("blob", b, 1.8 * s, 1.6 * s, 1.8 * s, x + 1.3 * s, y + 5.9 * s, z + 0.6 * s, z); };
  const palm = (x, y, z, s, ry) => {
    for (let k = 0; k < 3; k++) L("box", "#9a7648", 0.5 * s, 2.3 * s, 0.5 * s, x + Math.sin(ry) * k * 0.5 * s, y + (1 + k * 2) * s, z + Math.cos(ry) * k * 0.5 * s, ry, 0.22);
    const tx = x + Math.sin(ry) * 1.3 * s, ty = y + 6.3 * s, tz = z + Math.cos(ry) * 1.3 * s;
    for (let j = 0; j < 5; j++) { const a = ry + j * 1.257; L("box", j % 2 ? "#3fa05a" : "#55b86a", 1.0 * s, 0.2 * s, 3.6 * s, tx + Math.sin(a) * 1.6 * s, ty - 0.4 * s, tz + Math.cos(a) * 1.6 * s, a, 0.4); }
  };
  const cactus = (x, y, z, s) => { L("box", "#4f9a5a", 0.9 * s, 4 * s, 0.9 * s, x, y + 2 * s, z); L("box", "#4f9a5a", 1.7 * s, 0.6 * s, 0.6 * s, x + 0.9 * s, y + 2.1 * s, z); L("box", "#5aa866", 0.6 * s, 1.6 * s, 0.6 * s, x + 1.5 * s, y + 2.9 * s, z); L("box", "#4f9a5a", 1.3 * s, 0.6 * s, 0.6 * s, x - 0.8 * s, y + 1.4 * s, z); L("box", "#5aa866", 0.6 * s, 1.2 * s, 0.6 * s, x - 1.2 * s, y + 2 * s, z); };
  const dead = (x, y, z, s) => { L("box", "#2b2326", 0.5 * s, 5 * s, 0.5 * s, x, y + 2.5 * s, z); L("box", "#2b2326", 0.3 * s, 2.4 * s, 0.3 * s, x + 0.8 * s, y + 4 * s, z, 0, 0, -0.8); L("box", "#2b2326", 0.3 * s, 2 * s, 0.3 * s, x - 0.7 * s, y + 3.2 * s, z, 0, 0, 0.7); };
  const jtree = (x, y, z, s) => { L("cyl", "#5a4030", 0.6 * s, 7 * s, 0.6 * s, x, y + 3.5 * s, z); L("blob", "#2f8a4a", 4.2 * s, 1.7 * s, 4.2 * s, x, y + 7.4 * s, z, x); L("blob", "#4bb062", 2.8 * s, 1.3 * s, 2.8 * s, x + 0.8 * s, y + 8.9 * s, z, z); };
  const cypress = (x, y, z, s) => { L("cyl", "#5e4330", 0.35 * s, 1.5 * s, 0.35 * s, x, y + 0.7 * s, z); L("cone", "#2e6b4a", 1.25 * s, 8 * s, 1.25 * s, x, y + 5.2 * s, z); };
  const rock = (x, y, z, s, c = "#8d8579") => L("blob", c, 1.6 * s, 1.1 * s, 1.4 * s, x, y + 0.4 * s, z, x * 3);
  const footing = (x, y, z, w, d, ry = 0, c = "#9a948a") => L("box", c, w, 5, d, x, y - 2.4, z, ry);
  const house = (x, y, z, s, ry, wall, roof) => { footing(x, y, z, 5.3 * s, 4.5 * s, ry); L("box", wall, 5 * s, 3.8 * s, 4.2 * s, x, y + 1.3 * s, z, ry); L("pyr", roof, 4.4 * s, 2.8 * s, 4.4 * s, x, y + 4.6 * s, z, ry + Math.PI / 4); U("box", "#ffe08a", 0.9 * s, 0.9 * s, 0.2 * s, x + Math.sin(ry) * 2.1 * s, y + 1.8 * s, z + Math.cos(ry) * 2.1 * s, ry); };
  // a gate of two posts and a beam, standing across the direction `ry`
  const gate = (x, y, z, ry, post, beam, h, w) => {
    for (const d of [-1, 1]) L("cyl", post, 0.6, h, 0.6, x + Math.cos(ry) * d * w / 2, y + h / 2 - 0.5, z - Math.sin(ry) * d * w / 2);
    L("box", post, w + 2.4, 0.8, 0.9, x, y + h - 0.4, z, ry); L("box", beam, w + 3.6, 0.55, 1.2, x, y + h + 0.3, z, ry); L("box", post, w + 0.6, 0.5, 0.5, x, y + h - 2, z, ry);
  };

  // ---- water that runs down a slope: a strip laid on the ground from `f0` of the radius out to the sea ----
  const fallPos = [], fallUv = [];
  const fall = (s, ang, f0, w) => {
    const ax = Math.sin(ang), az = Math.cos(ang), px = az, pz = -ax; let prev = null, len = 0, end = null;
    for (let f = f0; f <= 1.0; f += 0.02) {
      const wob = Math.sin(f * 15 + ang) * w * 0.5, cx = s.x + ax * s.r * f + px * wob, cz = s.z + az * s.r * f + pz * wob, hw = w / 2 * (0.7 + f * 0.6);
      const l = [cx - px * hw, Math.max(hAt(cx - px * hw, cz - pz * hw), -0.1) + 0.4, cz - pz * hw], r = [cx + px * hw, Math.max(hAt(cx + px * hw, cz + pz * hw), -0.1) + 0.4, cz + pz * hw];
      if (prev) {
        const v0 = len / 6; len += Math.hypot(l[0] - prev.l[0], l[1] - prev.l[1], l[2] - prev.l[2]); const v1 = len / 6;
        fallPos.push(...prev.l, ...prev.r, ...l, ...prev.r, ...r, ...l); fallUv.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
      }
      prev = { l, r }; end = [cx, cz]; keep.push([cx, cz, hw + 2.2]);
      if (hAt(cx, cz) < -0.3) break;
    }
    const top = at(s, ang, s.r * f0); for (const d of [-1, 1]) rock(top.x + px * d * w * 0.7, top.y, top.z + pz * d * w * 0.7, 1.3);
    if (end) emit.push({ kind: "foam", x: end[0], y: 0.4, z: end[1], r: w * 0.6, acc: 0 });
  };

  // ---- the ten places ----
  const anim = {};
  const place = {
    // The Roost: a tall tower of three drums with lit windows, four turrets, a nest on top and a ring of pillars where the light ends.
    roost(s, A, T) {
      const y0 = W.roost.y; let ty = y0 + 3;
      L("oct", "#cfc6b4", 17, 6, 17, 0, y0 - 1.5, 0); L("oct", "#e6dfce", 12.5, 1.6, 12.5, 0, y0 + 2.2, 0);
      [[7, 13], [5.6, 12], [4.5, 11]].forEach(([r, h], k) => {
        const turn = k * 0.39;
        L("taper", k % 2 ? "#d5ccba" : "#e6dfce", r, h, r, 0, ty + h / 2, 0, turn); L("oct", "#b9ae98", r * 0.72 + 0.9, 1, r * 0.72 + 0.9, 0, ty + h, 0, turn);
        for (let j = 0; j < 4; j++) { const a = Math.PI / 8 + j * Math.PI / 2 + turn; U("box", "#ffd76a", 1.1, 2.3, 0.6, Math.sin(a) * r * 0.79, ty + h * 0.55, Math.cos(a) * r * 0.79, a); }
        ty += h;
      });
      L("oct", "#b9ae98", 7.6, 1.6, 7.6, 0, ty + 0.8, 0);
      for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; L("box", "#d5ccba", 1.5, 1.8, 1.5, Math.sin(a) * 6.5, ty + 2.5, Math.cos(a) * 6.5, a); }
      for (let j = 0; j < 10; j++) { const a = j * 0.628; L("box", j % 2 ? "#8a6a3f" : "#a07c4a", 3.4, 0.55, 0.7, Math.sin(a) * 3.8, ty + 2 + (j % 2) * 0.4, Math.cos(a) * 3.8, a + 0.3, 0, 0.15); }
      for (let j = 0; j < 4; j++) {
        const a = Math.PI / 4 + j * Math.PI / 2, p = on(T.turrets[j]);
        L("oct", "#d5ccba", 2.6, 17, 2.6, p.x, p.y + 6.5, p.z); L("oct", "#b9ae98", 3.1, 1, 3.1, p.x, p.y + 15, p.z); L("cone", "#b3323f", 3.6, 6.5, 3.6, p.x, p.y + 18.7, p.z);
        U("box", "#ffd76a", 0.9, 1.7, 0.5, p.x + Math.sin(a) * 2.3, p.y + 11, p.z + Math.cos(a) * 2.3, a);
        L("box", "#6b4a2b", 0.22, 4, 0.22, p.x, p.y + 23.5, p.z); L("box", "#ffd24a", 2.4, 1.3, 0.14, p.x + 1.3, p.y + 24.6, p.z);
        L("box", "#cfc6b4", 1.6, 1.4, 9, Math.sin(a) * 9, p.y + 10, Math.cos(a) * 9, a);
      }
      for (let j = 0; j < 12; j++) { const p = at(s, j * Math.PI / 6 + 0.26, ROOST_R); L("box", "#d5ccba", 1.4, 7, 1.4, p.x, p.y + 2.5, p.z); U("box", "#ffd76a", 1.8, 1, 1.8, p.x, p.y + 6.4, p.z); }
      keep.push([0, 0, 36]); anim.top = ty;
      fall(s, 0.9, 0.5, 5); fall(s, 3.7, 0.5, 5);
      emit.push({ kind: "gold", x: 0, y: y0, z: 0, r: ROOST_R, acc: 0 });
    },
    // The snow peak: a crown of ice around the summit, where the thermal rises.
    snow(s, A) {
      for (let j = 0; j < 9; j++) { const p = at(s, j * 0.7 + 0.2, 19 + rng() * 2), h = 6 + rng() * 6; L("pyr", "#bfe6ff", 1.6, h, 1.6, p.x, p.y + h / 2 - 0.6, p.z, rng() * 3); U("pyr", "#eefaff", 0.8, h * 0.5, 0.8, p.x + 1.3, p.y + h * 0.25 - 0.3, p.z + 0.8, rng() * 3); }
      fall(s, A + 0.5, 0.42, 4);
      emit.push({ kind: "snow", x: s.x, y: s.h, z: s.z, r: s.r * 0.7, acc: 0 });
    },
    // The volcano: dark rock, a lake of lava in a ring of boulders, smoke that marks the thermal.
    volcano(s) {
      let rim = 6; while (rim < s.r && hAt(s.x + rim, s.z) > s.h * 0.9 - 1) rim += 1;
      for (let j = 0; j < 14; j++) { const p = at(s, j * 0.449, rim + rng() * 2), k = 2.2 + rng() * 1.8; L("blob", j % 2 ? "#2e282c" : "#3d3336", k, k * 1.2, k, p.x, p.y + k * 0.4, p.z, j); }
      for (let j = 0; j < 7; j++) { const p = at(s, rng() * 6.283, rng() * rim * 0.7); U("box", "#fff0a0", 1.6, 0.7, 1.6, p.x, p.y + 0.2, p.z, rng()); }
      emit.push({ kind: "smoke", x: s.x, y: hAt(s.x, s.z), z: s.z, r: Math.min(rim * 0.6, 12), acc: 0 });
    },
    // The blossom island: a red gate on the beach that faces the Roost, a pagoda up the hill, petals in the air.
    sakura(s, A, T) {
      const g = at(s, A, shore(s, A) - 5); gate(g.x, g.y, g.z, A, "#d8402f", "#2b2326", 8.5, 6.5);
      const p = on(T.pagoda); footing(p.x, p.y, p.z, 7.2, 7.2);
      for (let t = 0; t < 3; t++) { const w = 6.4 - t * 1.4; L("box", "#f3ead8", w, 3.2, w, p.x, p.y + 1.4 + t * 4.2, p.z); L("pyr", "#7a2f3a", w * 1.05, 1.7, w * 1.05, p.x, p.y + 3.8 + t * 4.2, p.z, Math.PI / 4); }
      U("box", "#ffd76a", 0.45, 2.6, 0.45, p.x, p.y + 14.2, p.z); keep.push([p.x, p.z, 8]);
      for (let j = 0; j < 4; j++) { const q = at(s, A + 0.9 + j * 1.57, aside(s) * 0.5 + 9); L("box", "#9a948a", 0.7, 1.6, 0.7, q.x, q.y + 0.6, q.z); U("box", "#ffe08a", 0.9, 0.8, 0.9, q.x, q.y + 1.8, q.z); }
      emit.push({ kind: "petal", x: s.x, y: s.h, z: s.z, r: s.r * 0.8, acc: 0 });
    },
    // The desert: a pyramid with a gold cap, an obelisk, a camp of tents.
    desert(s, A, T) {
      const p = on(T.pyramid); p.y = Math.min(p.y, hAt(p.x + 6, p.z), hAt(p.x - 6, p.z), hAt(p.x, p.z + 6), hAt(p.x, p.z - 6)) + 1; L("pyr", "#e2b96a", 11, 10, 11, p.x, p.y + 4, p.z, Math.PI / 4); U("pyr", "#ffd76a", 2.2, 2, 2.2, p.x, p.y + 8.05, p.z, Math.PI / 4); keep.push([p.x, p.z, 11]);
      const o = on(T.obelisk); L("box", "#d9a066", 1.4, 10, 1.4, o.x, o.y + 4.5, o.z); U("pyr", "#ffd76a", 1.1, 1.5, 1.1, o.x, o.y + 10.2, o.z, Math.PI / 4); keep.push([o.x, o.z, 4]);
      for (let j = 0; j < 4; j++) { const q = at(s, A + 0.2 + j * 0.13, shore(s, A + 0.2) - 9 - (j % 2) * 5); L("pyr", j % 2 ? "#c0392f" : "#f4efe3", 2.8, 2.6, 2.8, q.x, q.y + 1, q.z, j); keep.push([q.x, q.z, 4]); }
    },
    // The autumn island: a village of red roofs around a well and a hall with a tall roof.
    autumn(s, A, T) {
      const c = at(s, A + 0.5, aside(s));
      for (let j = 0; j < 7; j++) { const a = j * 0.898, d = 10 + (j % 2) * 4.5, x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d; house(x, hAt(x, z), z, 0.85 + (j % 3) * 0.1, a + Math.PI, j % 2 ? "#f4e9d2" : "#e9d9b8", ["#b3423a", "#8a4a2f", "#c9683a"][j % 3]); }
      L("cyl", "#9a948a", 1.3, 1.2, 1.3, c.x, c.y + 0.4, c.z); L("pyr", "#8a4a2f", 1.7, 1.2, 1.7, c.x, c.y + 3, c.z, Math.PI / 4);
      const h = on(T.hall); footing(h.x, h.y, h.z, 4.6, 4.6, A); L("box", "#f4e9d2", 4, 9, 4, h.x, h.y + 4, h.z, A); L("pyr", "#b3423a", 3.6, 5, 3.6, h.x, h.y + 11, h.z, A + Math.PI / 4); U("box", "#ffe08a", 1, 1.4, 0.3, h.x + Math.sin(A) * 2, h.y + 6.5, h.z + Math.cos(A) * 2, A);
      keep.push([c.x, c.z, 18], [h.x, h.z, 5]);
      emit.push({ kind: "chimney", x: c.x + 10, y: hAt(c.x + 10, c.z) + 6, z: c.z, r: 1, acc: 0 }, { kind: "leaf", x: s.x, y: s.h, z: s.z, r: s.r * 0.8, acc: 0 });
    },
    // The ruins: standing stones in a ring around the thermal, a row of broken columns down to a stone arch on the beach.
    ruins(s, A) {
      for (let j = 0; j < 12; j++) {
        const a = j * Math.PI / 6, p = at(s, a, 20), pair = j % 3 !== 2, h = pair ? 8 : 4 + rng() * 3;
        L("box", j % 2 ? "#c9c3b2" : "#b8b2a2", 2.3, h, 1.6, p.x, p.y + h / 2 - 0.6, p.z, a, 0, pair ? 0 : (rng() - 0.5) * 0.3);
        if (j % 3 === 0) { const q = at(s, a + Math.PI / 12, 20 * Math.cos(Math.PI / 12)); L("box", "#d6d0c0", 11.5, 1.3, 1.9, q.x, Math.max(p.y, q.y) + 7.9, q.z, a + Math.PI / 12); }
      }
      U("oct", "#7fe8ff", 3.2, 0.4, 3.2, s.x, hAt(s.x, s.z) + 0.5, s.z); for (let j = 0; j < 6; j++) { const p = at(s, j * 1.047, 6.5); U("box", "#bff4ff", 0.7, 0.4, 0.7, p.x, p.y + 0.5, p.z); }
      const out = shore(s, A);
      for (let k = 0; k < 5; k++) for (const d of [-1, 1]) { const p = at(s, A + d * 5 / (30 + k * 9), 30 + k * (out - 40) / 5); if (p.y < 1) continue; const h = (k + (d > 0 ? 1 : 0)) % 3 ? 5.5 : 2 + rng() * 2; L("cyl", "#d6d0c0", 0.85, h, 0.85, p.x, p.y + h / 2 - 0.4, p.z); if (h > 5) L("box", "#c9c3b2", 2.1, 0.6, 2.1, p.x, p.y + h - 0.2, p.z); }
      const g = at(s, A, out - 5); gate(g.x, g.y, g.z, A, "#c9c3b2", "#b8b2a2", 8, 7);
      keep.push([s.x, s.z, 24]);
    },
    // The jungle: one giant tree with lantern fruit, and three streams running to the sea.
    jungle(s, A, T) {
      const p = on(T.tree); p.y = Math.min(p.y, hAt(p.x + 3.5, p.z), hAt(p.x - 3.5, p.z), hAt(p.x, p.z + 3.5), hAt(p.x, p.z - 3.5));
      L("taper", "#6b4a35", 4.4, 27, 4.4, p.x, p.y + 12, p.z);
      for (let j = 0; j < 6; j++) { const a = j * 1.047; L("box", "#5a3f2e", 1.6, 5.5, 3.2, p.x + Math.sin(a) * 4.6, p.y + 1.6, p.z + Math.cos(a) * 4.6, a, -0.5); }
      L("puff", "#2f8a4a", 15, 8.5, 15, p.x, p.y + 30, p.z);
      for (let j = 0; j < 5; j++) { const a = j * 1.257 + 0.4; L("puff", ["#3b9c55", "#2a7a44", "#46a85c"][j % 3], 9.5, 6, 9.5, p.x + Math.sin(a) * 10, p.y + 26 + (j % 2) * 3, p.z + Math.cos(a) * 10, j); }
      L("puff", "#4bb062", 9, 6, 9, p.x + 1, p.y + 36.5, p.z - 1, 1);
      for (let j = 0; j < 9; j++) { const a = j * 0.698, d = 6 + (j % 3) * 4; L("box", "#3a2a20", 0.12, 3, 0.12, p.x + Math.sin(a) * d, p.y + 22.5, p.z + Math.cos(a) * d); U("box", "#ffe27a", 0.8, 1, 0.8, p.x + Math.sin(a) * d, p.y + 20.6, p.z + Math.cos(a) * d); }
      keep.push([p.x, p.z, 12]);
      fall(s, A - 0.7, 0.3, 4.5); fall(s, A + 2.2, 0.3, 4.5); fall(s, A + 3.9, 0.35, 4);
      emit.push({ kind: "firefly", x: p.x, y: p.y + 8, z: p.z, r: 22, acc: 0 });
    },
    // The harbour: a striped lighthouse with a turning beam, a pier, and huts with blue roofs.
    harbor(s, A, T) {
      const p = on(T.light); L("oct", "#8d8579", 4.4, 3, 4.4, p.x, p.y, p.z);
      for (let k = 0; k < 5; k++) L("taper", k % 2 ? "#d8402f" : "#f6f3ea", 2.6 - k * 0.22, 4.2, 2.6 - k * 0.22, p.x, p.y + 3.4 + k * 4.2, p.z);
      L("oct", "#3a3340", 2.7, 0.5, 2.7, p.x, p.y + 22.6, p.z); U("oct", "#fff2a8", 1.3, 2.2, 1.3, p.x, p.y + 23.9, p.z); L("cone", "#d8402f", 2, 2, 2, p.x, p.y + 26, p.z);
      anim.lamp = [p.x, p.y + 23.9, p.z]; keep.push([p.x, p.z, 6]);
      const a2 = A + 0.25, f0 = shore(s, a2);
      for (let k = 0; k < 8; k++) { const d = f0 - 2 + k * 3.3, x = s.x + Math.sin(a2) * d, z = s.z + Math.cos(a2) * d; L("box", k % 2 ? "#a07a4f" : "#8f6b43", 3.2, 0.4, 3.4, x, 1.2, z, a2); if (k % 2) for (const e of [-1, 1]) L("box", "#6b4a2b", 0.4, 2.6, 0.4, x + Math.cos(a2) * e * 1.5, 0.3, z - Math.sin(a2) * e * 1.5); }
      anim.moor = [[s.x + Math.sin(a2) * (f0 + 20) + Math.cos(a2) * 5, s.z + Math.cos(a2) * (f0 + 20) - Math.sin(a2) * 5, a2], [s.x + Math.sin(a2) * (f0 + 9) - Math.cos(a2) * 5.5, s.z + Math.cos(a2) * (f0 + 9) + Math.sin(a2) * 5.5, a2 + 3.1]];
      for (let j = 0; j < 5; j++) { const q = at(s, a2 + (j - 2) * 0.17 + 0.05, f0 - 9 - (j % 2) * 6); house(q.x, q.y, q.z, 0.8, a2, "#fbf7ee", j % 2 ? "#3f78b5" : "#5a93cc"); keep.push([q.x, q.z, 5]); }
    },
    // The lavender island: a windmill above the purple fields, a farmhouse, stacks of hay.
    lavender(s, A, T) {
      const p = on(T.mill); L("oct", "#9a948a", 3.6, 5, 3.6, p.x, p.y - 2.2, p.z); L("taper", "#f4efe3", 3.2, 12, 3.2, p.x, p.y + 5.5, p.z); L("cone", "#8a4a2f", 3, 3.2, 3, p.x, p.y + 13.1, p.z); U("box", "#ffe08a", 0.9, 1.3, 0.4, p.x + Math.sin(A) * 2.7, p.y + 5, p.z + Math.cos(A) * 2.7, A);
      anim.mill = [p.x + Math.sin(A) * 3, p.y + 10.4, p.z + Math.cos(A) * 3, A]; keep.push([p.x, p.z, 9]);
      const q = at(s, A - 0.4, aside(s) + 15); house(q.x, q.y, q.z, 1.1, A, "#f4e9d2", "#8a4a2f"); keep.push([q.x, q.z, 6]);
    },
  };
  W.islands.forEach((s, i) => place[themes[i]](s, Math.atan2(-s.x, -s.z), tall[i]));

  // ---- scatter: each island grows its own kind of tree, the same for every player ----
  W.islands.forEach((s, i) => {
    const th = themes[i], n = Math.round(24 + s.r * 0.8);
    for (let k = 0; k < n; k++) {
      const a = rng() * 6.283, d = Math.sqrt(rng()) * s.r * 0.92, x = s.x + Math.sin(a) * d, z = s.z + Math.cos(a) * d, y = hAt(x, z), sc = 0.8 + rng() * 0.9, u = rng(), yf = y / s.h;
      if (y < 1.4 || keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
      if (th === "volcano" && [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].some(([a, b]) => ground(th, s, x + a, hAt(x + a, z + b), z + b, false, 0).startsWith("#ff"))) continue;   // not in the lava
      if (th === "roost") u < 0.7 ? pine(x, y, z, sc) : round(x, y, z, sc, "#5fae5a", "#79c46a");
      else if (th === "snow") { if (yf < 0.6) pine(x, y, z, sc, "#2c6b55", yf > 0.24 ? "#f4f8fc" : "#3a7f63"); else if (u < 0.35) rock(x, y, z, sc * 1.3, "#aab6c4"); }
      else if (th === "volcano") { if (yf > 0.85) continue; if (yf < 0.2 && u < 0.4) pine(x, y, z, sc * 0.8, "#4a6b3a", "#5a7a44"); else if (u < 0.55) dead(x, y, z, sc); else rock(x, y, z, sc * 1.4, "#3a3034"); }
      else if (th === "sakura") u < 0.85 ? round(x, y, z, sc, pick(["#f7a8c4", "#f9bdd3", "#ee8fb3"]), "#fcd3e1") : pine(x, y, z, sc * 0.9);
      else if (th === "desert") { if (y < 5) palm(x, y, z, sc, a); else if (u < 0.35) cactus(x, y, z, sc); else if (u < 0.6) rock(x, y, z, sc * 1.3, "#c4733f"); }
      else if (th === "autumn") round(x, y, z, sc, pick(["#e0782f", "#c9452f", "#e8b13a", "#d95f2a"]), pick(["#f0c04a", "#e8963a"]));
      else if (th === "ruins") { if (u < 0.45) round(x, y, z, sc, "#7fb56a", "#93c67a"); else if (u < 0.65) rock(x, y, z, sc * 1.3, "#b8b2a2"); else if (u < 0.8) L("cyl", "#d6d0c0", 0.75, 1.5 + rng() * 3, 0.75, x, y + 1, z); }
      else if (th === "jungle") y < 4 ? palm(x, y, z, sc, a) : jtree(x, y, z, sc);
      else if (th === "harbor") { if (u < 0.5) round(x, y, z, sc, "#6fbf5e", "#8ad06f"); else if (u < 0.8) pine(x, y, z, sc * 0.9); else L("blob", "#5fae5a", 1.4, 1, 1.4, x, y + 0.5, z); }
      else { if (u < 0.45) cypress(x, y, z, sc); else if (u < 0.62) round(x, y, z, sc, "#7fbf62", "#9ad07a"); else if (u < 0.8) L("cyl", "#e8c95a", 1.4, 1.7, 1.4, x, y + 0.6, z); }
    }
    // a few low rocks standing in the shallows
    for (let k = 0; k < 5; k++) { const a = rng() * 6.283, d = s.r * (1.04 + rng() * 0.2), x = s.x + Math.sin(a) * d, z = s.z + Math.cos(a) * d; if (hAt(x, z) > -2) continue; const w = 1.6 + rng() * 1.8; L("blob", th === "volcano" ? "#3a3034" : th === "harbor" ? "#f2eee2" : "#8d8579", w, w * (0.8 + rng() * 0.6), w, x, 0.3, z, k); }
  });
  scene.add(lit.mesh(litMat()), glow.mesh(new THREE.MeshBasicMaterial({ vertexColors: true })));

  // ---- running water: one strip mesh with a tiny striped picture that slides downhill ----
  const fc = document.createElement("canvas"); fc.width = 8; fc.height = 16; const fx = fc.getContext("2d"), fr = lcg(9);
  fx.fillStyle = "#6fc6ee"; fx.fillRect(0, 0, 8, 16); for (let k = 0; k < 22; k++) { fx.fillStyle = k % 3 ? "#ffffff" : "#bfeaff"; fx.fillRect(Math.floor(fr() * 8), Math.floor(fr() * 16), 1, 2 + Math.floor(fr() * 3)); }
  const fallTex = new THREE.CanvasTexture(fc); fallTex.magFilter = fallTex.minFilter = THREE.NearestFilter; fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping; fallTex.colorSpace = THREE.SRGBColorSpace;
  const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fallPos), 3)); fg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(fallUv), 2));
  scene.add(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: fallTex, side: THREE.DoubleSide })));

  // ---- sea, sky, far hills, clouds ----
  const water = sea(W), sky = dome(), far = backdrop(), { layers, inCloud } = clouds(W); scene.add(water, sky, far, ...layers);

  // ---- the Roost's light: a wide column, a bright core that reaches the top of the sky, three turning halos and a gold heart ----
  const roost = new THREE.Group(); roost.position.set(0, W.roost.y, 0); scene.add(roost);
  const lightCol = (r, h, y, opacity) => {
    const g = new THREE.CylinderGeometry(r, r, h, 20, 1, true), c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { const v = g.attributes.position.getY(i) > 0 ? 0.04 : 1; c.set([v, v, v], i * 3); }   // fades out toward the top
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#ffd76a", vertexColors: true, transparent: true, opacity, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    m.position.y = y + h / 2; roost.add(m); return m;
  };
  const top = anim.top - W.roost.y, beam = lightCol(ROOST_R, 330, 0, 0.075), core = lightCol(2.4, 420, top + 6, 0.75);
  const gold = new THREE.MeshBasicMaterial({ color: "#ffd76a", fog: false });
  const halos = [[ROOST_R, 44, 0.55], [17, 78, 0.45], [10, 112, 0.38]].map(([r, y, w]) => { const h = new THREE.Mesh(new THREE.TorusGeometry(r, w, 5, 28), gold); h.rotation.x = Math.PI / 2; h.position.y = y; h.userData.y = y; roost.add(h); return h; });
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(2.6), new THREE.MeshBasicMaterial({ color: "#fff3b0", fog: false })); heart.scale.y = 1.5; heart.position.y = top + 7.5; roost.add(heart);

  // ---- the lighthouse beam and the windmill sails ----
  let lamp = null, mill = null;
  if (anim.lamp) {
    const g = new THREE.ConeGeometry(2.4, 30, 4, 1, true); g.translate(0, -15, 0); g.rotateZ(-Math.PI / 2 - 0.05);   // two short shafts, back to back
    const g2 = g.clone().rotateY(Math.PI), c = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#fff2a8", transparent: true, opacity: 0.4, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lamp = new THREE.Group(); lamp.add(c, new THREE.Mesh(g2, c.material)); lamp.position.set(...anim.lamp); scene.add(lamp);
  }
  if (anim.mill) {
    const b = new Bag(); for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2; b.add(G.box, "#6b4a2b", 0.4, 8.5, 0.3, -Math.sin(a) * 4.2, Math.cos(a) * 4.2, 0, 0, 0, a); b.add(G.box, "#fff6df", 2, 6, 0.14, -Math.sin(a) * 5 + Math.cos(a) * 1.1, Math.cos(a) * 5 + Math.sin(a) * 1.1, 0, 0, 0, a); }
    b.add(G.box, "#6b4a2b", 1, 1, 1.2, 0, 0, -0.4);
    mill = b.mesh(litMat()); mill.position.set(anim.mill[0], anim.mill[1], anim.mill[2]); mill.rotation.order = "YXZ"; mill.rotation.y = anim.mill[3]; scene.add(mill);
  }

  // ---- boats: small sails that circle the islands, and two tied up at the harbour pier ----
  const hull = new Bag(); hull.add(G.box, "#8a5a3a", 2.2, 1.1, 6, 0, 0.35, 0); hull.add(G.box, "#6b4a2b", 1.5, 0.7, 1.6, 0, 0.5, 3.4); hull.add(G.box, "#6b4a2b", 0.25, 5.6, 0.25, 0, 3.4, 0.4);
  hull.add(G.box, "#fff6df", 0.14, 3.9, 2.8, 0, 3.7, -1.1); hull.add(G.box, "#d8402f", 0.16, 0.8, 2.8, 0, 2.2, -1.1); hull.add(G.box, "#d8402f", 0.1, 0.6, 1, 0, 6.3, -0.1);
  const fleet = [], atSea = (s, rad) => { for (let a = 0; a < 6.283; a += 0.15) if (W.heightAt(s.x + Math.sin(a) * rad, s.z + Math.cos(a) * rad) > -3.5) return false; return true; };
  W.islands.slice(1).forEach((s, i) => { if (i % 3 === 1) return; const rad = [1.28 + (i % 4) * 0.09, 1.2, 1.12, 1.5, 1.75].map(k => s.r * k).find(d => atSea(s, d)); if (rad) fleet.push({ s, rad, ph: i * 2.1, dir: i % 2 ? 1 : -1 }); });   // a boat only sails where its whole circle is open water
  const moor = anim.moor || [], boats = new THREE.InstancedMesh(hull.geometry(), litMat(), fleet.length + moor.length); boats.frustumCulled = false; scene.add(boats);
  moor.forEach(([x, z, a], k) => setRY(boats.instanceMatrix.array, fleet.length + k, x, 0.1, z, a, 1));

  // ---- birds: small flocks that circle high over a few islands ----
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.7, -2.4, 1, -0.7, 0, 0, -0.1, 0, 0, 0.7, 0, 0, -0.1, 2.4, 1, -0.7]), 3));
  const flocks = [0, 2, 4, 7].filter(i => W.islands[i]).map((i, k) => ({ s: W.islands[i], rad: 55 + k * 14, y: W.islands[i].h + 42 + k * 9, w: (k % 2 ? -1 : 1) * (0.2 - k * 0.025), n: 5 + (k % 2) * 2 }));
  const birdN = flocks.reduce((a, f) => a + f.n, 0), birds = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: "#453f5c", side: THREE.DoubleSide }), birdN); birds.frustumCulled = false; scene.add(birds);

  return {
    emit, hAt, themes, inCloud,
    fog(near, farD) { water.material.uniforms.fogN.value = near; water.material.uniforms.fogF.value = farD; },
    update(clock, cam) {
      water.material.uniforms.t.value = clock; sky.position.copy(cam.position); far.position.set(cam.position.x, 0, cam.position.z);
      layers[2].rotation.y = clock * 0.002;
      fallTex.offset.y = clock * 0.9;
      beam.material.opacity = 0.075 + Math.sin(clock * 1.7) * 0.015;
      for (let k = 0; k < halos.length; k++) { const h = halos[k]; h.rotation.z = clock * (0.5 + k * 0.2) * (k % 2 ? -1 : 1); h.position.y = h.userData.y + Math.sin(clock * 1.2 + k * 1.4) * 3; }
      heart.rotation.y = clock * 1.4; heart.position.y = top + 7.5 + Math.sin(clock * 2) * 0.7;
      if (lamp) lamp.rotation.y = clock * 1.1;
      if (mill) mill.rotation.z = clock * 0.7;
      const B = boats.instanceMatrix.array;
      for (let k = 0; k < fleet.length; k++) { const b = fleet[k], a = b.ph + clock * 3.2 / b.rad * b.dir; setRY(B, k, b.s.x + Math.sin(a) * b.rad, 0.1 + Math.sin(clock * 1.6 + k) * 0.14, b.s.z + Math.cos(a) * b.rad, a + Math.PI / 2 * b.dir, 1); }
      boats.instanceMatrix.needsUpdate = true;
      const F = birds.instanceMatrix.array; let n = 0;
      for (const f of flocks) for (let k = 0; k < f.n; k++) {
        const rowN = Math.ceil(k / 2), side = k % 2 ? 1 : -1, a = clock * f.w - rowN * 0.07 * Math.sign(f.w), rad = f.rad + side * rowN * 3.2;
        setRY(F, n++, f.s.x + Math.sin(a) * rad, f.y + Math.sin(clock * 0.7 + k) * 1.5, f.s.z + Math.cos(a) * rad, a + Math.PI / 2 * Math.sign(f.w), 1, Math.sin(clock * 7 + k * 1.3) * 0.9, 1);
      }
      birds.instanceMatrix.needsUpdate = true;
    },
  };
}

// Dragon Stakes view effects: one pool of small flat-coloured boxes for every spark, puff and streak in the sky,
// and a ribbon that trails from a wing tip. Nothing in here allocates while the game runs.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// Writes a "turn around the up axis, scale, move" matrix straight into an instance buffer.
export function setRY(arr, i, x, y, z, a, sx, sy = sx, sz = sx) {
  const o = i * 16, c = Math.cos(a), n = Math.sin(a);
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -n * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = n * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

// Each spark: position, speed, age, life, size, gravity, how much it grows, drag, and (for streaks) a length and a direction.
const S = 16;
export class Sparks {
  constructor(scene, max = 900) {
    this.max = max; this.n = 0; this.d = new Float32Array(max * S);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff" }), max);
    this.mesh.setColorAt(0, new THREE.Color("#ffffff")); this.mesh.instanceColor.array.fill(1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0; scene.add(this.mesh);
  }
  // col is a THREE.Color kept by the caller. len > 0 makes a streak lying along (dx, dy, dz).
  add(x, y, z, vx, vy, vz, dur, size, col, grav = 0, grow = 0, drag = 0, len = 0, dx = 0, dy = 1, dz = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, o = i * S, d = this.d, C = this.mesh.instanceColor.array;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = 0; d[o + 7] = dur; d[o + 8] = size;
    d[o + 9] = grav; d[o + 10] = len; d[o + 11] = grow; d[o + 12] = drag; d[o + 13] = dx; d[o + 14] = dy; d[o + 15] = dz;
    C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b;
  }
  update(dt) {
    const d = this.d, M = this.mesh.instanceMatrix.array, C = this.mesh.instanceColor.array;
    for (let i = 0; i < this.n; i++) {
      const o = i * S; d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) {                                    // spent: the last live spark takes its place
        const l = --this.n; if (i !== l) { d.copyWithin(o, l * S, l * S + S); C.copyWithin(i * 3, l * 3, l * 3 + 3); }
        i--; continue;
      }
      const k = 1 - Math.min(1, d[o + 12] * dt); d[o + 3] *= k; d[o + 4] = d[o + 4] * k - d[o + 9] * dt; d[o + 5] *= k;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const u = d[o + 6] / d[o + 7], s = d[o + 8] * (1 + d[o + 11] * u) * Math.min(1, (1 - u) * 3), m = i * 16, len = d[o + 10];
      if (len > 0) {
        const zx = d[o + 13], zy = d[o + 14], zz = d[o + 15]; let xx = zz, xz = -zx, xl = Math.hypot(xx, xz);
        if (xl < 1e-4) { xx = 1; xz = 0; xl = 1; } xx /= xl; xz /= xl;
        const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx, ln = len * Math.min(1, (1 - u) * 3);
        M[m] = xx * s; M[m + 1] = 0; M[m + 2] = xz * s; M[m + 3] = 0; M[m + 4] = yx * s; M[m + 5] = yy * s; M[m + 6] = yz * s; M[m + 7] = 0;
        M[m + 8] = zx * ln; M[m + 9] = zy * ln; M[m + 10] = zz * ln; M[m + 11] = 0;
      } else {
        M[m] = s; M[m + 1] = 0; M[m + 2] = 0; M[m + 3] = 0; M[m + 4] = 0; M[m + 5] = s; M[m + 6] = 0; M[m + 7] = 0; M[m + 8] = 0; M[m + 9] = 0; M[m + 10] = s; M[m + 11] = 0;
      }
      M[m + 12] = d[o]; M[m + 13] = d[o + 1]; M[m + 14] = d[o + 2]; M[m + 15] = 1;
    }
    this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

// A short white ribbon that follows one point (a wing tip). It is widest at the tip and thins to nothing behind.
export class Ribbon {
  constructor(scene, n = 20) {
    this.n = n; this.c = new Float32Array(n * 3); this.w = new Float32Array(n * 3); this.acc = 0; this.live = false;
    this.pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry(), idx = []; g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    for (let k = 0; k < n - 1; k++) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  // (x, y, z) is the tip now, (wx, wy, wz) the direction the ribbon is wide in, amt 0..1 how strong it is this frame.
  set(x, y, z, wx, wy, wz, amt, dt) {
    const c = this.c, w = this.w, n = this.n, p = this.pos;
    if (!this.live) { for (let k = 0; k < n; k++) { c[k * 3] = x; c[k * 3 + 1] = y; c[k * 3 + 2] = z; w[k * 3] = w[k * 3 + 1] = w[k * 3 + 2] = 0; } this.live = true; this.acc = 0; }
    this.acc += dt; if (this.acc > 0.03) { this.acc = 0; c.copyWithin(3, 0, (n - 1) * 3); w.copyWithin(3, 0, (n - 1) * 3); }
    c[0] = x; c[1] = y; c[2] = z; w[0] = wx * amt * 0.34; w[1] = wy * amt * 0.34; w[2] = wz * amt * 0.34;
    for (let k = 0; k < n; k++) {
      const t = 1 - k / (n - 1), a = k * 3, b = k * 6;
      p[b] = c[a] - w[a] * t; p[b + 1] = c[a + 1] - w[a + 1] * t; p[b + 2] = c[a + 2] - w[a + 2] * t;
      p[b + 3] = c[a] + w[a] * t; p[b + 4] = c[a + 1] + w[a + 1] * t; p[b + 5] = c[a + 2] + w[a + 2] * t;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.visible = true;
  }
  reset() { this.live = false; this.mesh.visible = false; }
}

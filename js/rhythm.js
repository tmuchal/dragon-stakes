// Sound for Dragon Stakes. Everything is synthesized in code: an open-sky tune in free flight, full drums during a fight,
// and the one-shot sounds of the game. There are no audio files.
export const BPM = 124;
export const SPB = 60 / BPM;          // seconds per beat

const hz = m => 440 * Math.pow(2, (m - 69) / 12);      // MIDI note number to frequency
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// A repeatable number from 0 to 1 for any whole number, so the tune varies but is the same every time it is rendered.
const dice = n => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// Free flight: two sixteen-bar forms in C major, played in turn, so the harmony keeps moving for a full minute
// before it comes round. Each bar is [bass note, pad notes].
const CALM = [
  [41, [57, 60, 64, 67]], [41, [60, 64, 67, 69]],   // F major 9
  [36, [55, 59, 62, 64]], [36, [59, 62, 64, 67]],   // C major 9
  [33, [55, 59, 60, 64]], [33, [57, 60, 64, 67]],   // A minor 9
  [43, [55, 60, 62, 67]], [43, [55, 59, 62, 67]],   // G suspended, then G
  [38, [53, 57, 60, 64]], [38, [57, 60, 62, 65]],   // D minor 9
  [33, [52, 55, 60, 64]], [33, [55, 57, 60, 64]],   // A minor 7
  [41, [53, 57, 60, 64]], [43, [55, 59, 62, 64]],   // F major 7, G6
  [36, [52, 55, 60, 62]], [36, [53, 55, 60, 62]],   // C add 9, then a suspended C
  // the second form starts from the minor side and climbs
  [33, [60, 64, 67, 71]], [33, [59, 60, 64, 69]],   // A minor 9, voiced higher
  [41, [60, 64, 65, 69]], [41, [57, 60, 64, 65]],   // F major 7
  [40, [55, 60, 64, 67]], [40, [60, 62, 67, 72]],   // C over E
  [43, [59, 62, 67, 69]], [43, [60, 62, 67, 69]],   // G, then G suspended
  [38, [60, 65, 69, 72]], [38, [57, 60, 65, 69]],   // D minor 7
  [40, [55, 59, 62, 67]], [40, [59, 62, 64, 67]],   // E minor 7
  [41, [57, 64, 67, 72]], [43, [59, 62, 67, 71]],   // F major 9, G
  [45, [60, 64, 69, 72]], [43, [57, 62, 64, 67]],   // A minor, then G6 leaning back into F
];
const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];   // the lead sings on C major pentatonic
// Lead rhythms over two bars, as [start, length] in eighth notes. The first two carry the two fixed themes.
const SHAPES = [
  [[0, 3], [3, 1], [4, 4], [10, 2], [12, 4]],
  [[0, 2], [2, 2], [4, 3], [7, 1], [8, 6]],
  [[2, 2], [4, 2], [6, 2], [8, 4], [14, 2]],
  [[0, 6], [8, 2], [10, 2], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [6, 2], [8, 3], [11, 1], [12, 4]],
  [[1, 1], [2, 1], [3, 1], [4, 4], [9, 1], [10, 2], [12, 3]],
];
const SPARSE = [[4, 4], [12, 4]];
const THEMES = { 0: [76, 79, 81, 79, 76], 4: [81, 79, 76, 74, 72] };
// The fight: A minor, one chord a bar as [bass note, stab notes]. Round two swaps in a major E that pulls harder.
const FIGHT1 = [[33, [57, 60, 64]], [33, [57, 60, 64]], [41, [57, 60, 65]], [43, [55, 59, 62]]];
const FIGHT2 = [[33, [57, 60, 64]], [36, [55, 60, 64]], [41, [57, 60, 65]], [40, [56, 59, 64]]];
const SEND = 0.45;      // how much of the airy instruments goes to the reverb
const MUSIC = 0.62;     // the whole backing track sits under the game sounds
const CALM_LEVEL = 0.8; // free flight is quieter again than the fight
const LEVEL = 0.9;      // master level when not muted

// ---------- audio ----------
export class Band {
  /** `ctx` is optional: pass an OfflineAudioContext to render the sound to a buffer instead of the speakers. */
  constructor(ctx = null) {
    this.given = ctx; this.ctx = null; this.master = null; this.bus = null; this.timer = 0; this.muted = false;
    this.hot = false; this.t0 = null; this.seq = null; this.stamp = null; this.wind = null; this.windAt = -1;
    this.cue = { groups: 0, last: null, downbeat: null };
    this.stats = { made: 0, live: 0 };      // sound sources created, and how many are still playing
  }
  ensure() {
    if (!this.ctx) {
      const c = this.ctx = this.given || new (window.AudioContext || window.webkitAudioContext)();
      this.offline = typeof OfflineAudioContext !== "undefined" && c instanceof OfflineAudioContext;
      const gain = v => { const g = c.createGain(); g.gain.value = v; return g; };
      this.master = gain(this.muted ? 0 : LEVEL);
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      // after the compressor a soft ceiling: straight up to 0.75, then it bends and never passes 0.93, so nothing clips
      const lim = c.createWaveShaper(), curve = new Float32Array(2049), knee = 0.75, top = 0.97;
      for (let i = 0; i < curve.length; i++) { const x = i / 1024 - 1, a = Math.abs(x); curve[i] = a <= knee ? x : Math.sign(x) * (knee + (top - knee) * Math.tanh((a - knee) / (top - knee))); }
      lim.curve = curve;
      this.master.connect(comp).connect(lim).connect(c.destination);
      this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // a small hall made from decaying noise, for the pad, the lead and the bells
      const hall = c.createConvolver(), len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); let lp = 0; for (let i = 600; i < len; i++) { const k = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.65 - 0.5 * k); x[i] = lp * Math.pow(1 - k, 2.4); } }
      hall.buffer = ir;
      const hallOut = gain(0.7); hall.connect(hallOut).connect(this.master);
      // music goes through `duck` so a tap can push it down for a moment; game sounds go straight to the master
      const b = this.bus = { music: gain(MUSIC), duck: gain(1), calm: gain(CALM_LEVEL), air: gain(1), fight: gain(1), send: gain(SEND), fx: gain(1), wet: gain(1), fxSend: gain(0.35) };
      b.music.connect(b.duck).connect(this.master);
      b.calm.connect(b.music); b.fight.connect(b.music);
      b.air.connect(b.calm); b.air.connect(b.send).connect(hall);
      b.fx.connect(this.master); b.wet.connect(b.fx); b.wet.connect(b.fxSend).connect(hall);
      const lowpass = (f, q, out) => { const n = c.createBiquadFilter(); n.type = "lowpass"; n.frequency.value = f; n.Q.value = q; n.connect(out); return n; };
      this.bassLP = lowpass(620, 2.5, b.fight); this.stabLP = lowpass(2400, 0.8, b.fight);
    }
    if (this.ctx.state === "suspended" && !this.offline) this.ctx.resume();
    return this.ctx;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : LEVEL; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  /** false in free flight, true during a fight. The music changes over on the next beat; the beat grid never moves. */
  get intense() { return this.hot; }
  set intense(v) { v = !!v; if (v && !this.hot) this.cue = { groups: 0, last: null, downbeat: null }; this.hot = v; }

  // One-shot sounds start at `now`. `at(t, fn)` runs fn with them starting at audio time t instead
  // (used to render offline, and free to use for scheduling a sound exactly on a beat).
  get T() { return this.stamp ?? this.now; }
  at(t, fn) { const was = this.stamp; this.stamp = t; try { return fn(); } finally { this.stamp = was; } }

  // Every source is counted, and when it ends it is unplugged together with the chain behind it.
  track(src, tail = null) {
    const s = this.stats; s.made++; s.live++;
    src.onended = () => { s.live--; src.disconnect(); if (tail) tail.disconnect(); };
  }
  /** Oscillators through one envelope. parts: [type, freq, level = 1, glideTo = 0, glideSeconds = dur].
      The level rises in `a` seconds, stays for `hold`, then falls away to silence at t + dur. */
  voice(t, dur, vol, parts, out = this.bus?.fx, a = 0.004, hold = 0) {
    const c = this.ctx; if (!c) return;
    const g = c.createGain(), end = t + dur + 0.03; vol = Math.max(vol, 0.0002);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (hold) g.gain.setValueAtTime(vol, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    parts.forEach(([type, f, level = 1, to = 0, over = dur], k) => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + over);
      if (level === 1) o.connect(g); else { const lg = c.createGain(); lg.gain.value = level; o.connect(lg).connect(g); }
      o.start(t); o.stop(end); this.track(o, k ? null : g);
    });
    g.connect(out);
  }
  osc(freq, t, dur, type = "sine", vol = 0.2, glideTo = 0) { this.voice(t, dur, vol, [[type, freq, 1, glideTo]], this.bus?.fx, 0.005); }
  /** Filtered noise. `to` sweeps the filter to that frequency over the length of the sound. */
  hiss(t, dur, vol = 0.1, freq = 8000, q = 0.7, type = "highpass", out = this.bus?.fx, to = 0, a = 0.002) {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); vol = Math.max(vol, 0.0002);
    s.buffer = this.noise; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 2.5); s.stop(t + dur + 0.03); this.track(s, g);
  }
  // A tap sound pushes the music down for a moment so it cuts through.
  duck(t, depth = 0.55, hold = 0.07) {
    const g = this.bus.duck.gain; g.cancelScheduledValues(t); g.setTargetAtTime(depth, t, 0.004); g.setTargetAtTime(1, t + hold, 0.07);
  }

  // ---------- instruments: free flight ----------
  pad(t, notes, dur, bright = 1500) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(), end = t + dur + 1.1;
    f.type = "lowpass"; f.Q.value = 0.7; f.frequency.setValueAtTime(420, t); f.frequency.linearRampToValueAtTime(bright, t + dur * 0.55); f.frequency.linearRampToValueAtTime(500, end);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.03, t + 0.6); g.gain.setValueAtTime(0.03, t + dur); g.gain.linearRampToValueAtTime(0.0001, end);
    notes.forEach((m, k) => {
      const o = c.createOscillator(); o.type = k % 2 ? "triangle" : "sawtooth"; o.frequency.value = hz(m); o.detune.value = k % 2 ? 6 : -6;
      o.connect(f); o.start(t); o.stop(end + 0.02); this.track(o, k ? null : g);
    });
    f.connect(g).connect(this.bus.air);
  }
  softBass(t, f, dur) { this.voice(t, dur, 0.14, [["sine", f], ["triangle", f * 2, 0.22]], this.bus.calm, 0.02, dur * 0.4); }
  softKick(t) { this.voice(t, 0.22, 0.3, [["sine", 108, 1, 48, 0.09]], this.bus.calm, 0.004); }
  shaker(t, v = 1) { this.hiss(t, 0.055, 0.03 * v, 7000, 0.8, "highpass", this.bus.air, 0, 0.008); }
  rim(t) { this.voice(t, 0.04, 0.05, [["triangle", 1700], ["sine", 820]], this.bus.air, 0.001); }
  pluck(t, f, v = 1) { this.voice(t, 0.34, 0.034 * v, [["triangle", f], ["sine", f * 2, 0.3]], this.bus.air, 0.004); }
  lead(t, f, dur, vol = 0.085) { this.voice(t, dur + 0.22, vol, [["sine", f], ["triangle", f * 1.003, 0.4], ["sine", f * 2, 0.15]], this.bus.air, 0.03, dur * 0.55); }

  // ---------- instruments: the fight ----------
  kick(t, v = 1) { this.voice(t, 0.3, 0.62 * v, [["sine", 165, 1, 46, 0.1]], this.bus.fight, 0.002); this.voice(t, 0.025, 0.16 * v, [["triangle", 1200, 1, 300]], this.bus.fight, 0.001); }
  clap(t) { this.hiss(t, 0.15, 0.28, 1500, 0.9, "bandpass", this.bus.fight); this.hiss(t + 0.011, 0.11, 0.18, 2300, 0.9, "bandpass", this.bus.fight); }
  snare(t, v = 0.2) { this.hiss(t, 0.1, v, 2600, 0.7, "bandpass", this.bus.fight); this.voice(t, 0.08, v * 0.6, [["triangle", 210, 1, 150]], this.bus.fight, 0.002); }
  hat(t, open = false, v = 0.06) { this.hiss(t, open ? 0.2 : 0.04, v, 9000, 0.7, "highpass", this.bus.fight); }
  bass(t, f, dur) { this.voice(t, dur, 0.15, [["sawtooth", f], ["sine", f, 0.9]], this.bassLP, 0.004, dur * 0.4); }
  stab(t, notes, v = 1) { this.voice(t, 0.2, 0.04 * v, notes.map(m => ["sawtooth", hz(m)]), this.stabLP, 0.004); }
  arp(t, f, v = 1) { this.voice(t, 0.1, 0.028 * v, [["square", f]], this.stabLP, 0.003); }
  crash(t, v = 1) { this.hiss(t, 1.3, 0.1 * v, 6000, 0.5, "highpass", this.bus.fight, 0, 0.004); this.hiss(t, 0.5, 0.07 * v, 3500, 0.8, "bandpass", this.bus.fight); }
  boom(t, v = 1) { this.voice(t, 0.7, 0.45 * v, [["sine", 90, 1, 32, 0.5]], this.bus.fight, 0.004); }
  // Rising air into the first beat of a call or an echo.
  riser(t, end) {
    const c = this.ctx; if (!(end > t + 0.1)) return;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(5500, end);
    g.gain.setValueAtTime(0.003, t); g.gain.exponentialRampToValueAtTime(0.09, end); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.04);
    s.connect(f).connect(g).connect(this.bus.fight); s.start(t, Math.random() * 2.5); s.stop(end + 0.06); this.track(s, g);
  }

  // ---------- game sounds ----------
  // The rhythm laid out before the echo: a dry wooden knock, one per call tap.
  hoof(t, v = 1) {
    if (!this.ctx) return; this.duck(t, 0.6);
    this.voice(t, 0.075, 0.3 * v, [["sine", 930, 1, 760], ["triangle", 1395, 0.4, 1150]], this.bus.fx, 0.001); this.hiss(t, 0.018, 0.07 * v, 2600, 2, "bandpass");
  }
  tap() { const t = this.T; this.voice(t, 0.04, 0.08, [["triangle", 900]], this.bus?.fx, 0.003); }
  hit(q) { const t = this.T; if (q === "perfect") { this.osc(1320, t, 0.09, "triangle", 0.16); this.osc(1980, t, 0.07, "sine", 0.06); } else this.osc(990, t, 0.07, "triangle", 0.12); }
  // A stray echo tap: a dull low buzz.
  miss() {
    if (!this.ctx) return; const t = this.T;
    this.duck(t, 0.6);
    this.voice(t, 0.2, 0.34, [["sawtooth", 150, 1, 72], ["square", 76, 0.5, 60]], this.bus.fx, 0.004); this.hiss(t, 0.09, 0.3, 320, 1, "lowpass");
  }
  // A call tap lands: a bolt of fire. A crack of noise falling in pitch over a low thump.
  strike(q) {
    if (!this.ctx) return; const t = this.T; this.duck(t, 0.4);
    this.hiss(t, 0.12, 0.5, 5200, 1.1, "bandpass", this.bus.fx, 900);
    this.voice(t, 0.14, 0.45, [["sine", 210, 1, 62, 0.08]], this.bus.fx, 0.002);
    this.voice(t, 0.07, 0.16, [["sawtooth", 1500, 1, 320]], this.bus.fx, 0.002);
    if (q === "perfect") { this.voice(t, 0.16, 0.1, [["sine", 2640]]); this.crowd(1.2, 0.18); }
  }
  // An echo tap matches: the block. Bright and metallic.
  steal() {
    if (!this.ctx) return; const t = this.T; this.duck(t);
    this.voice(t, 0.13, 0.3, [["square", 1480, 0.5], ["triangle", 2230], ["sine", 3340, 0.6]], this.bus.fx, 0.001); this.hiss(t, 0.03, 0.26, 7500);
  }
  crowd(dur = 2.5, vol = 0.3) { const t = this.T; this.hiss(t, dur, vol, 900, 0.4, "bandpass", this.bus?.fx, 0, 0.06); this.hiss(t + 0.1, dur * 0.8, vol * 0.6, 1800, 0.5, "bandpass", this.bus?.fx, 0, 0.06); }
  // Won coins: a run up the chord, a spill of coins, a low thump under it.
  goal() {
    if (!this.ctx) return; const t = this.T, w = this.bus.wet;
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => this.voice(t + i * 0.07, 0.5, 0.09, [["triangle", f], ["sine", f * 2, 0.4]], w, 0.003));
    [1, 1.26, 1.5, 1.26, 2, 1.5, 2].forEach((m, i) => this.voice(t + 0.5 + i * 0.085, 0.18, 0.06, [["sine", 2093 * m]], w, 0.002));
    this.voice(t, 0.5, 0.3, [["sine", 131, 1, 65, 0.3]]); this.crowd(2.4, 0.2);
  }
  // Lost coins: a low thud and a falling note.
  conceded() {
    if (!this.ctx) return; const t = this.T;
    this.voice(t, 0.55, 0.55, [["sine", 120, 1, 36, 0.3]]); this.hiss(t, 0.28, 0.3, 220, 0.8, "lowpass");
    this.voice(t + 0.05, 0.6, 0.07, [["triangle", 311, 1, 233, 0.5]]);
  }
  whistle() { const t = this.T; this.osc(2600, t, 0.5, "sine", 0.12); this.osc(2620, t + 0.02, 0.5, "sine", 0.06); }
  bell() { const t = this.T; this.voice(t, 1.6, 0.13, [["sine", 1318.5], ["sine", 1976, 0.35], ["sine", 3320, 0.12]], this.bus?.wet, 0.003); }
  /** n = 1 for each of 3, 2, 1. n = 0 for the high "go". */
  count(n) {
    if (!this.ctx) return; const t = this.T; this.duck(t, 0.6, 0.08);
    if (n) this.voice(t, 0.11, 0.32, [["sine", 880], ["square", 880, 0.45]], this.bus.fx, 0.002);
    else this.voice(t, 0.28, 0.28, [["sine", 1760], ["square", 1760, 0.4], ["sine", 2637, 0.4]], this.bus.fx, 0.002, 0.06);
    this.heard(n, t);
  }
  // The 3-2-1 tells the music where the next call or echo begins: three beats after the first click.
  // The drums thin out, a riser climbs into that beat, and each new 3-2-1 lifts the fight one step.
  heard(n, t) {
    if (!this.hot || this.t0 == null) return;
    const c = this.cue, lag = clamp(this.ctx.outputLatency || 0, 0, 0.4), k = Math.round((t - this.t0 - lag) / SPB);
    if (n) {
      if (c.last == null || k - c.last > 1) {
        c.groups++; c.downbeat = k + 3; this.riser(t, this.t0 + (k + 3) * SPB);
        this.bassLP.frequency.setTargetAtTime(c.groups >= 3 ? 1150 : 620, t, 0.3);      // round two: the bass opens up
      }
      c.last = k;
    }
    else { c.downbeat = k; c.last = null; if (!c.groups) c.groups = 1; }
  }

  // A leathery wing beat: a push of air, then the slap of the skin.
  flapSound() {
    if (!this.ctx) return; const t = this.T;
    this.hiss(t, 0.24, 0.26, 900, 1.2, "bandpass", this.bus.fx, 200, 0.05); this.hiss(t + 0.06, 0.1, 0.2, 260, 0.9, "lowpass", this.bus.fx, 0, 0.004);
    this.voice(t + 0.05, 0.16, 0.13, [["sine", 72, 1, 44]], this.bus.fx, 0.01);
  }
  // A gold ring: two bright notes, the second one rings.
  coin() {
    if (!this.ctx) return; const t = this.T, w = this.bus.wet;
    this.voice(t, 0.08, 0.2, [["triangle", 1976], ["sine", 3952, 0.3]], w, 0.002);
    this.voice(t + 0.065, 0.42, 0.2, [["triangle", 2637], ["sine", 5274, 0.3]], w, 0.002);
  }
  // A dragon roar: two rough low voices that rise and fall through a moving throat, with a growl shaking the level.
  horn() {
    const c = this.ctx; if (!c) return; const t = this.T, dur = 1.2, end = t + dur + 0.05;
    const am = c.createGain(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    f.type = "bandpass"; f.Q.value = 1.1; f.frequency.setValueAtTime(280, t); f.frequency.exponentialRampToValueAtTime(1000, t + 0.3); f.frequency.exponentialRampToValueAtTime(240, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.07); g.gain.setValueAtTime(0.4, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    am.gain.value = 0.7; depth.gain.value = 0.3; lfo.frequency.setValueAtTime(34, t); lfo.frequency.linearRampToValueAtTime(19, t + dur); lfo.connect(depth).connect(am.gain);
    lfo.start(t); lfo.stop(end); this.track(lfo, g);
    for (const [base, level] of [[78, 1], [117, 0.5]]) {
      const o = c.createOscillator(), og = c.createGain(); o.type = "sawtooth"; og.gain.value = level;
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.6, t + 0.3); o.frequency.exponentialRampToValueAtTime(base * 0.8, t + dur);
      o.connect(og).connect(am); o.start(t); o.stop(end); this.track(o);
    }
    const s = c.createBufferSource(), sg = c.createGain(); s.buffer = this.noise; s.loop = true; sg.gain.value = 0.6;
    s.connect(sg).connect(am); s.start(t, Math.random() * 2.5); s.stop(end); this.track(s);
    am.connect(f).connect(g).connect(this.bus.fx);
  }

  // ---------- optional hooks ----------
  /** Wind that follows flight speed (about 14 to 60): louder and brighter the faster you fly. Silent until first called.
      Call it every frame or so while flying; pass 0 to let it die away. */
  setWind(speed) {
    const c = this.ctx; if (!c) return;
    if (!this.wind) {
      if (!(speed > 0)) return;
      const s = c.createBufferSource(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), sway = c.createGain();
      s.buffer = this.noise; s.loop = true; hp.type = "highpass"; hp.frequency.value = 140; lp.type = "lowpass"; lp.Q.value = 1.4; lp.frequency.value = 500; g.gain.value = 0;
      lfo.frequency.value = 0.13; sway.gain.value = 350; lfo.connect(sway).connect(lp.detune);   // slow gusts: the tone drifts up and down a few semitones
      s.connect(hp).connect(lp).connect(g).connect(this.master); s.start(); lfo.start();
      this.wind = { g, lp, speed: -99 };
    }
    const w = this.wind, t = this.T;
    if (Math.abs(speed - w.speed) < 0.4 && t - this.windAt < 0.25) return;      // called every frame: only move the dials when it matters
    w.speed = speed; this.windAt = t;
    const x = clamp((speed - 14) / 46, 0, 1), on = speed > 0 ? 1 : 0;
    w.g.gain.setTargetAtTime(on * (0.07 + 0.15 * x * x) * (this.hot ? 0.5 : 1), t, 0.25);
    w.lp.frequency.setTargetAtTime(500 + 2400 * x, t, 0.25);
  }
  /** A fire-breath whoosh, `dur` seconds long. */
  fire(dur = 0.7) {
    if (!this.ctx) return; const t = this.T;
    this.hiss(t, dur, 0.28, 350, 0.7, "bandpass", this.bus.fx, 2600, 0.08); this.hiss(t, dur * 0.8, 0.12, 3000, 0.6, "highpass", this.bus.fx, 0, 0.06);
    this.voice(t, dur, 0.16, [["triangle", 58, 1, 44], ["sawtooth", 61, 0.4, 47]], this.bus.fx, 0.05, dur * 0.3);
  }
  /** A shield shimmer: high notes in pairs a hair apart, so they beat against each other. */
  shield() {
    if (!this.ctx) return; const t = this.T, w = this.bus.wet;
    [1568, 2093, 2637, 3136, 3951].forEach((f, i) => this.voice(t + i * 0.045, 0.9 - i * 0.08, 0.05, [["sine", f], ["sine", f * 1.004]], w, 0.02));
    this.hiss(t, 0.5, 0.04, 9000, 0.7, "highpass", w, 0, 0.1);
  }

  // ---------- the backing track ----------
  // The lead for two bars: a fixed theme at the top of each half of the form, a breath before it comes back,
  // and in between a walk along the scale that starts and ends on a note of the chord.
  phrase(p) {
    const kind = p % 8, notes = {}, s = this.seq; let n = 0; const r = () => dice(p * 97 + n++);
    const low = Math.floor(p / 16) % 2 ? 12 : 0;                     // every other time round, the themes come back an octave lower
    const fixed = THEMES[kind]; let shape = fixed ? SHAPES[kind ? 1 : 0] : SHAPES[Math.floor(r() * SHAPES.length)];
    if (kind === 3 || kind === 7) { if (r() < 0.4) return { p, notes }; shape = SPARSE; }
    let i = s.voice;
    shape.forEach(([at, len], k) => {
      if (fixed) i = PENTA.indexOf(fixed[k] - low);
      else {
        i = clamp(i + [-2, -1, -1, 1, 1, 2, 0][Math.floor(r() * 7)], 3, 9);
        if (k === 0 || k === shape.length - 1) {
          const set = CALM[(p * 2 + (at >= 8 ? 1 : 0)) % CALM.length][1].map(m => m % 12);
          for (const d of [0, 1, -1, 2, -2]) if (i + d >= 3 && i + d <= 9 && set.includes(PENTA[i + d] % 12)) { i += d; break; }
        }
      }
      notes[at * 2] = [PENTA[i], len];
    });
    s.voice = i;
    return { p, notes };
  }
  calmStep(n, t, sound) {
    const s = this.seq, ls = n - s.anchor, bar = s.base + Math.floor(ls / 16), i = ls % 16;
    if (!sound) return;
    const k = bar % 16, form = Math.floor(bar / 16), [root, chord] = CALM[bar % CALM.length];
    const beats = form % 2 ? [0, 6, 12] : [0, 10];                  // the second form leans forward a little: three pushes a bar instead of two
    const round = Math.floor(bar / CALM.length);                    // how many times the two forms have gone by
    if (i === 0) this.pad(t, round % 2 ? chord.map((m, j) => j === 3 ? m - 12 : m) : chord, SPB * 4, 1100 + 900 * dice(bar + 31));
    if (i === 0) this.softBass(t, hz(root), SPB * 1.8);
    else if (beats.includes(i)) this.softBass(t, hz(root + (bar % 2 && i >= 10 ? 7 : 0)), SPB * 0.9);
    if (i === 14 && bar % 2 && !(form % 2)) this.softBass(t, hz(root + 7), SPB * 0.45);
    // soft percussion: it waits four bars at the very start and drops out for the last two bars of every other form
    if (bar >= 4 && !(form % 2 && k >= 14)) {
      if (beats.includes(i)) this.softKick(t);
      if (i % 4 === 2) this.shaker(t); else if (i % 4 === 0 && bar >= 8) this.shaker(t, 0.45);
      if (i === 15 && dice(bar) < 0.4) this.shaker(t, 0.6);
      if (i === 12 && bar % 2) this.rim(t);
    }
    // plucked chord notes come and go: the second half of one form, then most of the next
    const plucked = form % 2 ? (k < 4 || k >= 8) : k >= 8;
    if (plucked && i % 2 === 0 && dice(bar * 16 + i + 7) > 0.3) this.pluck(t, hz(chord[[0, 1, 2, 3, 2, 1, 3, 0][(i / 2 + bar + round * 3) % 8]] + 12), i % 4 ? 0.8 : 1);
    const p = Math.floor(bar / 2);
    if (!s.phrase || s.phrase.p !== p) s.phrase = this.phrase(p);
    const note = s.phrase.notes[(bar % 2) * 16 + i];
    if (note) this.lead(t, hz(note[0]), note[1] * SPB / 2);
  }
  fightStep(n, t, sound) {
    if (!sound) return;
    const s = this.seq, c = this.cue, beat = Math.floor(n / 4), sub = n % 4;
    const rel = beat - (c.downbeat ?? s.anchor / 4);                 // beats since the last "go" (negative during a 3-2-1)
    const thin = c.groups ? rel < 0 : rel < 8;                       // during a 3-2-1 the band steps back
    const pos = ((rel % 4) + 4) % 4, bar = ((Math.floor(rel / 4) % 4) + 4) % 4, i = pos * 4 + sub;
    const level = clamp(c.groups, 1, 4), hi = level >= 3;            // 1, 2: round one call and echo. 3, 4: round two
    const [root, chord] = (hi ? FIGHT2 : FIGHT1)[bar];
    if (sub === 0) this.kick(t);                                     // the pulse: a kick on every beat, always
    if (c.downbeat != null && rel === 0 && sub === 0) this.crash(t);
    if (thin) {
      if (rel === -1) this.snare(t, 0.1 + 0.05 * sub);               // a roll into the first beat
      else if (rel === -2 && sub === 2) this.snare(t, 0.1);
    } else {
      if (sub === 0 && (pos === 1 || pos === 3)) this.clap(t);
      if (i === 0) this.stab(t, chord, 1);
      if (i === 6 && level >= 2) this.stab(t, chord, 0.8);
      if (i === 11 && hi) this.stab(t, chord.map(m => m + 12), 0.7);
      if (hi) this.arp(t, hz(chord[i % 3] + 12 + (i % 8 >= 4 ? 12 : 0)), level === 4 ? 1.2 : 0.9);
    }
    if (sub === 2) this.hat(t, !thin && level >= 2 && pos === 3, 0.06);
    else if (hi && sub % 2) this.hat(t, false, 0.028);
    if (sub % 2 === 0) this.bass(t, hz(root + (sub === 2 ? 12 : 0)), SPB * 0.42);
    else if (hi && !thin && pos === 3 && sub === 3) this.bass(t, hz(root + 12), SPB * 0.2);
  }
  // Change between the two moods, always on a beat.
  turn(n, t, sound) {
    const s = this.seq, b = this.bus, at = Math.max(t, this.now);
    b.calm.gain.cancelScheduledValues(at); b.send.gain.cancelScheduledValues(at);
    if (this.hot) {
      s.base += Math.ceil((n - s.anchor) / 16); s.base += s.base % 2;           // the tune will pick up at the next two-bar phrase
      s.mode = "fight"; s.anchor = n;
      b.calm.gain.setTargetAtTime(0, at, 0.1); b.send.gain.setTargetAtTime(0, at, 0.1);
      this.bassLP.frequency.cancelScheduledValues(at); this.bassLP.frequency.setTargetAtTime(620, at, 0.05);
      if (sound) { this.boom(t); this.crash(t, 0.8); }
    } else {
      s.mode = "calm"; s.anchor = n;
      b.calm.gain.setTargetAtTime(CALM_LEVEL, at, 0.25); b.send.gain.setTargetAtTime(SEND, at, 0.25);
      if (sound) { this.crash(t, 0.6); this.hiss(t, SPB * 2, 0.06, 5000, 1, "bandpass", b.fight, 300, 0.01); }   // the air lets go
    }
  }
  step(n, t, sound = true) {
    const s = this.seq;
    if (n % 4 === 0 && this.hot !== (s.mode === "fight")) this.turn(n, t, sound);
    if (s.mode === "fight") this.fightStep(n, t, sound); else this.calmStep(n, t, sound);
  }
  begin(t0) {
    this.t0 = t0; this.seq = { mode: "calm", anchor: 0, base: 0, voice: 7, phrase: null };
    this.cue = { groups: 0, last: null, downbeat: null };
    const t = this.now, b = this.bus;
    for (const [g, v] of [[b.music, MUSIC], [b.calm, CALM_LEVEL], [b.send, SEND]]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, 0.03); }
  }
  /** The backing track from t0 (audio time of beat 0). It never ends; `intense` switches the mix. */
  play(t0) {
    this.halt(); this.ensure(); this.begin(t0);
    let step = Math.max(0, Math.floor((this.now - t0) / SPB * 4));   // 16th notes
    const tick = () => {
      while (true) {
        const t = t0 + step / 4 * SPB;
        if (t > this.now + 0.15) break;
        this.step(step, t, t >= this.now - 0.02);
        step++;
      }
      this.timer = setTimeout(tick, 25);
    };
    tick();
  }
  /** For rendering offline: lay down the beats from `fromBeat` up to `toBeat` of a track whose beat 0 is at t0, all at once. */
  schedule(t0, fromBeat, toBeat) {
    this.ensure(); if (this.t0 !== t0 || !this.seq) this.begin(t0);
    for (let n = Math.round(fromBeat * 4); n < Math.round(toBeat * 4); n++) this.step(n, t0 + n / 4 * SPB, true);
  }
  halt() { clearTimeout(this.timer); this.timer = 0; }
  stop() {
    this.halt(); if (!this.ctx) return;
    const t = this.now, b = this.bus;      // notes already laid down fade instead of hanging on, and the wind dies away
    b.music.gain.setTargetAtTime(0, t, 0.12); b.send.gain.cancelScheduledValues(t); b.send.gain.setTargetAtTime(0, t, 0.12);
    if (this.wind) { this.wind.g.gain.setTargetAtTime(0, t, 0.2); this.wind.speed = -99; }
  }
}

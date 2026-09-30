// A shared sky: up to eight browsers in a star. One of them hosts and gets a six-letter code; the others connect to it.
// PeerJS's free public broker only introduces the peers; game messages then go straight between the host and each guest,
// and the host passes on whatever one guest needs to hear from another.
const PREFIX = "dgsky-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";                // no 0/O or 1/I to misread
const QUIET_MS = 9000;                                              // a link that says nothing for this long is gone
export const MAX_PEOPLE = 8, HOST = "host";
export const netReady = () => typeof window.Peer === "function";    // false when the PeerJS script could not load

export class Net {
  // onMessage(pid, m) · onJoin(pid) and onLeave(pid) on the host · onStatus("connected" | "closed" | "error", info)
  constructor({ onMessage, onStatus, onJoin, onLeave }) {
    this.onMessage = onMessage; this.onStatus = onStatus; this.onJoin = onJoin; this.onLeave = onLeave;
    this.peer = null; this.links = new Map(); this.role = null; this.code = null; this.timer = 0; this.up = false;
  }
  get id() { return this.peer?.id || null; }
  get connected() { return this.role === "host" ? this.up : !!this.links.get(HOST)?.c.open; }

  host() {
    this.close(); this.role = "host";
    this.code = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHABET[b % ALPHABET.length]).join("");
    return new Promise((resolve, reject) => {
      const peer = this.peer = new window.Peer(PREFIX + this.code);
      peer.on("open", () => { this.up = true; this.beat(); resolve(this.code); });
      peer.on("connection", c => this.attach(peer, c, c.peer));
      peer.on("disconnected", () => { if (this.peer === peer) setTimeout(() => { try { if (this.peer === peer && !peer.destroyed) peer.reconnect(); } catch { /* the broker is away; people already in the sky stay connected */ } }, 1500); });
      peer.on("error", e => { if (this.peer !== peer || this.up) return; reject(e); this.onStatus("error", e.type || e.message); });
    });
  }

  join(code) {
    this.close(); this.role = "guest"; this.code = String(code).trim().toUpperCase();
    return new Promise((resolve, reject) => {
      const peer = this.peer = new window.Peer();
      const fail = (e, info) => { if (this.peer !== peer || this.up) return; reject(e); this.onStatus("error", info); };
      const late = setTimeout(() => fail(new Error("timeout"), "timeout"), 20000);
      peer.on("open", () => this.attach(peer, peer.connect(PREFIX + this.code, { reliable: true, serialization: "json" }), HOST, () => { clearTimeout(late); this.up = true; resolve(); }));
      peer.on("error", e => { clearTimeout(late); fail(e, e.type === "peer-unavailable" ? "no-room" : e.type || e.message); });
    });
  }

  attach(peer, c, pid, ready) {
    const link = { c, rtt: 80, pongs: [], seen: performance.now() };
    c.on("open", () => {
      if (this.peer !== peer) return;
      if (this.role === "host" && this.links.size >= MAX_PEOPLE - 1) { try { c.send({ type: "full" }); } catch { /* it will time out */ } setTimeout(() => c.close(), 500); return; }
      link.seen = performance.now(); this.links.set(pid, link);
      if (this.role === "host") { this.onJoin(pid); this.measure(link); }
      else { this.beat(); ready?.(); this.onStatus("connected"); }
    });
    c.on("data", m => {
      link.seen = performance.now();
      if (m?.type === "ping") { try { c.send({ type: "pong", t: m.t }); } catch { /* closing */ } return; }
      if (m?.type === "pong") { link.pongs.push(performance.now() - m.t); if (link.pongs.length > 7) link.pongs.shift(); link.rtt = [...link.pongs].sort((a, b) => a - b)[link.pongs.length >> 1]; return; }
      if (m?.type === "bye") { this.drop(pid, link); return; }
      if (this.links.get(pid) === link || m?.type === "full") this.onMessage(pid, m);
    });
    c.on("close", () => this.drop(pid, link));
    c.on("error", () => this.drop(pid, link));
  }
  drop(pid, link) {
    if (this.links.get(pid) !== link) return;
    this.links.delete(pid); try { link.c.close(); } catch { /* already closed */ }
    if (this.role === "host") this.onLeave(pid); else this.onStatus("closed");
  }

  // Round-trip time to a guest, so a fight can start on the same beat on both devices. Five quick pings on joining,
  // then the heartbeat keeps it fresh. The same heartbeat notices a device that went away without saying so.
  async measure(link) {
    for (let i = 0; i < 5; i++) { this.ping(link); await new Promise(r => setTimeout(r, 120)); }
  }
  ping(link) { try { if (link.c.open) link.c.send({ type: "ping", t: performance.now() }); } catch { /* closing */ } }
  beat() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      const now = performance.now();
      for (const [pid, link] of [...this.links]) {
        if (now - link.seen > QUIET_MS) this.drop(pid, link);
        else this.ping(link);                                       // the guest pings too: the answer proves the host is still there
      }
    }, 1500);
  }
  rtt(pid) { return this.links.get(pid)?.rtt ?? 80; }

  send(pid, m) { const l = this.links.get(pid); try { if (l?.c.open) l.c.send(m); } catch { /* closing */ } }
  toHost(m) { this.send(HOST, m); }
  cast(m, except = null) { for (const pid of this.links.keys()) if (pid !== except) this.send(pid, m); }
  // Leaving on purpose: say so first, so nobody has to wait for the silence to be noticed.
  close(last = { type: "bye" }) {
    clearInterval(this.timer); this.timer = 0;
    const links = [...this.links.values()], peer = this.peer;
    this.links.clear(); this.peer = null; this.up = false; this.role = null;   // nothing that closes after this calls back
    for (const l of links) { try { if (l.c.open) l.c.send(last); } catch { /* closing */ } }
    setTimeout(() => { for (const l of links) { try { l.c.close(); } catch { /* closed */ } } try { peer?.destroy(); } catch { /* gone */ } }, links.length ? 250 : 0);
  }
}

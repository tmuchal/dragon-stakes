// Robinhood Chain reads: Friends, their on-chain sprites, and block hashes for fair seeds.

export const RPC = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";
const GENERATIONS = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const REGISTRY = "0x246E3E9730A7Eade94c79be0Fd78d210f89AEb8D";
const FAMILIES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"];

export async function rpc(method, params) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}
const word = n => BigInt(n).toString(16).padStart(64, "0");
const ethCall = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);

export async function loadFriendFromChain(id) {
  const owner = await ethCall(GENERATIONS, "0x6352211e" + word(id)).catch(() => null);
  // the two refusals carry a key, so the game can say them in the player's language
  if (!owner || owner === "0x") throw Object.assign(new Error(`Friend #${id} does not exist.`), { key: "noFriend" });
  const gen = Number(BigInt(await ethCall(GENERATIONS, "0x7d71dc35" + word(id))));
  if (gen < 1) throw Object.assign(new Error(`Friend #${id} is generation 0. The Roost seats hardwired Friends (generation 1 or higher).`), { key: "gen0" });
  const fam = Number(BigInt(await ethCall(REGISTRY, "0x32bd63d1" + word(id))));
  const seed = BigInt(await ethCall(REGISTRY, "0x82829f74" + word(id)));
  const raw = (await ethCall(REGISTRY, "0xead2ca3c" + word(fam) + word(seed))).slice(2);
  const frames = Array.from({ length: 64 }, (_, i) => raw.slice(i * 64, i * 64 + 64).replace(/^0+/, "") || "0");
  return { id, gen, family: FAMILIES[fam], frames, custom: true };
}

export async function getBlock(n) {
  const b = await rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false]);
  return b ? { number: parseInt(b.number, 16), hash: b.hash } : null;
}
export async function latestBlock() { return parseInt(await rpc("eth_blockNumber", []), 16); }
export async function waitForBlock(n, timeoutMs = 12000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    const b = await getBlock(n).catch(() => null);
    if (b) return b;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("block timeout");
}
export async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");

// ---------- Friends ----------
export const friends = new Map();
const spriteCache = new Map();
export function addFriend(f) {
  const bits = f.frames.map(hex => {
    let v = BigInt("0x" + (hex || "0")); const out = new Uint8Array(256);
    for (let i = 0; i < 256; i++) { out[i] = Number(v & 1n); v >>= 1n; }
    return out;
  });
  // A stable 32-bit number per Friend (its dragon's colouring is picked from it).
  let h = 2166136261; for (const x of String(f.id) + f.family) { h ^= x.charCodeAt(0); h = Math.imul(h, 16777619); }
  friends.set(f.id, { ...f, bits, hash: h >>> 0 });
  return friends.get(f.id);
}
// Frames: 0-31 idle (down, up, left, right x 8), 32-63 walk. Colossus only has side views.
export function sprite(f, face = "down", walking = false, i = 0) {
  const faceIdx = { down: 0, up: 1, left: 2, right: 3 }[face];
  const fi = f.family === "Colossus" && faceIdx < 2 ? 3 : faceIdx;
  const idx = (walking ? 32 : 0) + fi * 8 + (i % 8);
  const key = f.id + ":" + idx;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = 16;
  const ctx = c.getContext("2d"), bits = f.bits[idx];
  ctx.fillStyle = "#111";
  for (let k = 0; k < 256; k++) if (bits[k]) ctx.fillRect(k % 16, Math.floor(k / 16), 1, 1);
  spriteCache.set(key, c);
  return c;
}
export function avatar(f, cls = "ava") {
  const c = document.createElement("canvas"); c.width = c.height = 16; c.className = (cls + " px").trim();
  const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.drawImage(sprite(f), 0, 0);
  return c;
}

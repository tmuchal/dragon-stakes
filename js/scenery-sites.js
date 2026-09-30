// Dragon Stakes scenery facts: which island is which place and where the tall landmarks stand.
// Pure functions of the world: no drawing and no imports, so the rules (and a headless check) can call them too.
// scenery.js builds the picture from the same lists, so what the rules think is solid is exactly where it is drawn.

// ---------- which island is which place ----------
// The tallest island is the snow peak and the next is the volcano; the rest take a theme in order around the sea.
export function themesFor(W) {
  const out = ["roost"], tall = W.islands.map((s, i) => i).slice(1).sort((a, b) => W.islands[b].h - W.islands[a].h);
  const rest = ["sakura", "desert", "autumn", "ruins", "jungle", "harbor", "lavender"]; let k = 0;
  for (let i = 1; i < W.islands.length; i++) out[i] = i === tall[0] ? "snow" : i === tall[1] ? "volcano" : rest[k++ % rest.length];
  return out;
}

// ---------- what the rules and the minimap may ask about the scenery (pure: only the world is needed) ----------
export const aside = s => Math.max(27, s.r * 0.46);                       // far enough from the middle to stay clear of the thermal
const spot = (s, ang, dist) => ({ x: s.x + Math.sin(ang) * dist, z: s.z + Math.cos(ang) * dist });
export const shoreOf = (W, s, ang) => { for (let f = 1; f > 0.2; f -= 0.01) if (W.heightAt(s.x + Math.sin(ang) * s.r * f, s.z + Math.cos(ang) * s.r * f) > 0.7) return f * s.r; return s.r * 0.5; };
// Where the tall landmarks stand, one entry per island. The builder and landmarkColliders both read this list,
// so what the rules think is solid is exactly where it is drawn.
export function sites(W, themes = themesFor(W)) {
  return W.islands.map((s, i) => {
    const A = Math.atan2(-s.x, -s.z), th = themes[i];
    if (th === "roost") return { tower: { x: 0, z: 0 }, turrets: [0, 1, 2, 3].map(j => spot(s, Math.PI / 4 + j * Math.PI / 2, 14.5)) };
    if (th === "sakura") return { pagoda: spot(s, A + 0.9, aside(s)) };
    if (th === "desert") return { pyramid: spot(s, A - 0.8, aside(s)), obelisk: spot(s, A + 1.3, aside(s)) };
    if (th === "autumn") return { hall: spot(s, A + 0.5, aside(s) + 20) };
    if (th === "jungle") return { tree: spot(s, A + 0.3, aside(s) + 4) };
    if (th === "harbor") return { light: spot(s, A - 0.55, shoreOf(W, s, A - 0.55) - 3) };
    if (th === "lavender") return { mill: spot(s, A - 0.4, aside(s)) };
    return {};
  });
}
const MAP_COLOR = { roost: "#ffd76a", snow: "#eef4fb", volcano: "#5a3a36", sakura: "#f7a8c4", desert: "#e6c07a", autumn: "#e0782f", ruins: "#b9c9a2", jungle: "#2f8a4a", harbor: "#8fd06f", lavender: "#a98bdc" };
// One colour per island, in the order of world.islands, for the minimap.
export function islandColors(W) { return themesFor(W).map(t => MAP_COLOR[t] || "#7bb863"); }
// The name of each island's place ("volcano", "snow", ...), in the order of world.islands.
export function islandThemes(W) { return themesFor(W); }
// Upright cylinders for everything tall enough to fly into: { x, z, r, top } is solid from the ground up to `top`.
// An entry with `base` is solid only between base and top (the crown of the giant tree: you can fly under it).
export function landmarkColliders(W) {
  const out = [], put = (name, p, r, h, base) => { const y = Math.max(W.heightAt(p.x, p.z), 0), c = { name, x: p.x, z: p.z, r, top: y + h }; if (base !== undefined) c.base = y + base; out.push(c); };
  for (const t of sites(W)) {
    if (t.tower) { put("roost tower", t.tower, 8, 46); t.turrets.forEach(p => put("roost turret", p, 3.4, 22)); }
    if (t.pagoda) put("pagoda", t.pagoda, 4.6, 15.5);
    if (t.pyramid) put("pyramid", t.pyramid, 6, 9);
    if (t.obelisk) put("obelisk", t.obelisk, 1.4, 11);
    if (t.hall) put("village hall", t.hall, 3, 13.5);
    if (t.tree) { put("giant tree trunk", t.tree, 4.6, 30); put("giant tree crown", t.tree, 14, 41, 22); }
    if (t.light) put("lighthouse", t.light, 3, 27);
    if (t.mill) put("windmill", t.mill, 3.6, 15);
  }
  return out;
}

// Load and frame cost: how long until the splash is usable, what the long tasks are, and the frame time in flight.
import { chromium, devices } from "playwright";
const url = process.argv[2] || "http://localhost:8827/";
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
for (const [name, ctxOpt, throttle] of [["desktop", { viewport: { width: 1440, height: 900 } }, 1], ["phone (CPU 4x slower)", { ...devices["iPhone 14"] }, 4]]) {
  const ctx = await b.newContext(ctxOpt), p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await p.addInitScript(() => { window.__long = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] }); });
  const t0 = Date.now(); await p.goto(url + "?test&splash"); 
  await p.waitForFunction(() => window.__sky && document.querySelector("canvas"), null, { timeout: 60000 }); const ready = Date.now() - t0;
  const res = await p.evaluate(() => performance.getEntriesByType("resource").map(r => ({ n: r.name.split("/").pop().split("?")[0], kb: Math.round((r.transferSize || r.encodedBodySize) / 1024), ms: Math.round(r.responseEnd) })));
  const nav = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  console.log(`\n== ${name}: world ready ${ready} ms | DOMContentLoaded ${nav.dcl} ms | files ${res.length}, ${res.reduce((a, r) => a + r.kb, 0)} KB`);
  console.log("   biggest:", res.sort((a, c) => c.kb - a.kb).slice(0, 6).map(r => `${r.n} ${r.kb}KB`).join(", "));
  console.log("   long tasks during load (ms):", (await p.evaluate(() => window.__long)).join(" ") || "none");
  await p.evaluate(() => window.__long.length = 0);
  await p.goto(url + "?test&auto&go&stake=25"); await p.waitForFunction(() => window.__sky && window.__sky().me, null, { timeout: 60000 }); await p.waitForTimeout(3000);
  const f = await p.evaluate(async () => { const ts = []; let last = performance.now(); await new Promise(r => { const step = t => { ts.push(t - last); last = t; ts.length < 300 ? requestAnimationFrame(step) : r(); }; requestAnimationFrame(step); }); ts.sort((a, c) => a - c); return { avg: ts.reduce((a, x) => a + x, 0) / ts.length, p50: ts[150], p95: ts[285], worst: ts[299] }; });
  console.log(`   flight: avg ${f.avg.toFixed(1)} ms/frame (${(1000 / f.avg).toFixed(0)} fps) | median ${f.p50.toFixed(1)} | 95th ${f.p95.toFixed(1)} | worst ${f.worst.toFixed(0)} | long tasks: ${(await p.evaluate(() => window.__long)).join(" ") || "none"}`);
  await ctx.close();
}
await b.close();

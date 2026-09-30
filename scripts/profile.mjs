// CPU profile of 12 seconds of flight: which functions take the time, and what runs inside the long frames.
import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:8827/";
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
await p.goto(url + "?test&auto&go&stake=25"); await p.waitForFunction(() => window.__sky && window.__sky().me, null, { timeout: 60000 }); await p.waitForTimeout(2500);
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 }); await cdp.send("Profiler.start");
await p.waitForTimeout(12000);
const { profile } = await cdp.send("Profiler.stop");
const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n])), dt = profile.timeDeltas, total = dt.reduce((a, x) => a + x, 0);
profile.samples.forEach((id, i) => { const n = byId.get(id), k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop().split("?")[0]}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + dt[i]); });
const rows = [...self].sort((a, c) => c[1] - a[1]).slice(0, 16);
console.log(`profiled ${(total / 1e6).toFixed(1)} s`); for (const [k, v] of rows) console.log(`${(v / total * 100).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(0).padStart(6)} ms  ${k}`);
await b.close();

// Makes og.png (1200x630) from the splash, for link previews.
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto(process.argv[2] || "http://localhost:8827/"); await p.waitForTimeout(9000);
await p.screenshot({ path: "og.png" }); await b.close();

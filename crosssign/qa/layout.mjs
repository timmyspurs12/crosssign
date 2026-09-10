import { chromium } from "playwright";

const BASE = process.env.CROSSSIGN_URL ?? "http://localhost:3000";

async function ensureServer() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
  } catch {
    console.error("✖  Could not reach " + BASE + " — start the app first (npm run dev).");
    process.exit(1);
  }
}

await ensureServer();

const browser = await chromium.launch({ args: ["--no-sandbox"] });

const widths = [1440, 1280, 1024, 768, 390, 375];
const routes = ["/", "/verify", "/explorer", "/badge"];

let failures = 0;

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const route of routes) {
    try {
      await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(800);
    } catch (e) {
      failures++;
      console.log(`LOAD FAIL @ ${width}px ${route}: ${e.message}`);
      continue;
    }
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        bodyScrollW: document.body.scrollWidth,
      };
    });
    const bad =
      overflow.scrollW > overflow.clientW + 1 ||
      overflow.bodyScrollW > overflow.clientW + 1;
    if (bad) {
      failures++;
      console.log(
        `OVERFLOW @ ${width}px ${route}: scrollW=${overflow.scrollW} clientW=${overflow.clientW} body=${overflow.bodyScrollW}`,
      );
    }
  }
  await page.close();
  console.log("✓  checked width " + width + "px");
}

// Key copy assertions on /verify.
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await p.goto(`${BASE}/verify`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1200);
} catch (e) {
  failures++;
  console.log("LOAD FAIL on /verify: " + e.message);
}
const texts = [
  "Verify your wallet",
  "Interactive demo",
  "Connect",
  "Sign",
  "Verify",
  "Badge",
];
for (const t of texts) {
  const found = await p.getByText(t, { exact: false }).first().count();
  if (!found) {
    failures++;
    console.log(`MISSING COPY on /verify: "${t}"`);
  }
}
await p.close();

await browser.close();
if (failures) {
  console.log(`\nLAYOUT QA: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\nLAYOUT QA: ALL PASS");

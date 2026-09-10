import { chromium } from "playwright";

const BASE = process.env.CROSSSIGN_URL ?? "http://localhost:3000";

// Preflight: make sure the app server is actually reachable.
async function ensureServer() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
  } catch {
    console.error("✖  Could not reach " + BASE);
    console.error("");
    console.error("   Is the app running? Start it in ANOTHER terminal first:");
    console.error("     cd crosssign");
    console.error("     npm install");
    console.error("     npm run dev        # then wait for:  Ready on http://localhost:3000");
    process.exit(1);
  }
}

await ensureServer();

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    errors.push(`[console:${msg.type()}] ${msg.text()}`);
  }
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message}`));

const routes = ["/", "/verify", "/explorer", "/badge", "/verify/success"];
for (const r of routes) {
  try {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
    console.log("✓  " + r);
  } catch (e) {
    errors.push(`[goto ${r}] ${e.message}`);
  }
}

// Run the demo flow end to end on /verify.
try {
  await page.goto(`${BASE}/verify`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /start simulation/i }).click({ timeout: 15000 });
  await page.waitForSelector("text=Sign the verification message", { timeout: 20000 });
  await page.getByRole("button", { name: /sign verification/i }).click({ timeout: 15000 });
  await page.waitForSelector("text=Identity verified", { timeout: 30000 });
  console.log("✓  demo flow completed -> success state reached");
} catch (e) {
  errors.push(`[flow] ${e.message}`);
}

console.log("\n--- errors collected ---");
console.log(errors.length ? errors.join("\n") : "NONE");
await browser.close();
process.exit(errors.length ? 1 : 0);

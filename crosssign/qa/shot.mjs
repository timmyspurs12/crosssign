import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.CROSSSIGN_URL ?? "http://localhost:3000";
const OUT = "./shots";
mkdirSync(OUT, { recursive: true });

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

async function shoot(page, name, full = false) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("shot:", name);
}

async function goto(page, route) {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await goto(desktop, "/");
await shoot(desktop, "01-home-hero-desktop");
await shoot(desktop, "02-home-full-desktop", true);
await goto(desktop, "/verify");
await shoot(desktop, "03-verify-desktop");
await goto(desktop, "/explorer");
await shoot(desktop, "04-explorer-desktop");
await goto(desktop, "/badge");
await shoot(desktop, "05-badge-desktop");
await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await goto(mobile, "/");
await shoot(mobile, "06-home-mobile");
await goto(mobile, "/verify");
await shoot(mobile, "07-verify-mobile");
await mobile.close();

await browser.close();
console.log("done → see qa/shots/*.png");

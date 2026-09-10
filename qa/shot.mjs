import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "./shots";
import { mkdirSync } from "fs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function shoot(page, name, full = false) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("shot:", name);
}

// ---------- Desktop ----------
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await desktop.goto(BASE, { waitUntil: "networkidle" });
await shoot(desktop, "01-home-hero-desktop");
await desktop.screenshot({ path: `${OUT}/02-home-full-desktop.png`, fullPage: true });
console.log("shot: 02-home-full-desktop");

// verify page — initial
await desktop.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
await shoot(desktop, "03-verify-initial-desktop");

// demo flow: connect
await desktop.getByRole("button", { name: /start simulation/i }).click();
await desktop.waitForSelector("text=Sign the verification message", { timeout: 8000 });
await shoot(desktop, "04-verify-sign-desktop");

// demo flow: sign
await desktop.getByRole("button", { name: /sign verification/i }).click();
await desktop.waitForTimeout(700); // mid-verification sequence
await shoot(desktop, "05-verify-sequence-desktop");

// success
await desktop.waitForSelector("text=Identity verified", { timeout: 8000 });
await shoot(desktop, "06-verify-success-desktop");

// badge page via "View verification"
await desktop.getByRole("link", { name: /view verification/i }).click();
await desktop.waitForSelector("text=Identity credential", { timeout: 8000 });
await shoot(desktop, "07-badge-desktop");

// explorer with example proof
await desktop.goto(`${BASE}/explorer`, { waitUntil: "networkidle" });
await desktop.getByRole("button", { name: /load an example proof/i }).click();
await desktop.waitForSelector("text=Certificate of verification", { timeout: 8000 });
await shoot(desktop, "08-explorer-desktop");

// ---------- Mobile ----------
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(BASE, { waitUntil: "networkidle" });
await mobile.screenshot({ path: `${OUT}/09-home-mobile.png`, fullPage: true });
console.log("shot: 09-home-mobile");

await mobile.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
await shoot(mobile, "10-verify-initial-mobile");
await mobile.getByRole("button", { name: /start simulation/i }).click();
await mobile.waitForSelector("text=Sign the verification message", { timeout: 8000 });
await shoot(mobile, "11-verify-sign-mobile");

await browser.close();
console.log("DONE");

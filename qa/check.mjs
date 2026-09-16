import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox","--single-process","--no-zygote","--disable-gpu","--disable-dev-shm-usage","--disable-site-isolation-trials"] });
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
  await page.goto(BASE + r, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

// run the demo flow end to end on /verify
await page.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
try {
  await page.getByRole("button", { name: /start simulation/i }).click();
  await page.waitForSelector("text=Sign the verification message", { timeout: 6000 });
  await page.getByRole("button", { name: /sign verification/i }).click();
  await page.waitForSelector("text=Identity verified", { timeout: 8000 });
  console.log("demo flow completed -> success state reached");
} catch (e) {
  errors.push(`[flow] ${e.message}`);
}

console.log("--- errors collected ---");
console.log(errors.length ? errors.join("\n") : "NONE");
await browser.close();

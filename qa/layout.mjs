import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox","--single-process","--no-zygote","--disable-gpu","--disable-dev-shm-usage","--disable-site-isolation-trials"] });

const widths = [1440, 1280, 1024, 768, 390, 375];
const routes = ["/", "/verify", "/explorer", "/badge"];

let failures = 0;

// One long-lived page: closing the LAST page of a single-process headless
// shell can take the whole browser down, so we resize instead of re-creating.
const mainPage = await browser.newPage({ viewport: { width: widths[0], height: 900 } });
for (const width of widths) {
  const page = mainPage;
  await page.setViewportSize({ width, height: 900 });
  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
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
}

// Key copy assertions on /verify
const p = mainPage;
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
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
    console.log(`MISSING COPY: "${t}" on /verify`);
  }
}
// security copy after connecting in demo
await p.getByRole("button", { name: /start simulation/i }).click();
await p.waitForSelector("text=Sign the verification message");
const safe = await p.getByText(/No funds will move/i).first().count();
if (!safe) {
  failures++;
  console.log('MISSING COPY: "No funds will move"');
}

console.log(failures === 0 ? "LAYOUT QA: ALL PASS" : `LAYOUT QA: ${failures} issues`);
await browser.close();

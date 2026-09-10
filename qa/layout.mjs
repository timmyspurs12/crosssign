import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({ args: ["--no-sandbox"] });

const widths = [1440, 1280, 1024, 768, 390, 375];
const routes = ["/", "/verify", "/explorer", "/badge"];

let failures = 0;

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
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
  await page.close();
}

// Key copy assertions on /verify
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

// full flow -> badge -> explorer
await page.goto(`${BASE}/verify`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /start simulation/i }).click();
await page.waitForSelector("text=Sign the verification message");
await page.getByRole("button", { name: /sign verification/i }).click();
await page.waitForSelector("text=Identity verified");

// go to badge
await page.getByRole("link", { name: /view verification/i }).click();
await page.waitForSelector("text=Identity credential", { timeout: 8000 });
const badgeChecks = [
  "CROSSSIGN VERIFIED IDENTITY",
  "Wallet",
  "Originating ecosystem",
  "Destination chain",
  "Verification method",
  "Transaction hash",
  "Contract address",
  "What this proves",
  "What this does not prove",
];
for (const t of badgeChecks) {
  const c = await page.getByText(t, { exact: false }).first().count();
  console.log(`${c ? "✓" : "✗ MISSING"} badge: ${t}`);
  if (!c) errors.push(`badge missing: ${t}`);
}

// explorer with example
await page.goto(`${BASE}/explorer`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /load an example proof/i }).click();
await page.waitForSelector("text=Certificate of verification");
const expChecks = ["Status", "Origin", "Destination", "Method", "Badge", "Active", "Verified"];
for (const t of expChecks) {
  const c = await page.getByText(t, { exact: false }).first().count();
  console.log(`${c ? "✓" : "✗ MISSING"} explorer: ${t}`);
  if (!c) errors.push(`explorer missing: ${t}`);
}

// verify/success with proof param
await page.goto(`${BASE}/verify/success?proof=%7B%22id%22%3A%22x%22%2C%22transactionHash%22%3A%220xabc%22%7D`, {
  waitUntil: "networkidle",
});
const empty = await page.getByText(/no verification found/i).first().count();
console.log(`${empty ? "✓" : "✗"} success page: invalid-proof empty state`);

console.log(errors.length ? `ERRORS: ${errors.join(" | ")}` : "FINAL: ALL PASS");
await browser.close();

# CrossSign — Browser QA harness

Playwright-based checks for the CrossSign frontend. Run these against a
running server (dev or production build) on `http://localhost:3000`.

```bash
cd qa
npm install
node check.mjs     # end-to-end demo flow + console/page errors on all routes
node layout.mjs    # horizontal-overflow check at 1440/1280/1024/768/390/375
node shot.mjs      # screenshots (desktop + mobile) → qa/shots/*.png
```

| Script | What it checks |
|---|---|
| `check.mjs` | Loads every route, runs the Interactive Demo flow to the success state, and collects any console errors / warnings / page errors. |
| `layout.mjs` | No horizontal overflow at the six target breakpoints, plus key copy assertions on `/verify`. |
| `shot.mjs` | Full-page + viewport screenshots of each page on desktop and mobile widths, for visual review. |
| `final.mjs` | Pre-release spot checks (success page, explorer). |
| `wallet-state.mjs` | Wallet-state E2E (production build): Wallet Standard + EIP-6963 fake-wallet injection, connect/sign/reject/reset/account-switch/chain-switch/reload/navigation checks, hydration-error scanning, storage-hygiene assertions. Uses `@sparticuz/chromium` via `CHROMIUM_PATH` when Playwright browsers are not installed. |

All scripts launch Chromium with `--no-sandbox` (required in containers/CI).

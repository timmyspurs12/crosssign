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

### `wallet-state.mjs` scenarios

`S0`–`S14` cover discovery → connect → challenge → gate → sign → submit, resets,
rejections, expiry, wallet switching, navigation/reload, storage hygiene, the
legacy injected provider, the EVM add-chain path and ecosystem isolation.

`S15`–`S20` are the wallet-state/signing regression scenarios added with the
generation-keyed attempt fix (each one fails against the pre-fix code):

| Scenario | Invariant it protects |
|---|---|
| `S15` | A signature prompt that never settles cannot deadlock the flow: `reset()` still allows a new explicit connect, a late signature from the cancelled attempt cannot overwrite the new attempt, and a Solana connect that outlives a reset is dropped. |
| `S16` | An EVM connection prompt that outlives `retry()` is dropped, never adopted, and cannot be silently reused by the next attempt. |
| `S17` | A wallet-side account switch during an in-flight signature cancels the attempt immediately (UI stops claiming the old wallet is connected), and the late signature stays inert. |
| `S18` | A challenge that expires while the user is approving is never submitted; no stale verification state is left behind. |
| `S19` | A signature the wallet reports as coming from a *different* key is refused before submit (injected-provider path), and the flow recovers. |
| `S20` | A wallet prompt that outlives page navigation is not adopted by the next attempt and the stale provider is never used to submit. |

Regression hooks available on `window.__test` inside the fake-wallet harness:
`solHangSign`, `solSignDelayMs`, `solHangConnect`, `solReturnWrongKey`,
`evmHangRequestAccounts`, `solSignStarted`, plus the release functions
`releaseHungSigns()`, `releaseHungConnects()`, `releaseHungRequestAccounts()`.

All scripts launch Chromium with `--no-sandbox` (required in containers/CI).

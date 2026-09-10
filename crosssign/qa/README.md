# CrossSign — Browser QA harness

Playwright checks for the CrossSign frontend. They need the app **already
running** on `http://localhost:3000` — if it isn't, each script exits with a
clear message telling you to start it first.

## Two terminals

**Terminal 1 — start the app** (from the project root):

```bash
cd crosssign
npm install
npm run dev        # wait for:  Ready on http://localhost:3000
```

**Terminal 2 — run QA** (from `crosssign/qa`):

```bash
cd crosssign/qa
npm install
npx playwright install chromium   # one-time browser download (~150 MB)
node run-all.mjs                  # check + layout + shot in one go
```

Or run them individually:

```bash
node check.mjs     # end-to-end demo flow + console/page errors on all routes
node layout.mjs    # horizontal-overflow check at 1440/1280/1024/768/390/375
node shot.mjs      # screenshots (desktop + mobile) → qa/shots/*.png
```

| Script | What it checks |
|---|---|
| `check.mjs` | Loads every route, runs the Interactive Demo flow to the success state, collects console / page errors. |
| `layout.mjs` | No horizontal overflow at the six target breakpoints, plus key copy assertions on `/verify`. |
| `shot.mjs` | Screenshots of each page on desktop and mobile widths for visual review. |
| `run-all.mjs` | Runs the three above sequentially. |

All scripts launch Chromium with `--no-sandbox` (required in containers/CI).
To target a different base URL, set `CROSSSIGN_URL=http://host:port`.

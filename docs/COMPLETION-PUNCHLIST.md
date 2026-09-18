# CrossSign — completion punch list

Audited 2026-09-18 against the live deployment, the chain, and `main` (`3280ce2`).
Ordered by what actually blocks a submission. Effort estimates are for one developer.

---

## Already done — verified, do not redo

| Item | Evidence |
|---|---|
| Wallet hardening + real-Phantom fix are on `main` | `main` = `3280ce2`; contains `requestStandardSignature` / `callLegacyDraft`, the `phantomModern` fixture and checks S21–S23, and the selector note |
| Production deployment is current | GitHub deployment record: Production, sha `3280ce2`, status success |
| Deployed env vars are correct | `crosssign.vercel.app/api/challenge` returns `contract=0x39db2d89ceb5b3f312c7a37459c39da05e251d2e` |
| On-chain read APIs work in production | `/api/verification/0x39db…` → `{"verified":false,"record":null}`; `/api/badge/1` → `{"badge":null}` (clean responses, not `unavailable`) |
| Typecheck / build / E2E | `tsc --noEmit` 0, `next build` OK, wallet-state suite 67/67 |

---

## P0 — blocks submission (do these first)

### 1. No verification has ever succeeded on-chain. No badge exists.
**Evidence.** The verifier `0x39db2d89…` has exactly **one** transaction — its own creation. The registry `0x2862cbdc…` likewise has only its creation transaction. `/api/badge/1` returns `null`.
**Why.** `contract/scripts/deploy.sh` passes `ISSUER_ADDRESS` (which defaults to the **deployer EOA**) as the registry constructor arg. `registry.issue()` allows only `issuer` or `owner`, and the call arrives from the **verifier contract**, so minting reverts `Unauthorized`. DEPLOYMENT.md step 4 (`set_issuer`) was never executed — there is no such transaction.
**Consequence.** The demo's on-chain proof scene cannot be recorded honestly, and "a badge is issued" is unproven.
**Fix (~10 min + 1 tx).**
```bash
node -e "const {JsonRpcProvider,Contract}=require('ethers');const p=new JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');(async()=>{const r=new Contract('0x2862cbdc406546e457a8eb493708613fd9f7c8ac',['function issuer() view returns (address)'],p);console.log('issuer =',await r.issuer());})()"
PRIVATE_KEY=0x… node scripts/chain-admin.mjs set-issuer 0x2862cbdc406546e457a8eb493708613fd9f7c8ac 0x39db2d89ceb5b3f312c7a37459c39da05e251d2e
```
Then run one verification end-to-end from the live site and keep the tx hash.

### 2. `contract/scripts/deploy.sh` fails if anyone re-runs it
Two defects in the committed script:
- The key path is root-relative but used **inside** the crate directory: with `cd registry`, `--private-key-path "registry/../.deploy-private-key.tmp"` resolves to `contract/registry/.deploy-private-key.tmp`, while the key is written to `contract/.deploy-private-key.tmp` → `cargo stylus deploy` cannot read the key. Same for `verifier/../…`.
- The file contains the script **twice** (2 shebangs, 244 lines); the trailing copy re-runs setup after the first copy finishes.
**Fix (~15 min).** Capture an absolute key path once (`KEYFILE_ABS="$(pwd)/.deploy-private-key.tmp"`) *before* any `cd`, pass that to both deploys, and delete the duplicated tail. Re-test with `bash -n` and a dry run.

### 3. The zero-address fallback silently produced a no-op transaction
`lib/config.ts` `envAddress()` defaults to `0x0000000000000000000000000000000000000000`. With the env var unset, the app happily builds a challenge bound to `contract=0x0` and submits to the zero address — status Success, no logs, no error. This is exactly how `0xb2d2e037…` was produced.
**Fix (~30 min).** Make it loud:
- throw (or mark the config "unconfigured") when `NEXT_PUBLIC_VERIFIER_ADDRESS` is missing or zero;
- have the challenge builder refuse a zero contract address;
- surface an unmistakable banner on `/verify` ("contracts not configured — set NEXT_PUBLIC_VERIFIER_ADDRESS") and disable the connect/submit buttons.
A misconfiguration must never look like a successful verification.

### 4. No committed deployment record
`contract/deployments/` contains only `.gitkeep`, yet `.gitignore` says "sepolia.json is the record and IS committed". Judges cannot get the addresses from the repo.
**Fix (~15 min).** Commit `contract/deployments/sepolia.json` (addresses + deploy/activate tx hashes) and add the two addresses to `README.md`.

---

## P1 — a judge will notice these

### 5. No favicon, app icon, or social card
`app/` has no `favicon.ico`/`icon.png`, there is no `public/`, and `metadata` has only title + description. The tab shows a default icon and a shared link renders a blank card.
**Fix (~15 min).** Assets already exist in `brand/`: add `app/icon.png` (1024 mark or app-icon), `app/apple-icon.png` (180), `app/opengraph-image.png` (1200×630 OG card) and an `openGraph`/`twitter` block in `app/layout.tsx`.

### 6. The chain read path exists but nothing in the UI uses it
`/api/verification/:address` and `/api/badge/:id` work in production, but no component calls any `/api/*` route. `/explorer` reads `latestProofs()` from **in-memory** state, so "Recent verifications" is empty on every fresh load, and there is no way in the app to ask "is wallet X verified?" or "show badge N".
**Fix (~1–2 h).** Wire the explorer (and/or the badge page) to the chain reads: an address input that calls `/api/verification/:address` + `/api/badge/:id`, with empty/loading/error states. This makes the product's "any app can query the proof" claim demonstrable instead of aspirational.

### 7. Contracts are not source-verified on Arbiscan
Both are labelled "Stylus Contract", but no source is published. Contract quality is the buildathon's first judging criterion.
**Fix (~20 min).** `cd contract/registry && cargo stylus verify --endpoint …` and the same for `verifier` (needs `cargo-stylus` ≥ 0.5.0).

### 8. Unmeasured gas claim on the landing page
`components/home/TechnicalSection.tsx` states "~10–50× cheaper", while `contract/README.md` says the figure is deliberately **not** claimed until measured.
**Fix (~30 min).** Run `bash contract/scripts/benchmark.sh`, then either cite the measured number in both places or soften the on-page copy.

### 9. No LICENSE file
`contract/Cargo.toml` declares `MIT OR Apache-2.0`; the repository has no license file.
**Fix (2 min).** Add `LICENSE-MIT` + `LICENSE-APACHE` (or a single `LICENSE`).

### 10. No root `.env.example`
`.gitignore` whitelists `!.env.example`, but the web app has none. Four variables are used: `NEXT_PUBLIC_VERIFIER_ADDRESS`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_ARBITRUM_RPC`.
**Fix (5 min).** Add `/.env.example` with those four and the Sepolia defaults.

### 11. Docs vs implementation: who mints the challenge?
`README.md` and `app/api/challenge/route.ts` say the backend issues the nonce and formats the canonical message, but the live path builds the challenge **client-side** in `lib/challenge.ts` and never calls `/api/challenge`. Either is defensible (the nonce is burned on-chain), but the two should agree.
**Fix (~30 min).** Either route the live challenge through `/api/challenge`, or correct the docs to say the client mints it and the contract enforces single-use. Also decide whether `app/api/verify/prepare/route.ts` is used — it currently has no caller.

---

## P2 — polish, only if time allows

| # | Item | Fix |
|---|---|---|
| 12 | No `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx` — a bad URL shows the default Next 404 | add the three files (~20 min) |
| 13 | `npm run lint` fails (no ESLint config present) | add a minimal config or drop the script (~10 min) |
| 14 | `SITE.url` is the placeholder `https://crosssign.example` (currently unused) | point it at `https://crosssign.vercel.app` (~2 min) |
| 15 | Demo mode falls back to a hardcoded `badgeId: "CS-0001"` | acceptable; label it clearly if shown |

---

## Suggested order

1. **P0-1** set-issuer + one real verification → gives you the tx hash for the video and proves the product works.
2. **P0-3** fail loudly on unconfigured contracts (prevents a repeat of the zero-address no-op).
3. **P0-4** commit the deployment record; **P0-2** fix the deploy script.
4. **P1-5** icons + OG card (assets are ready), **P1-7** source-verify contracts.
5. **P1-6** wire chain reads into the explorer — the biggest genuine feature gap.
6. Remaining P1/P2 as time allows; then record the demo video.

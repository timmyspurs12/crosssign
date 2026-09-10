# CrossSign

**Cross-chain identity verification on Arbitrum.** Prove ownership of a wallet
from another ecosystem (starting with Solana / Phantom) by signing a single
message — verified on-chain via **Arbitrum Stylus** (Ed25519 in Rust) — without
bridging a single asset.

Built for the **Arbitrum Open House Singapore — Online Buildathon**.
[Buildathon page](https://arbitrum-singapore.hackquest.io/buildathons/Arbitrum-Open-House-Singapore-Online-Buildathon)

---

## Design direction

CrossSign is positioned as **cryptographic infrastructure**, not a "crypto"
dashboard. The visual language sits somewhere between Linear, Stripe, Arc,
Vercel and a premium security product:

- **Type** — Geist Sans (UI) + IBM Plex Mono (technical labels). Two families, disciplined hierarchy.
- **Color** — warm near-white paper (`#F6F5F1`), deep charcoal ink, one restrained
  electric cyan/teal accent (`#00B3A4`), verification green, muted slate. No
  purple/blue gradients, no glow, no glassmorphism.
- **Motion** — subtle and state-driven (a signal crossing the chain boundary,
  a badge that assembles, cryptographic characters resolving to "verified").
  No particle backgrounds, no spinning loaders everywhere.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing — hero with interactive Solana → Sign → CrossSign → Arbitrum → Verified flow, benefits, interactive "how it works", Stylus-vs-EVM section, buildathon strip |
| `/verify` | The verification terminal — step indicator (Connect → Sign → Verify → Badge), live Phantom integration **and** a clearly-labelled interactive demo mode |
| `/verify/success` | Standalone success state (deep-linkable via `?proof=…`) |
| `/badge` | Identity credential view — wallet, ecosystems, method, timestamp, tx hash, contract, proof strip, and an explicit "ownership vs real-world identity" distinction |
| `/explorer` | Public proof inspector — security-certificate style, no wallet required |

## Live vs demo (important)

- **Live mode** uses the real Phantom provider (`window.phantom.solana`) and
  Ed25519 `signMessage`. Nothing is simulated.
- **Demo mode** is a deterministic, clearly-labelled simulation for when Phantom
  is unavailable (e.g. a judge on a fresh machine). It is tagged
  **"Simulation"** in the UI, uses demo-labelled transaction hashes, and never
  claims to be a real on-chain verification.
- CrossSign never asks for seed phrases / private keys and never implies the
  signature moves funds — the UI states **"No funds will move"** at the point
  of signing.

## Structure

```
app/                     routes + root layout (Geist + IBM Plex Mono)
components/
  layout/                header, footer, container, logo/mark
  ui/                    Button, Card, Tag, StatusDot, StepIndicator, Spinner, …
  home/                  landing sections (Hero, HeroFlow, Benefits, HowItWorks, …)
  verification/          VerificationContext (state machine), VerifyFlow, terminal UI
  badge/                 IdentityBadge (animated seal) + BadgeView
  explorer/              ExplorerView
lib/
  config.ts              brand, chains, explorers, env-driven contract addresses
  canonical.ts           canonical message builder (byte-identical to the contract)
  base58.ts              base58 ↔ hex (Solana pubkeys / signatures)
  challenge.ts           wallet-bound challenge-message builder
  phantom.ts             Phantom adapter (the ONLY file touching window.phantom)
  verify-service.ts      live verification orchestrator (sign → submit)
  chain/client.ts        ethers read/write client (the only chain-touching file)
  contract-abi.ts        VERIFIER_ABI + REGISTRY_ABI + typed records
  demo-adapter.ts        deterministic simulation adapter
  registry.ts            proof registry (in-memory + localStorage mirror)
  proof-format.ts        proof record builder + explorer URL helpers
app/api/                 challenge / verify-prepare / verification / badge routes
types/                   ProofRecord, VerificationState, WalletAccount, …
```

### State machine

`VerificationContext` drives a single `VerificationState`:

```
idle → connecting → connected → signing → verifying → verified
                                    ↘ rejected / failed
```

UI components render purely from this state; wallet access and blockchain
calls are isolated behind `lib/*` service functions.

## Backend integration points

The frontend is decoupled from the contracts/API behind typed service
functions, so the on-chain layer can be wired up (or re-pointed) without
touching any UI component:

1. **`lib/chain/client.ts`** — the only file that talks to the chain (ethers):
   `readIsVerified`, `readVerification`, `readBadge`, `readNonceUsed`,
   `submitVerification` (BrowserProvider → `verify_and_issue` → parses the
   `WalletVerified` badge id).
2. **`lib/verify-service.ts`** — the live verification orchestrator: connect
   Phantom → derive hex pubkey → build the canonical challenge → sign →
   `submitVerification`.
3. **`lib/canonical.ts`** — builds the canonical message byte-for-byte
   identically to the contract (`scripts/check-canonical.mjs` cross-checks).
4. **`lib/config.ts` → `CONTRACTS` / `NETWORK`** — contract addresses and
   chain id come from `NEXT_PUBLIC_*` env vars (zero-address until deployed).
5. **API routes** — lightweight convenience layer (`app/api/*`): challenge
   issuance, calldata encoding, and read helpers. **Signature verification
   happens only inside the Stylus contract**, never in the backend.

## Run

```bash
npm install
npm run dev        # development (http://localhost:3000)
npm run build      # production build
npm run start      # serve the production build
```

## Test

**Frontend**

```bash
npm run typecheck                 # strict TypeScript (tsc --noEmit)
npm run build                     # production build (fails on any type error)
node scripts/check-canonical.mjs  # JS canonical message == Rust fixture
```

**Contracts**

```bash
cd contract
cargo test     # 28 unit tests (registry + verifier), host-side
```

**Browser QA (Playwright)** — needs the server running on `:3000`:

```bash
cd qa && npm install
node check.mjs    # end-to-end demo flow + console/page errors on all routes
node layout.mjs   # no horizontal overflow at 1440/1280/1024/768/390/375
node shot.mjs     # page screenshots (desktop + mobile) → qa/shots/
```

Manual checklist before shipping: every page at 1440/1280/1024/768/390/375,
plus the loading / empty / error / wallet-disconnected / rejected-signature /
transaction-pending / verification-failed states — and no placeholder text.

## Smart contract (`contract/`)

The on-chain half: two **Stylus** contracts in Rust.

- **CrossSignVerifier** (`contract/verifier/`) — rebuilds the canonical
  challenge, verifies **Ed25519** on-chain with `ed25519-dalek` (compiled to
  WASM), enforces replay protection (nonce / expiry / chain / contract
  binding), then calls the registry.
- **CrossSignBadgeRegistry** (`contract/registry/`) — issues the soulbound
  badge (non-transferable **by construction** — no transfer function exists),
  one badge per address, verifier-only minting, owner revoke.

- **Build:** `cargo build --release --target wasm32-unknown-unknown`
- **Test:** `cargo test` (28 unit tests, host-side via `stylus-test`)
- **Deploy:** see `contract/DEPLOYMENT.md` (registry first, then verifier)
- **ABI:** `lib/contract-abi.ts` mirrors the Solidity interfaces

Methods: `verify_and_issue(bytes,string,uint64,bytes,string) → uint256` ·
`verify_signature(bytes,bytes,string) → bool` (view) ·
`verification_of(address) → Verification` · `badge(uint256) → Badge` ·
`is_verified(address) → bool` · `nonce_used(bytes32) → bool` ·
`issue(address,bytes,string)` · `set_issuer(address)` · `revoke(uint256)`.

Docs: `contract/README.md` (full API + security model) ·
`contract/ARCHITECTURE.md` · `contract/SECURITY.md` · `contract/DEPLOYMENT.md`.

## Deploy live

A live CrossSign = **contracts on Arbitrum Sepolia** + **frontend pointed at
them**.

**Prerequisites**

- Rust + `wasm32-unknown-unknown` target + [`cargo-stylus`](https://github.com/OffchainLabs/stylus-sdk-rs) (`cargo install cargo-stylus --locked`)
- A funded Arbitrum Sepolia wallet — faucet: https://arbitrum.faucet.dev
- (optional) a Vercel account to host the frontend

**1. Deploy the contracts** (registry first, then verifier, then authorize):

```bash
cd contract
cp .env.example .env            # paste PRIVATE_KEY (throwaway wallet, never commit)
bash scripts/deploy.sh          # → deployments/sepolia.json
cd .. && PRIVATE_KEY=0x… node scripts/chain-admin.mjs set-issuer <REGISTRY> <VERIFIER>
```

Full step-by-step (check, activate, verify on Arbiscan, troubleshooting):
`contract/DEPLOYMENT.md`.

**2. Point the frontend at the contracts** — create `.env.local`:

```bash
NEXT_PUBLIC_VERIFIER_ADDRESS=0x…     # from deployments/sepolia.json
NEXT_PUBLIC_REGISTRY_ADDRESS=0x…
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_ARBITRUM_RPC=https://sepolia-rollup.arbitrum.io/rpc
```

**3. Ship the frontend** — push to Vercel (add the same four env vars in
Project Settings) or self-host:

```bash
npm run build && npm run start
```

**4. Smoke test** — verify a real Phantom wallet from an Arbitrum Sepolia
wallet, confirm the badge minted
(`node scripts/chain-admin.mjs badge <REGISTRY> <badgeId>`), then measure gas
(`contract/scripts/benchmark.sh`) and record the numbers in
`contract/README.md` §10 (no gas figure is claimed until this is done).

## Stack

Frontend: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion ·
@solana/web3.js · Phantom provider · Lucide icons · Geist + IBM Plex Mono.

Contract: Rust · Stylus SDK 0.10.9 · ed25519-dalek 2 · alloy.

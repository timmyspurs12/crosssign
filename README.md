# CrossSign

**Cross-chain identity verification on Arbitrum.** Prove ownership of a wallet
from another ecosystem (starting with Solana) by signing a single
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
| `/verify` | The verification terminal — step indicator (Connect → Sign → Verify → Badge), multi-wallet Solana + Arbitrum (EVM) integration **and** a clearly-labelled interactive demo mode |
| `/verify/success` | Standalone success state (deep-linkable via `?proof=…`) |
| `/badge` | Identity credential view — wallet, ecosystems, method, timestamp, tx hash, contract, proof strip, and an explicit "ownership vs real-world identity" distinction |
| `/explorer` | Public proof inspector — security-certificate style, no wallet required |

## Live vs demo (important)

- **Live mode** uses the wallet the user picks from the selector — Solana
  wallets via the Wallet Standard (Phantom, OKX, Solflare, Backpack…) and
  Arbitrum wallets via EIP-6963/injected EIP-1193 discovery (MetaMask, OKX,
  Rabby, Zerion, Coinbase…) — and
  Ed25519 `signMessage`. Nothing is simulated.
- **Demo mode** is a deterministic, clearly-labelled simulation for when no wallet
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
  wallet/                wallet layer — discovery, connect, signing
    solana.ts            Solana Wallet Standard + injected discovery, Ed25519 signing
    evm.ts               EIP-6963 / injected EIP-1193 discovery, Arbitrum Sepolia chain mgmt
    types.ts             narrow provider surfaces (EIP-1193, EIP-6963, injected Solana)
    useWallets.ts        hydration-safe React hooks for wallet discovery
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

## Browser flow and read APIs

The frontend is decoupled from the contracts/API behind typed service
functions, so the on-chain layer can be wired up (or re-pointed) without
touching any UI component:

1. **`lib/chain/client.ts`** — the only file that talks to the chain (ethers):
   `readIsVerified`, `readVerification`, `readBadge`, `readNonceUsed`,
   `submitVerification` (BrowserProvider → `verifyAndIssue` → parses the
   `WalletVerified` badge id).
2. **`lib/verify-service.ts`** — the live verification orchestrator: connect
   chosen Solana wallet → derive hex pubkey → build the canonical challenge →
   sign (message only) →
   `submitVerification`.
3. **`lib/canonical.ts`** — builds the canonical message byte-for-byte
   identically to the contract (`scripts/check-canonical.mjs` cross-checks).
4. **`lib/config.ts` → `CONTRACTS` / `NETWORK`** — contract addresses and
   chain id come from `NEXT_PUBLIC_*` env vars. The two address reads are
   written **statically** (`process.env.NEXT_PUBLIC_VERIFIER_ADDRESS`) because
   Next.js only inlines a literal member access into the browser bundle — a
   dynamic `process.env[key]` lookup silently yields `undefined` in the
   browser in every build. When an address is missing the app falls back to the
   zero address and **refuses to build a challenge or submit** (`/verify` shows
   a "Live verification is disabled" notice), because a transaction to `0x0`
   mines, reports success, emits no logs and mints nothing.
5. **API routes** — lightweight convenience layer (`app/api/*`): challenge
   issuance, calldata encoding, and read helpers. The **live path builds the
   canonical challenge in the client** (`lib/challenge.ts`) — the nonce is
   single-use and enforced by the contract, so it does not need a server round
   trip. `/api/challenge` and `/api/verify/prepare` are optional helpers with
   no callers in the current app; live calldata is built in `lib/chain/client.ts`
   and submitted through the connected EVM wallet. **Signature verification happens
   only inside the Stylus contract**, never in the backend.

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
node scripts/check-read-apis.mjs  # offline ethers decoding + read-route regression
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

## Deployed contracts (Arbitrum Sepolia)

Live and activated. Full record: `contract/deployments/sepolia.json`.

| Contract | Address | Arbiscan |
|---|---|---|
| **CrossSignVerifier** | `0xf30539d134a95b4f71efcdff88295ea36e5f3708` | [address](https://sepolia.arbiscan.io/address/0xf30539d134a95b4f71efcdff88295ea36e5f3708) · [deploy + activate](https://sepolia.arbiscan.io/tx/0x3d436655f91f015ace5016227541d9090b5036389f8c776e57b38a7e448b4887) |
| **CrossSignBadgeRegistry** | `0x1be5fca582abbe2f69f5a3ce15311dea553ec8f2` | [address](https://sepolia.arbiscan.io/address/0x1be5fca582abbe2f69f5a3ce15311dea553ec8f2) · [deploy + activate](https://sepolia.arbiscan.io/tx/0xa2e1076ec9424366d4e1b4432ea6ed6c7950c99baef491ba0458ff72203a11f2) |

Both are **Stylus programs** (Rust → WASM): deployed with `cargo stylus deploy`
with deployment, activation and constructors executed atomically through
StylusDeployer, which is why Arbiscan labels them
"Stylus Contract". Deployer/owner: `0xf8e604137A2F4b213AC115D33fee170EB5a63282`.
Live app: https://crosssign.vercel.app

The live verifier is already authorized to mint. **Do not redeploy or re-point
this pair.** Badge #1 is recorded in the deployment file; badge #2 was minted
through the production site: [transaction](https://sepolia.arbiscan.io/tx/0x94b8aa30b4dcf443f92f9a208058a5c99bc19191339157723708a65c8160ec6d).

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

Live ABI methods: `verifyAndIssue(uint8[],string,uint64,uint8[],string) → uint256`
(selector `0xe5f28691`) · `verifySignature(uint8[],uint8[],uint8[]) → bool` ·
`verificationOf(address) → Verification` · `badge(uint256) → Badge` ·
`isVerified(address) → bool` · `nonceUsed(string) → bool` ·
`issue(address,uint8[],string)` (selector `0x4a7d65c1`) ·
`setIssuer(address)` · `revoke(uint256)`.

**Do not change these to snake_case or `bytes`:** stylus-sdk 0.10.9 exports
Rust `Vec<u8>` parameters as `uint8[]`. Tuple fields/events declared as `bytes`
remain `bytes`.

Docs: `contract/README.md` (full API + security model) ·
`contract/ARCHITECTURE.md` · `contract/SECURITY.md` · `contract/DEPLOYMENT.md`.

## Deploy live

A live CrossSign = **contracts on Arbitrum Sepolia** + **frontend pointed at
them**.

**Prerequisites**

- Rust + `wasm32-unknown-unknown` target + [`cargo-stylus`](https://github.com/OffchainLabs/stylus-sdk-rs) (`cargo install cargo-stylus --locked`)
- A funded Arbitrum Sepolia wallet — faucet: https://arbitrum.faucet.dev
- (optional) a Vercel account to host the frontend

**1. Reuse the live contracts above.** No contract deployment or issuer change
is needed. `contract/DEPLOYMENT.md` documents deployment mechanics for reference,
not an instruction to replace the working pair.

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

**4. Smoke test after the frontend rebuild** — read the existing evidence (no
new transaction needed):

```bash
curl -sS https://crosssign.vercel.app/api/badge/2
curl -sS https://crosssign.vercel.app/api/verification/0x6648bc2a1b5444cd96535c96e8f2da37a74dfd38
```

Both should return real records without `unavailable`. Badge #2 used **470,424 gas**
(about **0.0000835 ETH** at that transaction's fee). This is a measured full
verification + badge mint, not an isolated Ed25519 benchmark or a Solidity
savings comparison; see `contract/README.md` §10.

## Stack

Frontend: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion ·
@solana/web3.js · @wallet-standard/app · EIP-1193/EIP-6963 providers · Lucide icons · Geist + IBM Plex Mono.

Contract: Rust · Stylus SDK 0.10.9 · ed25519-dalek 2 · alloy.

# CrossSign — Deployment

A beginner-friendly, step-by-step guide to deploying the CrossSign contracts
to **Arbitrum Sepolia** (chain id `421614`).

## 0. What you'll need

| Tool | Why | How |
|---|---|---|
| Rust (1.91.x) | build the contracts | https://rustup.rs |
| `wasm32-unknown-unknown` target | compile to WASM | `rustup target add wasm32-unknown-unknown` |
| `cargo-stylus` | check + deploy + verify | `cargo install cargo-stylus --locked` |
| A funded Arbitrum Sepolia wallet | pay deploy gas | https://arbitrum.faucet.dev (need Sepolia ETH first) |
| The private key of that wallet | sign the deploy txs | keep it in `.env`, never commit it |

> Use a **throwaway buildathon wallet**. The deployer becomes the owner of both
> contracts, so a leaked key = compromised protocol.

## 1. Build & check the contracts

```bash
cd contract

# Unit tests (28, host-side)
cargo test

# Build deployable WASM (both crates)
cargo build --release --target wasm32-unknown-unknown

# Verify each crate will deploy + activate (no transaction needed)
cd registry && cargo stylus check && cd ..
cd verifier && cargo stylus check && cd ..
```

`cargo stylus check` validates that the brotli-compressed WASM fits the 24 KB
on-chain code-size limit and that activation will succeed.

## 2. Configure secrets

```bash
cd contract
cp .env.example .env
# edit .env and paste your private key:
#   PRIVATE_KEY=0x…
```

The `.env` file is git-ignored. Never share or commit it.

## 3. Deploy

```bash
cd contract
bash scripts/deploy.sh
```

The script (with `cargo-stylus` installed and `.env` set) will:

1. Deploy **CrossSignBadgeRegistry** with `issuer = deployer` (placeholder).
2. Deploy **CrossSignVerifier** with
   `constructor(registry_address, "arbitrum-sepolia")`.
3. Save the addresses to `deployments/sepolia.json`.
4. Print the one manual step below.

> Deploy **registry first** — the verifier's constructor needs the registry
> address.

## 4. Authorize the verifier to mint badges

The registry constructor accepted the deployer as its initial issuer. The real
mint authority must be the verifier, so after both deployments run:

```bash
cd ..                         # web app root (ethers is installed here)
PRIVATE_KEY=0x… node scripts/chain-admin.mjs set-issuer <REGISTRY> <VERIFIER>
```

Now badges can only be minted through a successful on-chain verification.

## 5. Point the web app at the contracts

In the web app root (`/home/user/crosssign`), create/edit `.env.local`:

```bash
NEXT_PUBLIC_VERIFIER_ADDRESS=<VERIFIER>
NEXT_PUBLIC_REGISTRY_ADDRESS=<REGISTRY>
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_ARBITRUM_RPC=https://sepolia-rollup.arbitrum.io/rpc
```

Then `npm run build && npm run start`.

## 6. Verify the contracts (recommended)

```bash
cd contract/registry && cargo stylus verify \
    --endpoint https://sepolia-rollup.arbitrum.io/rpc && cd ..
cd contract/verifier && cargo stylus verify \
    --endpoint https://sepolia-rollup.arbitrum.io/rpc && cd ..
```

Verification is only supported on Arbiscan for contracts deployed with
`cargo-stylus v0.5.0+`. Always verify on Sepolia before considering mainnet.

## 7. Record gas benchmarks

```bash
cd contract
bash scripts/benchmark.sh
```

Then copy the numbers into `README.md` §10 (do not quote any gas figure before
this measurement).

## Deployment order summary

```
1. cargo stylus check        (both crates)
2. deploy registry           constructor(issuer = deployer)
3. deploy verifier           constructor(registry, "arbitrum-sepolia")
4. registry.set_issuer(verifier)
5. web app .env.local        → NEXT_PUBLIC_* addresses
6. smoke test                → verify a Solana wallet, mint badge
```

## Smoke test

1. Open the site, click **Verify a wallet**, connect Phantom.
2. Sign the challenge, submit from an Arbitrum Sepolia wallet (MetaMask).
3. Confirm the badge minted: read it back with
   `node scripts/chain-admin.mjs badge <REGISTRY> <badgeId>`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cargo stylus: command not found` | `cargo install cargo-stylus --locked`, ensure `~/.cargo/bin` is on `PATH`. |
| `contract predeployment check failed` / exceeds 24 KB | re-run `cargo stylus check` for the exact reason; build with `--release`. |
| `insufficient funds` | fund the wallet at https://arbitrum.faucet.dev. |
| deploy succeeds but `issue` reverts | you forgot step 4 (`set_issuer`). |
| wrong chain id / endpoint | use `--endpoint https://sepolia-rollup.arbitrum.io/rpc`. |

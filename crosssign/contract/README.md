# CrossSign — Protocol (Stylus smart contracts)

Cross-chain **wallet-ownership verification** on Arbitrum Stylus.

A user proves control of a foreign wallet (starting with **Solana / Phantom**,
which signs with **Ed25519**) by signing one canonical message. A Rust smart
contract verifies that signature **on-chain** and a second contract issues a
**non-transferable** CrossSign badge. No assets ever move.

```
CONNECT PHANTOM → SIGN CHALLENGE → SUBMIT → STYLUS VERIFIES Ed25519
                                          → ARBITRUM CONFIRMS
                                          → CROSSSIGN BADGE ISSUED
```

---

## 1. What CrossSign does

- Generates a **canonical challenge** that binds a wallet public key, this
  contract, this chain, a nonce and an expiry.
- Verifies the resulting **Ed25519 signature on-chain** (Rust → WASM via
  Stylus).
- Records the verification and issues a **soulbound badge** to the caller's
  Arbitrum address.
- Lets anyone read a verification / badge without connecting a wallet.

It **does not** claim anything about a person's real-world identity. It proves
only: *"control of this wallet was demonstrated."*

## 2. Why Ed25519 matters

The EVM's `ecrecover` precompile verifies **secp256k1** signatures only.
Ed25519 (used by Solana, TON, Cosmos, and many devices) cannot be verified
natively in Solidity. Doing it in pure Solidity is a multi-hundred-thousand-gas
operation that is easy to get subtly wrong. CrossSign verifies Ed25519
natively in Rust with the battle-tested `ed25519-dalek` crate — something the
EVM simply cannot do, and a textbook "only Stylus can do this" capability.

## 3. Why Stylus

Stylus compiles Rust to WASM and runs it on-chain alongside the EVM. That lets
CrossSign use a well-reviewed Rust crypto library (`ed25519-dalek`) directly
inside the contract, with the correctness and cost profile of native Rust
rather than a hand-rolled Solidity reimplementation.

## 4. Architecture

Two small, single-purpose contracts (see `ARCHITECTURE.md` for diagrams):

| Contract | Path | Responsibility |
|---|---|---|
| **CrossSignVerifier** | `verifier/` | Reconstruct the canonical message, verify the Ed25519 signature on-chain, enforce replay protection (nonce + expiry + chain + contract + wallet binding), call the registry. |
| **CrossSignBadgeRegistry** | `registry/` | Issue the soulbound badge, enforce one-badge-per-address, prevent unauthorized issuance (only the verifier may mint), expose badge data, owner revoke. |

The verifier calls `registry.issue(...)` after a successful verification. The
registry is the only address authorized to mint, so a badge cannot exist
without a successful on-chain verification.

## 5. Verification flow

1. Frontend connects Phantom and derives the 32-byte public key.
2. A challenge is built from the canonical template (see below).
3. Phantom signs the message (no funds move, no approvals).
4. The user's Arbitrum wallet submits `verify_and_issue(pubKey, nonce, expires, signature, originNetwork)`.
5. The verifier reconstructs the same message, checks the signature in Rust, burns the nonce, and calls the registry.
6. The registry mints a soulbound badge to the caller. `WalletVerified` and `BadgeIssued` are emitted.

## 6. Replay protection

The challenge message binds, in one signature:

| Field | Purpose |
|---|---|
| `CROSSSIGN_VERIFY` + `domain` | Product/domain separation |
| `chain=<id>` | Prevents cross-chain replay |
| `contract=<verifier>` | Prevents cross-contract replay |
| `wallet=<pubkey>` | Binds to the exact key |
| `nonce=<nonce>` | Single-use; burned on success |
| `expires=<ts>` | Contract rejects expired / too-far-future challenges |

The **contract reconstructs the message itself** using its own `chain_id()`
and `contract_address()` — it never trusts a client-supplied timestamp or a
client claim about what was signed. The frontend and contract share the exact
encoding (`lib/canonical.ts` ↔ `canonical_message`), cross-checked by
`scripts/check-canonical.mjs`.

## 7. Contract addresses

Not deployed yet — run the deployment (see `DEPLOYMENT.md`), then fill in:

| Item | Value |
|---|---|
| Network | Arbitrum Sepolia |
| Chain ID | 421614 |
| CrossSignVerifier | `0x…` (pending deployment) |
| CrossSignBadgeRegistry | `0x…` (pending deployment) |

## 8. Deployment instructions

See `DEPLOYMENT.md` for the beginner-friendly, step-by-step guide (install
cargo-stylus, fund a key, run `scripts/deploy.sh`, record the addresses).

## 9. Testing instructions

```bash
cd contract
cargo test                     # 28 unit tests (registry + verifier), host-side
node ../scripts/check-canonical.mjs   # cross-language message check
cargo build --release --target wasm32-unknown-unknown   # deployable WASM
```

Tests cover: valid signature, invalid signature, wrong key, modified message,
expired challenge, far-future challenge, replayed nonce, wrong chain, wrong
contract, wrong domain, duplicate badge, unauthorized issuance, malformed
input, and the non-transferability-by-design of badges.

## 10. Gas benchmarks

**Not yet measured.** The project brief expects Stylus to make Ed25519 far
cheaper than a Solidity equivalent, but no figure is claimed here until the
contracts are deployed to Arbitrum Sepolia and measured. After deploying, run:

```bash
scripts/benchmark.sh
```

…which submits `verify_signature` (pure) and `verify_and_issue` and reports the
gas used. Record the results in this section.

## 11. Security considerations

See `SECURITY.md` for the full pass, including known assumptions and
limitations. Highlights:

- Replay (cross-chain / cross-contract / nonce reuse / expiry) is blocked by
  the canonical-message binding + on-chain nonce burn.
- Badges are non-transferable **by construction** (no transfer function
  exists), removing the ERC-721 override loophole class.
- Only the verifier (or registry owner) can mint; revoke is owner-only.
- The contract never holds funds or keys.

**Not** covered (by design): real-world identity/KYC, key revocation from the
Solana side, and privacy (the public key is stored in the clear — see
SECURITY.md §Privacy).

## 12. Known limitations

- `ed25519-dalek` runs in the contract, but the exact on-chain gas cost is
  unmeasured until deployment (§10).
- The verifier stores the full 32-byte public key in the clear (chosen for
  simplicity and verifiability; a hash/commitment variant is possible later).
- No migration/upgrade path is built in (immutability is a feature here);
  `set_issuer` / `set_badge_registry` allow re-pointing, not upgrading logic.
- One badge per Arbitrum address; a revoked address cannot re-verify.
- Cross-contract call (verifier → registry) is unit-tested via mocked calls;
  full on-chain integration is exercised post-deployment.

## 13. Future roadmap

- Add **TON** (also Ed25519) and other ecosystems.
- Optional **privacy mode**: store `keccak(pubkey)` instead of the raw key.
- Batch verification for gas efficiency.
- A read-only indexing service for fast public lookups.
- **Robinhood Chain** deployment (same code, different chain id).

## Repository layout

```
contract/
├── Cargo.toml            workspace
├── .cargo/config.toml    Stylus WASM flags
├── .env.example          deployment secrets template (copy to .env)
├── verifier/             CrossSignVerifier (Ed25519 + replay + badge call)
├── registry/             CrossSignBadgeRegistry (soulbound badges)
├── scripts/              deploy.sh + benchmark.sh
├── deployments/          deploy output (sepolia.json, logs)
├── DEPLOYMENT.md  ARCHITECTURE.md  SECURITY.md
```

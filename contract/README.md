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
2. The browser builds a fresh challenge in `lib/challenge.ts` using the canonical
   template; the live flow does not call the optional challenge/prepare APIs.
3. Phantom signs the message (no funds move, no approvals).
4. The user's Arbitrum wallet submits `verifyAndIssue(pubKey, nonce, expires, signature, originNetwork)`.
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

Live and proven on-chain. Reuse this pair; do not redeploy or change its issuer.
See `deployments/sepolia.json` for deployment evidence.

| Item | Value |
|---|---|
| Network | Arbitrum Sepolia |
| Chain ID | 421614 |
| CrossSignVerifier | `0xf30539d134a95b4f71efcdff88295ea36e5f3708` |
| CrossSignBadgeRegistry | `0x1be5fca582abbe2f69f5a3ce15311dea553ec8f2` |

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

Badge #2, minted through `crosssign.vercel.app`, used **470,424 gas** and cost
about **0.0000835 ETH** in [this transaction](https://sepolia.arbiscan.io/tx/0x94b8aa30b4dcf443f92f9a208058a5c99bc19191339157723708a65c8160ec6d).

This measures the complete `verifyAndIssue` call, including the badge mint,
not Ed25519 alone. ETH cost depends on the transaction's fee conditions.
No Solidity comparison or gas-savings multiplier has been measured or claimed.

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

- The full verification + mint has a measured gas cost (§10); isolated
  Ed25519 cost and a Solidity comparison have not been measured.
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

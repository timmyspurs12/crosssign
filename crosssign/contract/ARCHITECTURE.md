# CrossSign — Architecture

## Overview

CrossSign is a two-contract protocol on Arbitrum Stylus, plus a thin
frontend/backend layer that never holds the cryptographic trust assumption.

```
┌─────────────┐   sign canonical challenge (Ed25519)   ┌──────────────────┐
│  Phantom     │ ─────────────────────────────────────▶ │  CrossSign        │
│  (Solana)    │                                        │  Verifier         │
└─────────────┘                                        │  (Rust / WASM)    │
                                                       │  1. rebuild msg   │
┌─────────────┐   submit verify_and_issue(...)         │  2. verify sig    │
│  Arbitrum    │ ─────────────────────────────────────▶ │  3. burn nonce    │
│  wallet      │                                        │  4. call registry │
└─────────────┘                                        └─────────┬─────────┘
                                                                │ issue()
                                                       ┌────────▼─────────┐
                                                       │  BadgeRegistry    │
                                                       │  soulbound badge  │
                                                       └──────────────────┘
```

## Contract 1 — CrossSignVerifier (`verifier/src/lib.rs`)

Responsibilities:

- **`build_challenge(pubKey, nonce, expires) → string`** — returns the exact
  canonical message for a wallet to sign (a `view`; anyone can call it to
  double-check what the contract will verify).
- **`verify_signature(pubKey, signature, message) → bool`** — pure on-chain
  Ed25519 verification (`ed25519-dalek`), no state changes.
- **`verify_and_issue(pubKey, nonce, expires, signature, originNetwork)`** —
  the main entrypoint. Enforces, in order:
  1. caller not already verified (`AlreadyVerified`)
  2. key/signature lengths (32 / 64 bytes)
  3. nonce format (8–64 chars, `[A-Za-z0-9_-]`)
  4. nonce not already used (`keccak256(nonce)` lookup)
  5. expiry window: `now < expires <= now + 3600s`
  6. Ed25519 verification of the **reconstructed** canonical message
  7. registry call to issue the badge (whole tx reverts on failure)
- **Reads** — `is_verified(account)`, `verification_of(account) → Verification`,
  `nonce_used(nonce)`, `chain_id()`, `verifier_address()`,
  `verification_count()`.
- **Admin** — `set_badge_registry(addr)` (owner only).
- **Events** — `VerificationRequested(wallet, pubKey, nonce, expires)`,
  `WalletVerified(wallet, badgeId, pubKey, verifiedAt)`.

### Canonical message

```
CROSSSIGN_VERIFY
action=verify_wallet
domain=crosssign.verification
chain=<decimal chain id>
contract=0x<40 lowercase hex>
wallet=0x<64 lowercase hex>
nonce=<nonce>
expires=<decimal unix seconds>
```

The contract builds this with `self.vm().chain_id()` and
`self.vm().contract_address()`, so the binding to "this chain, this contract"
is enforced by the contract itself. The frontend mirrors it in
`lib/canonical.ts`; byte-compatibility is guarded by a fixture test on both
sides (`canonical_message_fixture_matches_spec` + `scripts/check-canonical.mjs`).

## Contract 2 — CrossSignBadgeRegistry (`registry/src/lib.rs`)

Responsibilities:

- **`issue(recipient, pubKey, originNetwork)`** — mints a soulbound badge.
  Callable only by the configured issuer (the verifier) or the owner.
- **Non-transferable by construction** — there is no `transfer` /
  `transferFrom` / `safeTransferFrom` function at all.
- **Reads** — `badge(id)`, `badge_of(address)`, `is_issued(address)`,
  `badge_count()`, `issuer()`, `owner()`.
- **Admin** — `set_issuer(addr)`, `revoke(id)` (owner only; revoke deactivates
  but keeps the address marked so it cannot re-verify).
- **Event** — `BadgeIssued(owner, badgeId, pubKey, originNetwork)`.

### Why not ERC-721?

A badge is a plain registry record, not a transferable token. Removing the
transfer path entirely eliminates the entire class of soulbound-token transfer
loopholes instead of trying to override `safeTransferFrom` correctly. Fewer
moving parts, smaller audit surface.

## Identity model

A verification record stores:

| Field | Meaning |
|---|---|
| `owner` | Arbitrum address that submitted the proof |
| `public_key` | the 32-byte Ed25519 key that signed (stored in the clear — see SECURITY.md §Privacy) |
| `origin_network` | e.g. `mainnet-beta` |
| `destination_network` | e.g. `arbitrum-sepolia` (set at deploy) |
| `chain_id` | destination chain id |
| `verified_at` | block timestamp |
| `badge_id` | the registry badge id |
| `active` | false after revoke |

CrossSign deliberately does **not** assert the wallet maps to a human, KYC
status, or financial reputation.

## Backend / API (web app, `app/api/*`)

The backend is a convenience/indexing layer only:

- `GET /api/challenge` — issues a nonce + canonical message.
- `POST /api/verify/prepare` — returns the calldata for `verify_and_issue`
  (does **not** verify the signature, does **not** submit).
- `GET /api/verification/:address`, `GET /api/badge/:id` — read-on-chain
  helpers.

**The signature is only ever verified inside the Stylus contract.** The
backend can go away and the protocol still works.

## Data flow (happy path)

1. `GET /api/challenge?wallet=0x…` (or build locally) → `{nonce, expires, message}`.
2. Phantom signs `message` → base58 signature.
3. Frontend decodes base58 → hex, calls `verify_and_issue` via the Arbitrum wallet.
4. Verifier: rebuild message → `ed25519_dalek::Verifier::verify` → burn nonce → `registry.issue`.
5. Registry: mint soulbound badge → `BadgeIssued`.
6. Frontend reads `verification_of(owner)` and renders the proof + badge.

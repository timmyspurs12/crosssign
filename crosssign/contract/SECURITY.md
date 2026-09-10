# CrossSign — Security

A structured review of the protocol's security properties, assumptions, and
limitations. Passing tests is **not** treated as proof of security; the
reasoning is documented here.

## Threat model

- **Adversary goals:** mint a badge without controlling the claimed wallet,
  replay a proof, transfer/steal a badge, forge a verification, DoS the flow.
- **Trusted:** the deployer (owner) and the verifier contract.
- **Untrusted:** everyone else, including the user, the frontend, and any
  backend relay.

## What is enforced on-chain

| Attack | Mitigation |
|---|---|
| Replay (same signature twice) | Nonce is single-use (`keccak256(nonce)` burned on success). A reused nonce reverts before signature checks. |
| Cross-chain replay | Message binds `chain=<id>`; contract rebuilds with `self.vm().chain_id()`. |
| Cross-contract replay | Message binds `contract=<address>`; contract rebuilds with its own `contract_address()`. |
| Cross-product replay | `CROSSSIGN_VERIFY` magic + `domain=crosssign.verification`. |
| Expired challenge | Contract rejects `expires <= block.timestamp`. |
| Far-future challenge (nonce squatting) | Contract rejects `expires > now + 3600s`. |
| Duplicate badge | Verifier rejects if already verified; registry rejects one-badge-per-address. |
| Unauthorized mint | Registry allows only the configured issuer / owner to call `issue`. |
| Badge transfer | Impossible — no transfer function exists in the registry. |
| Malformed input | Length checks (32-byte key, 64-byte signature), nonce format validation, hex-free (raw bytes only). |
| Badge forgery via second key | One badge per Arbitrum address, so a second key cannot mint an additional badge. |
| Integer overflow | Timestamps compare as `u64`; `badge_count` is `U256` with checked-style `+1` from a bounded predecessor. No unchecked arithmetic on untrusted input. |

## Ordering rationale

`verify_and_issue` checks, in order: **already-verified → lengths → nonce
format → nonce reuse → expiry → signature**. Cheap checks run first (fail fast,
less gas for attackers to burn). Nonce reuse is checked *before* the signature
so a known-used nonce cannot be used as a signature oracle.

## Signature malleability

Ed25519 (RFC 8032) has no `s`-flipping malleability the way secp256k1 does, and
`ed25519-dalek`'s `verify` performs full equation checks. The signature is
bound to a single message and a single nonce, and the nonce is burned, so even
a malleable variant of the same signature cannot be replayed.

## Timestamp manipulation

The contract uses `block.timestamp` only to bound a challenge's lifetime
(`now < expires <= now + 3600s`). A miner/sequencer skewing the timestamp can
only make a challenge *expire early* (fail-closed) or reject an overly-future
expiry; it cannot extend validity, because `expires` is fixed in the signed
message and the nonce is single-use.

## Key handling

- The 32-byte public key is validated for length and decoded strictly
  (`VerifyingKey::from_bytes`), so compressed/expanded-key edge cases fail
  closed.
- **Privacy trade-off (documented limitation):** the full public key is stored
  in the clear. This is the simplest verifiable design and matches the "public
  verification" goal, but it means badge ↔ Solana key linkage is public. A
  future privacy mode would store `keccak256(pubkey ‖ domain)` and prove
  preimages off-chain.

## Authorization

- Registry `issue`: `msg.sender ∈ {issuer, owner}`.
- Registry `set_issuer` / `revoke`: owner only.
- Verifier `set_badge_registry`: owner only.
- Owner is the deployer (`tx_origin` at construction — chosen to be robust to
  factory-based deployment; note this trusts the deploy transaction's
  origin).

## Upgrade / mutability assumptions

Contracts are immutable (no proxy). The only mutability is pointer-level:
`set_issuer` and `set_badge_registry`, both owner-only. This means a logic bug
cannot be patched — a redeploy + re-point would be required. Accepted as a
feature (auditability) for a buildathon; documented as a limitation.

## Known limitations / residual risks

1. **Gas cost unmeasured** (§10 of README) — cost assumptions are theoretical
   until deployed.
2. **No Solana-side revocation** — if a user's Solana key is compromised, an
   attacker controlling that key could verify *first* and claim the badge.
   (Badge goes to the *Arbitrum* submitter, so the attacker would also need to
   front-run the same Arbitrum address. A future version could add a
   "proof-of-prior-ownership" grace window.)
3. **Front-running the badge claim** — the badge is issued to `msg.sender` of
   the verification tx. A third party who obtains a victim's valid signature
   could submit it first and claim the badge for their own Arbitrum address.
   Mitigations to consider: require the submission `from` address to be
   committed inside the challenge message (adds an `arbitrum=<address>` line).
4. **One badge per address forever** — revoke deactivates but blocks re-issue.
5. **Public-key linkage** — see §Privacy.
6. **Test coverage of the cross-contract call** is unit-level (mocked
   calldata); the verifier→registry integration is validated on-chain
   post-deployment.

## What this protocol is NOT

Not KYC, not identity, not a credit score, not a claim that a human exists.
It proves one thing: **control of a specific wallet key was demonstrated.**

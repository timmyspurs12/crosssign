# CrossSign — demo video script & scene timeline

**Runtime 3:22** · 398 spoken words ≈ 2:39 of speech at ~150 wpm + 43s of intentional slack for wallet confirmations.
Record the screen first, then lay the voiceover over it — the slack is there so the narration never fights the wallet popups.

> **Pacing note:** 150 wpm is a confident, unhurried technical pace. Below ~140 wpm the video drifts past 3:30; if you speak slower, cut Scene 10 (security) from 49 to ~30 words.

---

## 0. Before you record (do these first)

1. **Run one real verification and keep the transaction hash.** The demo's payoff is the on-chain proof scene, and it only works with a transaction that actually reached the verifier. A previous attempt (`0xb2d2e037…`) was sent to the **zero address** because that build had `NEXT_PUBLIC_VERIFIER_ADDRESS` unset — it succeeded as a no-op with no logs, so it can never be shown as proof.
   - Verifier: `0x39db2d89cEb5b3F312C7A37459C39dA05E251d2e` (confirmed live: `crosssign.vercel.app/api/challenge` returns `contract=0x39db2d89…`)
   - Registry: `0x2862cbdc406546e457a8eb493708613fd9f7c8ac`
2. **Confirm the verifier is authorised to mint** (otherwise `verify_and_issue` reverts `Unauthorized` at the mint step):

   ```bash
   node -e "const {JsonRpcProvider,Contract}=require('ethers');const p=new JsonRpcProvider('https://sepolia-rollup.arbitrum.io/rpc');(async()=>{const r=new Contract('0x2862cbdc406546e457a8eb493708613fd9f7c8ac',['function issuer() view returns (address)','function badge_count() view returns (uint256)'],p);console.log('issuer =',await r.issuer());console.log('badges =',(await r.badge_count()).toString());})()"
   ```
   `issuer` must be the verifier address. If it isn't:
   `PRIVATE_KEY=0x… node scripts/chain-admin.mjs set-issuer 0x2862cbdc406546e457a8eb493708613fd9f7c8ac 0x39db2d89ceb5b3f312c7a37459c39da05e251d2e`
3. **A successful run must show all four:** `To = verifier`, Method `verify_and_issue`, a **`WalletVerified`** log, and a **Contract** row in the app that is *not* `0x000…0000`.
4. Clean browser profile with **only** Phantom + your Arbitrum wallet installed. Hide the bookmarks bar, close other tabs, silence notifications.
5. **Revoke CrossSign's site connection in Phantom** (Settings → Connected apps) so the connect step is visible on camera.
6. Arbitrum wallet already on **Arbitrum Sepolia** with test ETH, no pending transactions.
7. Open the app and **pre-connect the Arbitrum wallet** so the row reads `Ready · Arbitrum Sepolia`. **Do not reload after this** — a reload clears that session.
8. Keep the **Live** toggle selected. Never record the "Interactive demo" mode (it is labelled *Simulation* and makes a fake hash).
9. 1920×1080, 100% zoom, maximised window, light theme. Tabs: (1) app `/`, (2) `/verify`, (3) Arbiscan tx page, (4) verifier contract page.

---

## 1. Timeline at a glance

| # | Scene | Start | End | Words | Speech | Slack |
|---|---|---|---|---|---|---|
| 1 | Problem | 0:00 | 0:13 | 28 | 11.2s | 2s |
| 2 | What CrossSign is | 0:13 | 0:29 | 34 | 13.6s | 2s |
| 3 | Connect | 0:29 | 0:48 | 36 | 14.4s | 5s |
| 4 | Fresh challenge | 0:48 | 1:06 | 37 | 14.8s | 3s |
| 5 | Sign | 1:06 | 1:25 | 29 | 11.6s | 7s |
| 6 | Verify on-chain | 1:25 | 1:47 | 35 | 14.0s | 8s |
| 7 | Complete | 1:47 | 2:04 | 37 | 14.8s | 3s |
| 8 | Credential | 2:04 | 2:22 | 36 | 14.4s | 3s |
| 9 | Arbiscan proof | 2:22 | 2:45 | 49 | 19.6s | 4s |
| 10 | Security design | 2:45 | 3:08 | 49 | 19.6s | 3s |
| 11 | Close | 3:08 | 3:22 | 28 | 11.2s | 3s |

---

## 2. Scene by scene

### Scene 1 — Problem · 0:00–0:13
- **Screen:** landing page (`/`), hero in view.
- **Do:** nothing. Move the mouse into frame once, then hold it still at the bottom-left.
- **Visible:** wordmark, hero headline, eyebrow "CROSS-CHAIN IDENTITY · ARBITRUM STYLUS", buttons "Verify a wallet" / "Explore how it works".
- **On-screen text:** `CROSS-CHAIN IDENTITY · ARBITRUM STYLUS`
- **Voice:** "Most wallet verification today asks you to trust a bridge, an oracle, or a backend. CrossSign asks for something smaller: one signature from the wallet you already own."
- **Transition:** straight cut to the `/verify` tab.

### Scene 2 — What CrossSign is · 0:13–0:29
- **Screen:** landing page, one smooth scroll to the "Four steps. One proof." strip.
- **Do:** one wheel scroll of about a screen; stop before the voice ends.
- **Visible:** Connect → Sign → Verify on-chain → Badge issued, with "Ed25519 signature", "Arbitrum Stylus", "Badge issued".
- **On-screen text:** `CONNECT → SIGN → VERIFY ON-CHAIN → BADGE`
- **Voice:** "CrossSign is a cross-wallet verification layer. It proves that a user controls a wallet by checking a live cryptographic signature on-chain, so any app can read one verified record instead of trusting a database."
- **Transition:** click "Verify a wallet" in the header.

### Scene 3 — Connect · 0:29–0:48
- **Screen:** `/verify` — "Verify your wallet", Live toggle, step indicator (Connect → Sign → Verify → Badge).
- **Do:** click **Connect Solana wallet** → click the **Phantom** row in the selector → approve in Phantom if prompted.
- **Visible:** wallet selector rows; the "Arbitrum wallet · Ready · Arbitrum Sepolia" row; after connecting, the wallet card with the truncated Solana key and status **Ready to sign**.
- **On-screen text:** `WALLET STANDARD — PHANTOM · SOLFLARE · BACKPACK · OKX`
- **Voice:** "I'll verify a Solana wallet. CrossSign speaks the Wallet Standard, so Phantom, Solflare, Backpack and OKX all work the same way. I pick Phantom, and CrossSign re-reads that account's current public key before anything is signed."
- **Transition:** the challenge panel appears.

### Scene 4 — Fresh challenge · 0:48–1:06
- **Screen:** the canonical challenge panel on `/verify`.
- **Do:** hover over the message, don't scroll. Add a slow zoom in post.
- **Visible:** the 8-line message — `CROSSSIGN_VERIFY`, `action=verify_wallet`, `domain=crosssign.verification`, `chain=421614`, `contract=<verifier>`, `wallet=0x…`, `nonce=…`, `expires=…`. The `contract=` line must show the verifier address, never `0x0000…`.
- **On-screen text:** `BOUND INTO THE MESSAGE: chain · contract · wallet · nonce · expiry`
- **Voice:** "CrossSign mints a fresh challenge: a nonce, an expiry, the chain, the verifier contract, and the wallet's public key, all bound into one canonical message. That binding is what stops a proof from being replayed somewhere else."
- **Transition:** click "Sign verification".

### Scene 5 — Sign · 1:06–1:25
- **Screen:** Phantom signature prompt, then the app's "Waiting for signature…" state.
- **Do:** click "Sign verification" → in Phantom click **Sign/Approve** (message signature, no fee) → return to the browser. Seven seconds of slack here — let the prompt sit on screen.
- **Visible:** Phantom showing the same challenge text; afterwards the "Verification in progress" sequence (Signature received → Ed25519 check → Arbitrum Stylus → Identity verified), right label "Arbitrum · Sepolia".
- **On-screen text:** `MESSAGE SIGNATURE — NOT A TRANSACTION · NO FUNDS MOVE`
- **Voice:** "I approve the signature in Phantom. This is an Ed25519 signature over that exact message. It is not a transaction. Nothing is approved for spending, and no funds move."
- **Transition:** the Arbitrum wallet pops for the on-chain transaction.

### Scene 6 — Verify on-chain · 1:25–1:47
- **Screen:** Arbitrum wallet confirmation for `verify_and_issue`, then the staged list in the app.
- **Do:** confirm the transaction. Keep the mouse still. The network field must read **Arbitrum Sepolia**.
- **Visible:** gas ≈ 0.000006 ETH, `To:` = the verifier contract, then the staged checks completing.
- **On-screen text:** `RUST → WASM · STYLUS ED25519 · ARBITRUM SEPOLIA`
- **Voice:** "The signature goes to Arbitrum Sepolia, where CrossSign runs as a Stylus contract written in Rust. Arbitrum's Rust VM verifies Ed25519 natively, which the EVM cannot do. I confirm the transaction from my Arbitrum wallet."
- **Transition:** the success card renders.

### Scene 7 — Complete · 1:47–2:04
- **Screen:** "Identity verified" success card on `/verify`.
- **Do:** nothing. Let the badge animation land.
- **Visible:** badge graphic, "Solana wallet ownership verified on Arbitrum.", rows Wallet · Network · Verification time · Transaction · **Contract** (verifier address, not `0x0000…`).
- **On-screen text:** `NONCE BURNED · SOULBOUND BADGE ISSUED`
- **Voice:** "On-chain, the verifier rebuilds the exact challenge, checks the signature, burns the nonce so it can never be replayed, and issues a non-transferable badge through the registry. Ownership is now verified on-chain, not asserted by a server."
- **Transition:** click "View verification".

### Scene 8 — Credential · 2:04–2:22
- **Screen:** `/badge?proof=…` credential page.
- **Do:** one short scroll to the "Proof" strip, then stop.
- **Visible:** credential details (wallet, ecosystem, method `Ed25519 (Solana)`, timestamp, tx hash, contract), "Active" tag, and the proof strip: Solana wallet → CrossSign verifier "Arbitrum · Stylus" → Badge issued.
- **On-screen text:** `PROOF OF KEY CONTROL ≠ REAL-WORLD IDENTITY`
- **Voice:** "This is the credential: the wallet, the origin network, the verification method, the transaction, and the verifier contract. It proves control of that key, not real-world identity, and CrossSign states that distinction in the product itself."
- **Transition:** cut to the Arbiscan tab.

### Scene 9 — On-chain proof · 2:22–2:45
- **Screen:** Arbiscan **transaction** page for your *new* verification transaction.
- **Do:** scroll slowly to Overview / Transaction Action, then stop. In post, slow-zoom on `To`, on Method `verify_and_issue`, and on the **Logs** row with `WalletVerified`. Optionally cut to the verifier's contract page showing the "Stylus Contract" label.
- **Visible:** Status Success · To = verifier · Method `verify_and_issue` · `WalletVerified` log with wallet, badge id, public key, verified_at.
- **On-screen text:** `TO: <verifier> · verify_and_issue · EVENT: WalletVerified`
- **Voice:** "Here is the same verification on Arbiscan. Status, success. The transaction calls the CrossSign verifier, the method is verify_and_issue, and the logs carry a WalletVerified event with the public key and the badge id. The proof lives on-chain, so you don't have to take the app's word for it."
- **Transition:** cut back to the app.

### Scene 10 — Security design · 2:45–3:08
- **Screen:** back on `/verify` with the challenge panel visible (or the success card).
- **Do:** nothing; optional 2s zoom on the `nonce=` and `expires=` lines.
- **Visible:** the canonical message, ideally with all four steps complete.
- **On-screen text:** `FRESH CHALLENGE · LIVE ACCOUNT RE-READ · NONCE BURN · REPLAY REJECTED`
- **Voice:** "Every attempt mints a new challenge, and an expired one is never submitted. CrossSign re-reads the wallet's current account before signing, so an account switch mid-flow is detected rather than accepted. In-flight attempts are keyed to the attempt that started them, and the contract rejects a reused nonce outright."
- **Transition:** fade to close.

### Scene 11 — Close · 3:08–3:22
- **Screen:** badge / success card, then a clean end card.
- **Do:** nothing (end card is an editor overlay).
- **Visible:** the CrossSign badge; end card with repo URL.
- **On-screen text:** `CROSSSIGN — IDENTITY ACROSS CHAINS` + `github.com/timmyspurs12/crosssign`
- **Voice:** "That's CrossSign. One signature, verified in Rust on Arbitrum, with multi-chain support starting from Solana. Cross-chain identity doesn't need a bridge. It needs proof that anyone can check."
- **Transition:** end.

---

## 3. Voiceover only (paste this into the TTS tool)

```text
Most wallet verification today asks you to trust a bridge, an oracle, or a backend. CrossSign asks for something smaller: one signature from the wallet you already own.

CrossSign is a cross-wallet verification layer. It proves that a user controls a wallet by checking a live cryptographic signature on-chain, so any app can read one verified record instead of trusting a database.

I'll verify a Solana wallet. CrossSign speaks the Wallet Standard, so Phantom, Solflare, Backpack and OKX all work the same way. I pick Phantom, and CrossSign re-reads that account's current public key before anything is signed.

CrossSign mints a fresh challenge: a nonce, an expiry, the chain, the verifier contract, and the wallet's public key, all bound into one canonical message. That binding is what stops a proof from being replayed somewhere else.

I approve the signature in Phantom. This is an Ed25519 signature over that exact message. It is not a transaction. Nothing is approved for spending, and no funds move.

The signature goes to Arbitrum Sepolia, where CrossSign runs as a Stylus contract written in Rust. Arbitrum's Rust VM verifies Ed25519 natively, which the EVM cannot do. I confirm the transaction from my Arbitrum wallet.

On-chain, the verifier rebuilds the exact challenge, checks the signature, burns the nonce so it can never be replayed, and issues a non-transferable badge through the registry. Ownership is now verified on-chain, not asserted by a server.

This is the credential: the wallet, the origin network, the verification method, the transaction, and the verifier contract. It proves control of that key, not real-world identity, and CrossSign states that distinction in the product itself.

Here is the same verification on Arbiscan. Status, success. The transaction calls the CrossSign verifier, the method is verify_and_issue, and the logs carry a WalletVerified event with the public key and the badge id. The proof lives on-chain, so you don't have to take the app's word for it.

Every attempt mints a new challenge, and an expired one is never submitted. CrossSign re-reads the wallet's current account before signing, so an account switch mid-flow is detected rather than accepted. In-flight attempts are keyed to the attempt that started them, and the contract rejects a reused nonce outright.

That's CrossSign. One signature, verified in Rust on Arbitrum, with multi-chain support starting from Solana. Cross-chain identity doesn't need a bridge. It needs proof that anyone can check.
```

**TTS settings that suit this script:** speed `1.0` (do not speed up — the slack is planned), stability moderate, one consistent voice. Generate each paragraph separately so you can re-roll a single scene without rebuilding the whole track.

---

## 4. Do not say / do not show

- **No "Solidity"** — the contracts are Rust → WASM on Stylus. The repo has zero `.sol` files.
- **No gas-savings number.** The landing page says "~10–50× cheaper"; `contract/README.md` states gas is **not yet measured**. Either measure it (`bash contract/scripts/benchmark.sh`) or keep the video's claim to "the EVM cannot do this natively".
- **No "audited"**, no "battle-tested", no token/investor talk.
- **Don't show the zero-address transaction.** A judge who clicks `To` sees `0x0000…0000`.
- **Don't show terminal, GitHub, editor, or debug output.** Screen = product only.
- Keep the "Interactive demo" tab out of frame; if you must use it, say on mic that it is a simulation.

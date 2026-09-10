// Cross-language canonical-message compatibility check.
//
// The Rust contract has an identical fixture test:
//   contract/verifier/src/lib.rs  →  canonical_message_fixture_matches_spec
// Both sides must produce the exact same bytes or on-chain verification fails.
//
// Run:  node scripts/check-canonical.mjs

function canonicalVerificationMessage({ chainId, contract, wallet, nonce, expires }) {
  const norm = (v, n) => {
    const s = v.replace(/^0x/i, "").toLowerCase();
    if (s.length !== n * 2 || !/^[0-9a-f]*$/.test(s)) throw new Error(`bad hex (${v})`);
    return `0x${s}`;
  };
  return [
    "CROSSSIGN_VERIFY",
    "action=verify_wallet",
    "domain=crosssign.verification",
    `chain=${chainId}`,
    `contract=${norm(contract, 20)}`,
    `wallet=${norm(wallet, 32)}`,
    `nonce=${nonce}`,
    `expires=${expires}`,
  ].join("\n");
}

// Fixture identical to the Rust test.
const wallet = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join("");
const message = canonicalVerificationMessage({
  chainId: 421614,
  contract: "0x1234567890123456789012345678901234567890",
  wallet: `0x${wallet}`,
  nonce: "ab12cd34ef56",
  expires: 1728000000,
});

const expected =
  "CROSSSIGN_VERIFY\n" +
  "action=verify_wallet\n" +
  "domain=crosssign.verification\n" +
  "chain=421614\n" +
  "contract=0x1234567890123456789012345678901234567890\n" +
  "wallet=0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\n" +
  "nonce=ab12cd34ef56\n" +
  "expires=1728000000";

const hex = Buffer.from(message, "utf8").toString("hex");
console.log("message hex:", hex);

if (message === expected) {
  console.log("PASS — JS canonical message matches the Rust fixture byte-for-byte.");
  process.exit(0);
} else {
  console.error("FAIL — mismatch vs Rust fixture.");
  console.error("JS:    ", JSON.stringify(message));
  console.error("Rust:  ", JSON.stringify(expected));
  process.exit(1);
}

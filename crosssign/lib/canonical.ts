/**
 * Canonical CrossSign challenge message.
 *
 * This must produce BYTE-IDENTICAL output to the Rust `canonical_message`
 * in `contract/verifier/src/lib.rs`. The contract reconstructs this exact
 * message and verifies the signature over it, so any divergence here makes
 * every verification fail on-chain.
 *
 * A self-check lives in `scripts/check-canonical.mjs` (run it anytime):
 *   node scripts/check-canonical.mjs
 */

export const CROSSSIGN_MAGIC = "CROSSSIGN_VERIFY";
export const CROSSSIGN_ACTION = "verify_wallet";
export const CROSSSIGN_DOMAIN = "crosssign.verification";
export const CROSSSIGN_MAX_TTL_SECONDS = 3600;
export const CROSSSIGN_NONCE_MIN = 8;
export const CROSSSIGN_NONCE_MAX = 64;

export interface CanonicalChallenge {
  /** Chain id of the destination chain, decimal (e.g. 421614 = Sepolia). */
  chainId: number;
  /** Verifier contract address, 0x + 40 lowercase hex. */
  contract: string;
  /** Wallet public key, 0x + 64 lowercase hex (32 bytes). */
  wallet: string;
  /** URL-safe nonce, 8–64 chars of [A-Za-z0-9_-]. */
  nonce: string;
  /** Unix timestamp in seconds. */
  expires: number;
}

function normalizeHex(value: string, byteLen: number): string {
  const s = value.replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]*$/.test(s) || s.length !== byteLen * 2) {
    throw new Error(`expected ${byteLen * 2} lowercase hex chars`);
  }
  return `0x${s}`;
}

/**
 * Build the canonical message. Line order and separators are part of the
 * protocol — do not reorder:
 *
 *   CROSSSIGN_VERIFY
 *   action=verify_wallet
 *   domain=crosssign.verification
 *   chain=<decimal>
 *   contract=0x<40 hex>
 *   wallet=0x<64 hex>
 *   nonce=<nonce>
 *   expires=<decimal>
 */
export function canonicalVerificationMessage(p: CanonicalChallenge): string {
  return [
    CROSSSIGN_MAGIC,
    `action=${CROSSSIGN_ACTION}`,
    `domain=${CROSSSIGN_DOMAIN}`,
    `chain=${p.chainId}`,
    `contract=${normalizeHex(p.contract, 20)}`,
    `wallet=${normalizeHex(p.wallet, 32)}`,
    `nonce=${p.nonce}`,
    `expires=${p.expires}`,
  ].join("\n");
}

export function isValidNonce(nonce: string): boolean {
  return (
    nonce.length >= CROSSSIGN_NONCE_MIN &&
    nonce.length <= CROSSSIGN_NONCE_MAX &&
    /^[A-Za-z0-9_-]+$/.test(nonce)
  );
}

/** Generate a contract-acceptable nonce (24 hex chars). */
export function generateNonce(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

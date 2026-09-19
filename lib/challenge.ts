import { canonicalVerificationMessage, generateNonce } from "@/lib/canonical";
import {
  CHALLENGE,
  CONTRACTS,
  NETWORK,
  assertContractsConfigured,
} from "@/lib/config";
import type { VerificationChallenge } from "@/types";

/**
 * Build a CrossSign verification challenge bound to the wallet public key.
 *
 * The wallet's 32-byte Ed25519 public key (as 0x-hex) is part of the message,
 * so the challenge can only be built after the wallet connects.
 *
 * The live browser flow calls this directly; no server challenge is fetched.
 * `GET /api/challenge` is an unused optional helper for the same canonical
 * format. The Stylus verifier reconstructs the bytes and enforces the rules.
 */
export function buildChallenge(walletHex: string): VerificationChallenge {
  // The verifier address is BOUND INTO the signed message. If it is not
  // configured, the message would bind 0x0 — a challenge the deployed verifier
  // could never accept (it rebuilds the message with its own address). Refuse
  // before asking the user to sign anything.
  assertContractsConfigured();

  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);
  const expires = now + CHALLENGE.ttlSeconds;

  const message = canonicalVerificationMessage({
    chainId: NETWORK.chainId,
    contract: CONTRACTS.verifier,
    wallet: walletHex,
    nonce,
    expires,
  });

  return {
    message,
    nonce,
    expires,
    expiresAt: expires * 1000,
    domain: CHALLENGE.domain,
    chainId: NETWORK.chainId,
    contract: CONTRACTS.verifier,
    wallet: walletHex,
  };
}

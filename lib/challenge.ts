import { canonicalVerificationMessage, generateNonce } from "@/lib/canonical";
import { CHALLENGE, CONTRACTS, NETWORK } from "@/lib/config";
import type { VerificationChallenge } from "@/types";

/**
 * Build a CrossSign verification challenge bound to the wallet public key.
 *
 * The wallet's 32-byte Ed25519 public key (as 0x-hex) is part of the message,
 * so the challenge can only be built after the wallet connects.
 *
 * This mirrors what the backend serves from `GET /api/challenge` — the exact
 * same canonical bytes the Stylus verifier reconstructs on-chain.
 */
export function buildChallenge(walletHex: string): VerificationChallenge {
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

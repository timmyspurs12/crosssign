import { NextResponse } from "next/server";
import { canonicalVerificationMessage, generateNonce } from "@/lib/canonical";
import { CHALLENGE, CONTRACTS, NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenge?wallet=0x<64 hex>
 *
 * Generates a CrossSign challenge for a wallet public key. The backend only
 * issues nonces and formats the canonical message — it performs NO
 * cryptographic verification. The signature is verified on-chain by the
 * Stylus verifier.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = (url.searchParams.get("wallet") ?? "").toLowerCase();

  if (!/^0x[0-9a-f]{64}$/.test(wallet)) {
    return NextResponse.json(
      { error: "wallet must be a 32-byte public key as 0x + 64 hex chars" },
      { status: 400 },
    );
  }

  const nonce = generateNonce();
  const now = Math.floor(Date.now() / 1000);
  const expires = now + CHALLENGE.ttlSeconds;

  const message = canonicalVerificationMessage({
    chainId: NETWORK.chainId,
    contract: CONTRACTS.verifier,
    wallet,
    nonce,
    expires,
  });

  return NextResponse.json({
    nonce,
    expires,
    message,
    domain: CHALLENGE.domain,
    chainId: NETWORK.chainId,
    contract: CONTRACTS.verifier,
  });
}

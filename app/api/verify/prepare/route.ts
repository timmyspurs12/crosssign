import { NextResponse } from "next/server";
import { Interface, getBytes } from "ethers";
import { VERIFIER_ABI } from "@/lib/contract-abi";
import { canonicalVerificationMessage } from "@/lib/canonical";
import { CONTRACTS, NETWORK } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/verify/prepare
 *
 * Body: { publicKey, nonce, expires, signature, originNetwork }
 * (publicKey/signature are 0x-hex; expires is unix seconds.)
 *
 * Returns the calldata the user's Arbitrum wallet must send to the verifier,
 * plus the reconstructed message so the client can confirm what the contract
 * will verify. This route only *formats* the transaction — it does not verify
 * the signature (that happens on-chain) and it does not submit anything.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const publicKey = String(body.publicKey ?? "").toLowerCase();
  const signature = String(body.signature ?? "").toLowerCase();
  const nonce = String(body.nonce ?? "");
  const expires = Number(body.expires);
  const originNetwork = String(body.originNetwork ?? "mainnet-beta");

  if (!/^0x[0-9a-f]{64}$/.test(publicKey)) {
    return NextResponse.json({ error: "publicKey must be 0x + 64 hex" }, { status: 400 });
  }
  if (!/^0x[0-9a-f]{128}$/.test(signature)) {
    return NextResponse.json({ error: "signature must be 0x + 128 hex" }, { status: 400 });
  }
  if (!nonce || !Number.isInteger(expires) || expires <= 0) {
    return NextResponse.json({ error: "nonce and integer expires are required" }, { status: 400 });
  }

  const iface = new Interface([...VERIFIER_ABI]);
  const data = iface.encodeFunctionData("verifyAndIssue", [
    Array.from(getBytes(publicKey)),
    nonce,
    expires,
    Array.from(getBytes(signature)),
    originNetwork,
  ]);

  const message = canonicalVerificationMessage({
    chainId: NETWORK.chainId,
    contract: CONTRACTS.verifier,
    wallet: publicKey,
    nonce,
    expires,
  });

  return NextResponse.json({
    to: CONTRACTS.verifier,
    data,
    value: "0",
    chainId: NETWORK.chainId,
    message,
  });
}

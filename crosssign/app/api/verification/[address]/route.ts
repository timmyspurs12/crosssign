import { NextResponse } from "next/server";
import { readVerification } from "@/lib/chain/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/verification/:address
 *
 * Convenience read endpoint — returns the on-chain verification record for an
 * Arbitrum address. Purely informational; the contract is the source of truth.
 */
export async function GET(
  _req: Request,
  { params }: { params: { address: string } },
) {
  const address = params.address?.toLowerCase() ?? "";

  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "invalid Arbitrum address" },
      { status: 400 },
    );
  }

  try {
    const record = await readVerification(address);
    return NextResponse.json({ address, verified: Boolean(record), record });
  } catch {
    // RPC unavailable or contract not yet deployed — degrade gracefully.
    return NextResponse.json(
      { address, verified: false, record: null, unavailable: true },
      { status: 503 },
    );
  }
}

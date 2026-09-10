import { NextResponse } from "next/server";
import { readBadge } from "@/lib/chain/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/badge/:badgeId
 *
 * Convenience read endpoint — returns an on-chain badge record. Purely
 * informational; the contract is the source of truth.
 */
export async function GET(
  _req: Request,
  { params }: { params: { badgeId: string } },
) {
  const badgeId = params.badgeId ?? "";
  if (!/^\d+$/.test(badgeId)) {
    return NextResponse.json({ error: "badge id must be an integer" }, { status: 400 });
  }

  try {
    const badge = await readBadge(badgeId);
    return NextResponse.json({ badgeId, badge });
  } catch {
    return NextResponse.json(
      { badgeId, badge: null, unavailable: true },
      { status: 503 },
    );
  }
}

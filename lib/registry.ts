import type { ProofRecord, VerificationSource } from "@/types";

/**
 * Proof registry service — a typed seam for the backend.
 *
 * INTEGRATION POINT: replace the in-memory store with:
 *   - POST   /api/verify       → creates + stores the proof
 *   - GET    /api/proofs/:id   → fetch a single proof (explorer page)
 *
 * UI components only ever talk to these functions, never to storage directly.
 *
 * DELIBERATELY SESSION-SCOPED: the store is module memory ONLY. Proof
 * records are never mirrored into browser storage of any kind:
 *
 *   - a completed verification must not resurface after a reload in a way
 *     that suggests a wallet is "connected" or lets a new attempt skip the
 *     wallet selection + signing steps;
 *   - the previously verified address appearing in "recent verifications"
 *     after a user cleared their site data was one source of the
 *     "old wallet came back" confusion — the honest fix is to not persist
 *     it client-side at all;
 *   - proofs are still shareable/persistable via the explicit
 *     `?proof=…` link (serializeProof), which is state the user chose to
 *     carry around, not app-internal state.
 */

const STORE = new Map<string, ProofRecord>();

export function saveProof(proof: ProofRecord): ProofRecord {
  STORE.set(proof.id, proof);
  return proof;
}

export function getProof(id: string): ProofRecord | null {
  return STORE.get(id) ?? null;
}

/** Export a proof for the public explorer page (query-string safe). */
export function serializeProof(proof: ProofRecord): string {
  return encodeURIComponent(JSON.stringify(proof));
}

export function deserializeProof(raw: string): ProofRecord | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ProofRecord>;
    const required: (keyof ProofRecord)[] = [
      "id",
      "status",
      "origin",
      "originNetwork",
      "walletAddress",
      "destination",
      "destinationNetwork",
      "method",
      "verifiedAt",
      "transactionHash",
      "contractAddress",
      "badgeId",
    ];
    for (const key of required) {
      if (typeof parsed[key] !== "string" || !parsed[key]) return null;
    }
    if (parsed.status !== "verified" && parsed.status !== "pending" && parsed.status !== "failed") {
      return null;
    }
    return parsed as ProofRecord;
  } catch {
    return null;
  }
}

/**
 * Recent proofs for the explorer, in-memory only (this page view / this
 * browser session). Read strictly after mount — never during render — so
 * server HTML and the first client render always agree (no hydration
 * mismatch from a list that only exists in the browser).
 */
export function latestProofs(limit = 4): ProofRecord[] {
  return [...STORE.values()].slice(-limit).reverse();
}

export function isDemo(proof: ProofRecord): boolean {
  return proof.source === "demo";
}

export const SOURCE_LABEL: Record<VerificationSource, string> = {
  live: "On-chain",
  demo: "Interactive demo",
};

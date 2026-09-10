import type { ProofRecord, VerificationSource } from "@/types";

/**
 * Proof registry service — a typed seam for the backend.
 *
 * INTEGRATION POINT: replace the in-memory store with:
 *   - POST   /api/verify       → creates + stores the proof
 *   - GET    /api/proofs/:id   → fetch a single proof (explorer page)
 *
 * UI components only ever talk to these functions, never to storage directly.
 */

const STORE = new Map<string, ProofRecord>();
const LS_KEY = "crosssign.proofs";

/**
 * Proof registry service — a typed seam for the backend.
 *
 * INTEGRATION POINT: replace the in-memory store with:
 *   - POST   /api/verify       → creates + stores the proof
 *   - GET    /api/proofs/:id   → fetch a single proof (explorer page)
 *
 * UI components only ever talk to these functions, never to storage directly.
 * The localStorage mirror is a temporary adapter so "recent verifications"
 * survive navigation in the demo build.
 */

function loadLocal(): ProofRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as ProofRecord[]) : [];
  } catch {
    return [];
  }
}

function persistLocal(list: ProofRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* storage may be unavailable (private mode) — ignore */
  }
}

export function saveProof(proof: ProofRecord): ProofRecord {
  STORE.set(proof.id, proof);
  const list = [...loadLocal().filter((p) => p.id !== proof.id), proof].slice(-20);
  persistLocal(list);
  return proof;
}

export function getProof(id: string): ProofRecord | null {
  return STORE.get(id) ?? loadLocal().find((p) => p.id === id) ?? null;
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

export function latestProofs(limit = 4): ProofRecord[] {
  const local = loadLocal();
  const merged = [...local];
  for (const p of STORE.values()) {
    if (!merged.some((m) => m.id === p.id)) merged.push(p);
  }
  return merged.slice(-limit).reverse();
}

export function isDemo(proof: ProofRecord): boolean {
  return proof.source === "demo";
}

export const SOURCE_LABEL: Record<VerificationSource, string> = {
  live: "On-chain",
  demo: "Interactive demo",
};

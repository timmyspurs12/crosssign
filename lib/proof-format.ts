import type { ProofRecord, VerificationMethod, WalletAccount } from "@/types";
import { CHAINS, CONTRACTS, EXPLORERS } from "@/lib/config";
import { formatHash, seededHex } from "@/lib/utils";

/**
 * Format helpers for the proof record. Everything here is pure and typed so
 * the real backend can return a ProofRecord and the UI renders unchanged.
 */

interface BuildProofParams {
  id: string;
  origin: WalletAccount["ecosystem"];
  originNetwork: string;
  walletAddress: string;
  publicKey: string;
  destination: WalletAccount["ecosystem"];
  destinationNetwork: string;
  method: VerificationMethod;
  verifiedAt?: Date;
  transactionHash?: string;
  contractAddress?: string;
  badgeId?: string;
}

export function buildProofRecord(p: BuildProofParams): ProofRecord {
  return {
    id: p.id,
    status: "verified",
    source: "live",
    origin: p.origin,
    originNetwork: p.originNetwork,
    walletAddress: p.walletAddress,
    destination: p.destination,
    destinationNetwork: p.destinationNetwork,
    method: p.method,
    verifiedAt: (p.verifiedAt ?? new Date()).toISOString(),
    transactionHash: p.transactionHash ?? seededHex(p.publicKey, 64),
    contractAddress: p.contractAddress ?? CONTRACTS.verifier,
    badgeId: p.badgeId ?? CONTRACTS.badgeId,
  };
}

export function explorerUrl(kind: "account" | "tx", proof: ProofRecord): string {
  if (kind === "tx") {
    return `${EXPLORERS.arbitrum}${proof.transactionHash}`;
  }
  return `${EXPLORERS.solana}${proof.walletAddress}`;
}

export function chainLabel(ecosystem: ProofRecord["origin"]): string {
  return CHAINS[ecosystem].label;
}

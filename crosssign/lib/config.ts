import type { Ecosystem } from "@/types";

/**
 * Central static config. Anything that would eventually come from an
 * environment variable or on-chain registry lives here so the UI stays pure.
 */

export const BRAND = {
  name: "CrossSign",
  wordmark: "CROSSSIGN",
  tagline: "Identity across chains.",
} as const;

export const SITE = {
  url: "https://crosssign.example",
  buildathonUrl:
    "https://arbitrum-singapore.hackquest.io/buildathons/Arbitrum-Open-House-Singapore-Online-Buildathon",
  buildathonName: "Arbitrum Open House Singapore — Online Buildathon",
} as const;

export const CHAINS: Record<
  Ecosystem,
  { label: string; network: string; short: string }
> = {
  solana: { label: "Solana", network: "Mainnet-Beta", short: "SOL" },
  arbitrum: { label: "Arbitrum", network: "Sepolia", short: "ARB" },
  robinhood: { label: "Robinhood Chain", network: "Testnet", short: "RHC" },
};

export const EXPLORERS = {
  solana: "https://solscan.io/account/",
  arbitrum: "https://sepolia.arbiscan.io/tx/",
  robinhood: "https://explorer.testnet.chain.robinhood.com/tx/",
} as const;

/**
 * Destination network configuration.
 * 421614 = Arbitrum Sepolia (the buildathon demo chain).
 */
export const NETWORK = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 421614),
  destinationNetwork: "arbitrum-sepolia",
} as const;

/**
 * Deployed contract addresses.
 *
 * ⚠️ These are placeholders until you deploy. After deploying (see
 * contract/DEPLOYMENT.md), set:
 *   NEXT_PUBLIC_VERIFIER_ADDRESS=0x…   (CrossSignVerifier)
 *   NEXT_PUBLIC_REGISTRY_ADDRESS=0x…   (CrossSignBadgeRegistry)
 * in the web app's `.env.local`, or replace the fallbacks below.
 */
function envAddress(key: string, fallback: string): string {
  return (process.env[key] ?? fallback).toLowerCase();
}

export const CONTRACTS = {
  verifier: envAddress(
    "NEXT_PUBLIC_VERIFIER_ADDRESS",
    "0x0000000000000000000000000000000000000000",
  ),
  registry: envAddress(
    "NEXT_PUBLIC_REGISTRY_ADDRESS",
    "0x0000000000000000000000000000000000000000",
  ),
  badgeId: "CS-0001",
} as const;

/**
 * Challenge protocol constants — MUST match the verifier contract
 * (contract/verifier/src/lib.rs). The canonical message format is defined in
 * lib/canonical.ts and checked against the Rust fixture by
 * scripts/check-canonical.mjs.
 */
export const CHALLENGE = {
  domain: "crosssign.verification",
  ttlSeconds: 300,
} as const;

export const VERIFICATION_METHOD_LABEL: Record<string, string> = {
  Ed25519: "Ed25519 (Solana)",
  secp256k1: "secp256k1 (EVM)",
};

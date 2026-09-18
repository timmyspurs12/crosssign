/**
 * Ethereum/Arbitrum chain client — the ONLY place the frontend talks to the
 * deployed Stylus contracts.
 *
 * Split into two halves:
 *   - read:  pure JSON-RPC `eth_call`s (no wallet needed)
 *   - write: submit a transaction through the user's injected wallet
 *            (MetaMask etc.) via ethers BrowserProvider.
 *
 * The cryptographic trust stays on-chain: this file only packages calldata
 * and forwards the result. Nothing here "verifies" anything itself.
 */

import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  type Signer,
} from "ethers";

import {
  REGISTRY_ABI,
  VERIFIER_ABI,
  type OnChainBadge,
  type OnChainVerification,
} from "@/lib/contract-abi";
import { CONTRACTS, NETWORK, assertContractsConfigured } from "@/lib/config";
import { getActiveEvmProvider } from "@/lib/wallet/evm";

// ─────────────────────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A BrowserProvider over the EVM wallet the user explicitly connected via
 * the EIP-6963/injected discovery layer (lib/wallet/evm.ts).
 *
 * This deliberately does NOT fall back to a blind `window.ethereum`: with
 * several wallet extensions installed, `window.ethereum` may belong to any
 * one of them (or be a stale multi-provider proxy). On-chain submission must
 * go through the wallet the user chose — if none is connected yet, the UI
 * opens the Arbitrum wallet selector.
 */
export function getBrowserProvider(): BrowserProvider | null {
  const provider = getActiveEvmProvider();
  if (!provider) return null;
  return new BrowserProvider(provider as never);
}

export function getReadProvider(): JsonRpcProvider {
  const rpc = process.env.NEXT_PUBLIC_ARBITRUM_RPC;
  if (rpc) return new JsonRpcProvider(rpc);
  // Public fallback (rate-limited; fine for a buildathon demo).
  return new JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
}

// ─────────────────────────────────────────────────────────────────────────────
// Read API (no wallet required)
// ─────────────────────────────────────────────────────────────────────────────

export async function readIsVerified(
  account: string,
  provider?: JsonRpcProvider,
): Promise<boolean> {
  assertContractsConfigured();
  const p = provider ?? getReadProvider();
  const verifier = new Contract(CONTRACTS.verifier, [...VERIFIER_ABI], p);
  return verifier.is_verified(account);
}

export async function readVerification(
  account: string,
  provider?: JsonRpcProvider,
): Promise<OnChainVerification | null> {
  assertContractsConfigured();
  const p = provider ?? getReadProvider();
  const verifier = new Contract(CONTRACTS.verifier, [...VERIFIER_ABI], p);
  try {
    const rec = await verifier.verification_of(account);
    return rec.active ? (rec as OnChainVerification) : null;
  } catch {
    return null;
  }
}

export async function readBadge(
  badgeId: bigint | string,
  provider?: JsonRpcProvider,
): Promise<OnChainBadge | null> {
  assertContractsConfigured();
  const p = provider ?? getReadProvider();
  const registry = new Contract(CONTRACTS.registry, [...REGISTRY_ABI], p);
  try {
    const badge = await registry.badge(badgeId);
    return badge.active ? (badge as OnChainBadge) : null;
  } catch {
    return null;
  }
}

export async function readNonceUsed(
  nonce: string,
  provider?: JsonRpcProvider,
): Promise<boolean> {
  assertContractsConfigured();
  const p = provider ?? getReadProvider();
  const verifier = new Contract(CONTRACTS.verifier, [...VERIFIER_ABI], p);
  return verifier.nonce_used(nonce);
}

// ─────────────────────────────────────────────────────────────────────────────
// Write API (submits through the user's wallet)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitResult {
  txHash: string;
  badgeId: string;
}

/**
 * Submit `verify_and_issue(...)` via the user's connected Arbitrum wallet.
 *
 * Reverts surface as ethers errors; map the common ones to friendly messages:
 *   AlreadyVerified / NonceAlreadyUsed / ChallengeExpired / InvalidSignature …
 */
export async function submitVerification(params: {
  publicKeyHex: string;
  nonce: string;
  expires: number;
  signatureHex: string;
  originNetwork: string;
}): Promise<SubmitResult> {
  // Never submit to the zero address: that transaction would mine, report
  // success, emit no logs and mint nothing.
  assertContractsConfigured();

  const provider = getBrowserProvider();
  if (!provider) {
    throw new Error(
      "No Arbitrum wallet detected. Connect MetaMask (on Arbitrum Sepolia) to submit the on-chain verification.",
    );
  }

  const signer: Signer = await provider.getSigner();
  const verifier = new Contract(CONTRACTS.verifier, [...VERIFIER_ABI], signer);

  const tx = await verifier.verify_and_issue(
    params.publicKeyHex,
    params.nonce,
    params.expires,
    params.signatureHex,
    params.originNetwork,
  );

  const receipt = await tx.wait();

  // Parse the badge id out of the WalletVerified event.
  let badgeId = "1";
  for (const log of receipt.logs) {
    try {
      const parsed = verifier.interface.parseLog(log);
      if (parsed?.name === "WalletVerified") {
        badgeId = String(parsed.args.badge_id);
      }
    } catch {
      /* not a verifier log */
    }
  }

  return { txHash: receipt.hash, badgeId };
}

/** The chain id the app targets — used to warn when the wallet is elsewhere. */
export const TARGET_CHAIN_ID = NETWORK.chainId;

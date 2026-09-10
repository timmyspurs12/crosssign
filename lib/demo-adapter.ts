import type { ProofRecord, SignaturePayload, WalletAccount } from "@/types";
import { b58encode } from "@/lib/base58";
import { buildProofRecord } from "@/lib/proof-format";
import { seededHex } from "@/lib/utils";

/**
 * Interactive demo adapter.
 *
 * Deterministic, clearly-labelled simulation for when Phantom (or an
 * Arbitrum wallet) is unavailable — e.g. judging on a fresh machine. It
 * produces a demo-labelled source and a demo-labelled transaction hash, so a
 * simulation can never be mistaken for a real on-chain verification.
 *
 * The demo wallet IS a real 32-byte Ed25519 key (as base58), so the canonical
 * challenge builder works identically to the live path.
 */

const DEMO_PUBKEY_BYTES = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 1) & 0xff);
const DEMO_PUBKEY_B58 = b58encode(DEMO_PUBKEY_BYTES);

/** Connect a simulated Solana wallet (a real 32-byte key). */
export async function connectDemoWallet(): Promise<WalletAccount> {
  await sleep(700);
  return {
    address: DEMO_PUBKEY_B58,
    publicKey: DEMO_PUBKEY_B58,
    ecosystem: "solana",
    network: "Mainnet-Beta",
  };
}

/** Produce a simulated Ed25519 signature for the challenge. */
export async function signDemoChallenge(
  message: string,
  publicKey: string,
): Promise<SignaturePayload> {
  await sleep(500);
  return {
    message,
    signatureBase58: `demo${seededHex(message + publicKey, 84)}`,
    publicKeyBase58: publicKey,
  };
}

/** Simulate on-chain verification and return a demo-labelled proof. */
export async function verifyDemoSignature(params: {
  account: WalletAccount;
  message: string;
  signatureBase58: string;
}): Promise<ProofRecord> {
  await sleep(1400);
  const { account } = params;

  return {
    ...buildProofRecord({
      id: `demo_${Date.now().toString(36)}`,
      origin: account.ecosystem,
      originNetwork: account.network,
      walletAddress: account.publicKey,
      publicKey: account.publicKey,
      destination: "arbitrum",
      destinationNetwork: "Sepolia",
      method: "Ed25519",
      verifiedAt: new Date(),
      transactionHash: seededHex(`demo-tx-${account.publicKey}`, 64),
    }),
    source: "demo",
    badgeId: "CS-0001",
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

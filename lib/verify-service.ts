import type { ProofRecord, VerificationChallenge, WalletAccount } from "@/types";
import { buildChallenge } from "@/lib/challenge";
import {
  connectSolanaWallet,
  getActiveSolanaSession,
  signMessageWithActiveWallet,
} from "@/lib/wallet/solana";
import { b58encode } from "@/lib/base58";
import { buildProofRecord } from "@/lib/proof-format";
import { submitVerification } from "@/lib/chain/client";
import { b58decode, bytesToHex, solanaPubkeyToHex } from "@/lib/base58";
import { CHAINS } from "@/lib/config";

/**
 * Live verification service.
 *
 * Real protocol path:
 *   connect the user's chosen Solana wallet (Wallet Standard or injected) →
 *   derive 0x-hex pubkey → build canonical challenge → wallet signs
 *   (Ed25519, message-only — never a transaction) → submit
 *   `verify_and_issue` on-chain via the user's Arbitrum wallet → the Stylus
 *   verifier checks the signature → the registry issues a soulbound badge.
 *
 * The cryptographic trust assumption lives ENTIRELY in the contract. This
 * module only produces/forwards bytes; it never "verifies" anything itself.
 */

/**
 * Connect the wallet the user picked in the selector and remember it as the
 * active Solana session for the subsequent signature request.
 */
export async function connectLiveWallet(walletId: string): Promise<WalletAccount> {
  const session = await connectSolanaWallet(walletId);
  return {
    address: session.address,
    publicKey: session.publicKey,
    ecosystem: "solana",
    network: CHAINS.solana.network,
    walletName: session.walletName,
    walletIcon: session.walletIcon ?? undefined,
  };
}

/** Build the canonical challenge for a connected Solana wallet. */
export function createChallengeForWallet(
  account: WalletAccount,
): VerificationChallenge {
  return buildChallenge(solanaPubkeyToHex(account.publicKey));
}

/** Sign the canonical challenge with the connected Solana wallet (Ed25519). */
export async function signLiveChallenge(message: string): Promise<{
  signatureBase58: string;
  publicKeyBase58: string;
}> {
  const session = getActiveSolanaSession();
  if (!session) {
    throw new Error("The Solana wallet connection was lost. Please reconnect.");
  }

  const signature = await signMessageWithActiveWallet(message);

  return {
    signatureBase58: b58encode(signature),
    publicKeyBase58: session.publicKey,
  };
}

/** Convert a base58 signature to the 0x-hex form the contract expects. */
export function signatureBase58ToHex(signatureBase58: string): string {
  const bytes = b58decode(signatureBase58);
  if (bytes.length !== 64) {
    throw new Error("Expected a 64-byte Ed25519 signature.");
  }
  return `0x${bytesToHex(bytes)}`;
}

/**
 * Submit the verification on-chain and return a ProofRecord.
 *
 * INTEGRATION POINT — the real submission goes through the user's Arbitrum
 * wallet (the EIP-1193 provider they explicitly connected — see
 * lib/wallet/evm.ts) to the deployed CrossSignVerifier (see
 * lib/chain/client.ts). If no Arbitrum wallet is connected, this throws;
 * the UI prompts the EVM wallet selector.
 */
export async function submitSignature(params: {
  account: WalletAccount;
  challenge: VerificationChallenge;
  signatureBase58: string;
}): Promise<ProofRecord> {
  const { account, challenge, signatureBase58 } = params;

  const signatureHex = signatureBase58ToHex(signatureBase58);

  const { txHash, badgeId } = await submitVerification({
    publicKeyHex: challenge.wallet, // 0x + 64 hex, bound into the message
    nonce: challenge.nonce,
    expires: challenge.expires,
    signatureHex,
    originNetwork: account.network.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  });

  return buildProofRecord({
    id: `prf_${txHash.slice(2, 12)}`,
    origin: account.ecosystem,
    originNetwork: account.network,
    walletAddress: account.publicKey,
    publicKey: account.publicKey,
    destination: "arbitrum",
    destinationNetwork: "Sepolia",
    method: "Ed25519",
    verifiedAt: new Date(),
    transactionHash: txHash,
    badgeId,
  });
}

import type { PhantomProvider, PhantomWindow } from "@/types/phantom";
import type { WalletAccount } from "@/types";
import { CHAINS } from "@/lib/config";
import { b58encode } from "@/lib/base58";

/**
 * Phantom (Solana) wallet adapter.
 *
 * This is the ONLY place that touches window.phantom / @solana/web3.js.
 * It exposes two operations — connect and sign — so the verification
 * service never needs to know where signatures come from.
 */

export function getPhantomProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as PhantomWindow;
  return w.phantom?.solana ?? null;
}

export function phantomInstalled(): boolean {
  return getPhantomProvider() !== null;
}

/** Opens the Phantom install page. */
export function openPhantomInstall(): void {
  if (typeof window === "undefined") return;
  window.open("https://phantom.app/download", "_blank", "noopener,noreferrer");
}

export interface PhantomConnectResult {
  provider: PhantomProvider;
  account: WalletAccount;
}

export async function connectPhantom(): Promise<PhantomConnectResult> {
  const provider = getPhantomProvider();
  if (!provider) {
    throw new Error(
      "Phantom is not installed. Install Phantom or use the interactive demo.",
    );
  }

  let response: { publicKey: { toString(): string } };
  try {
    response = await provider.connect();
  } catch (err) {
    throw new Error("Connection request was rejected in Phantom.");
  }

  const publicKey = response.publicKey.toString();

  return {
    provider,
    account: {
      address: publicKey,
      publicKey,
      ecosystem: "solana",
      network: CHAINS.solana.network,
    },
  };
}

export async function signMessageWithPhantom(
  provider: PhantomProvider,
  message: string,
): Promise<{ signatureBase58: string; publicKeyBase58: string }> {
  const encoded = new TextEncoder().encode(message);

  let signature: { signature: Uint8Array };
  try {
    signature = await provider.signMessage(encoded, "utf8");
  } catch (err) {
    throw new Error("Signature request was rejected in Phantom.");
  }

  return {
    signatureBase58: b58encode(signature.signature),
    publicKeyBase58: provider.publicKey?.toString() ?? "",
  };
}

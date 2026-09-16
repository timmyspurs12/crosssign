/**
 * Core domain types for CrossSign.
 *
 * These are intentionally chain-agnostic at the UI layer. The concrete
 * @solana/web3.js / wagmi / RPC types live behind lib/* service adapters,
 * so the backend contract + API can be wired in without touching components.
 */

export type Ecosystem = "solana" | "arbitrum" | "robinhood";

export type VerificationMethod = "Ed25519" | "secp256k1";

export type VerificationStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "signing"
  | "verifying"
  | "verified"
  | "failed"
  | "rejected";

export type VerificationSource = "live" | "demo";

export interface WalletAccount {
  /** Truncated display address, e.g. "8xKf…q9Zt" */
  address: string;
  /** Full public key for the record */
  publicKey: string;
  ecosystem: Ecosystem;
  network: string;
  /** Name of the wallet app the account came from (e.g. "Phantom", "Solflare"). */
  walletName?: string;
  /** data:image icon of the wallet app, when discovery provides one. */
  walletIcon?: string;
}

/**
 * Live view of the connected Arbitrum (EVM) wallet used for on-chain
 * submission. Kept in sync with lib/wallet/evm.ts session events.
 */
export interface EvmConnection {
  address: string;
  walletName: string;
  walletIcon: string | null;
  /** Chain id the wallet is on right now (null when unreadable). */
  chainId: number | null;
  /** True when the wallet is NOT on the target Arbitrum Sepolia chain. */
  wrongChain: boolean;
}

export interface VerificationChallenge {
  /** The exact canonical message the wallet signs (see lib/canonical.ts). */
  message: string;
  /** Unix timestamp (seconds) when the challenge expires. */
  expires: number;
  /** Milliseconds timestamp for UI display. */
  expiresAt: number;
  /** Domain string to prevent cross-app replay. */
  domain: string;
  nonce: string;
  /** Destination chain id the message is bound to. */
  chainId: number;
  /** Verifier contract address the message is bound to (0x…). */
  contract: string;
  /** Wallet public key the message is bound to (0x-hex, 32 bytes). */
  wallet: string;
}

export interface ProofRecord {
  id: string;
  status: "verified" | "pending" | "failed";
  source: VerificationSource;
  origin: Ecosystem;
  originNetwork: string;
  walletAddress: string;
  destination: Ecosystem;
  destinationNetwork: string;
  method: VerificationMethod;
  verifiedAt: string; // ISO timestamp
  transactionHash: string;
  contractAddress: string;
  badgeId: string;
}

export interface SignaturePayload {
  message: string;
  signatureBase58: string;
  publicKeyBase58: string;
}

/** Central state machine for the verification flow. */
export interface VerificationState {
  status: VerificationStatus;
  source: VerificationSource;
  account: WalletAccount | null;
  challenge: VerificationChallenge | null;
  error: string | null;
  proof: ProofRecord | null;
  stepIndex: number;
  /** Connected Arbitrum (EVM) wallet used for the on-chain submission. */
  evm: EvmConnection | null;
  /** Non-blocking status message for the current step. */
  notice: string | null;
}

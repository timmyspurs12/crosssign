/**
 * Wallet-layer types shared by the Solana and EVM discovery modules.
 *
 * Deliberately narrow: each interface only describes the surface CrossSign
 * actually uses, so a wallet that behaves slightly differently cannot break
 * the app at type level. Nothing here ever touches private keys — wallets
 * keep custody; CrossSign only ever requests signatures/accounts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// EVM (EIP-1193 / EIP-6963)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal EIP-1193 provider surface — https://eips.ethereum.org/EIPS/eip-1193 */
export interface Eip1193Provider {
  request(args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

/** EIP-6963 provider info — https://eips.ethereum.org/EIPS/eip-6963 */
export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

/** EIP-6963 announceProvider event detail. */
export interface Eip6963ProviderDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

/**
 * Documented `is*` compatibility flags injected providers expose. Many
 * wallets set `isMetaMask` for dapp compatibility, so detection MUST check
 * the more specific flags first (see lib/wallet/evm.ts).
 */
export interface InjectedEvmFlags {
  providers?: unknown[];
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isZerion?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isBraveWallet?: boolean;
  isPhantom?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Solana (legacy injected providers — Wallet Standard needs no extra types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Legacy injected Solana provider surface (Phantom-style). Used only as a
 * fallback for wallets that do not (yet) implement the Wallet Standard —
 * Phantom, Solflare, Backpack and OKX all expose (or exposed) this shape.
 */
export interface InjectedSolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey: { toString(): string } | null;
  /**
   * NOTE: `onlyIfTrusted` exists on real providers but CrossSign NEVER uses
   * it — silent auto-reconnect of a previously authorized wallet is exactly
   * the behavior the verification flow must not have. Connection always
   * follows an explicit user selection in the wallet modal.
   */
  connect: (opts?: {
    onlyIfTrusted?: boolean;
  }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect?: () => Promise<void>;
  /** Phantom-style event API (read-only subscriptions; never mutated). */
  on?(event: "disconnect" | "accountChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
  signMessage: (
    message: Uint8Array,
    display?: "utf8" | "hex",
  ) => Promise<{
    signature: Uint8Array;
    publicKey?: { toString(): string };
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery entries — what the wallet selector renders
// ─────────────────────────────────────────────────────────────────────────────

export type WalletEcosystem = "solana" | "evm";

/** A wallet that is actually discoverable in this browser. Never a stub. */
export interface WalletEntry {
  /** Stable id used to (re)resolve the wallet at connect time. */
  id: string;
  name: string;
  /** `data:image/…` URI when the wallet provides one; null → UI fallback. */
  icon: string | null;
  ecosystem: WalletEcosystem;
  /** Discovery mechanism that found this wallet. */
  discovery: "wallet-standard" | "eip-6963" | "injected";
  /** Official install page, used only when the wallet is NOT detected. */
  installUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/** Wallet-layer error with a user-facing message. */
export class WalletError extends Error {
  /** True when the user explicitly cancelled in the wallet. */
  readonly userRejected: boolean;

  constructor(message: string, userRejected = false) {
    super(message);
    this.name = "WalletError";
    this.userRejected = userRejected;
  }
}

/**
 * True when the underlying error is an explicit user cancellation
 * (EIP-1193 code 4001, or a rejected/cancelled Solana request).
 */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof WalletError) return err.userRejected;
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 4001) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /reject|denied|cancel|closed by user/i.test(message);
}

/** EIP-1193 "-32002": a request for this wallet is already pending. */
export function isRequestAlreadyPending(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === -32002;
}

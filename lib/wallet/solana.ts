/**
 * Solana wallet layer.
 *
 * Discovery is standards-first:
 *
 *   1. Wallet Standard (`@wallet-standard/app`) — the same mechanism Phantom,
 *      Solflare, Backpack, OKX Wallet and other Solana wallets use to announce
 *      themselves to apps. Anything that registers with a `solana:*` chain is
 *      offered to the user, with the name/icon the wallet itself provides.
 *   2. Legacy injected providers (`window.phantom.solana`,
 *      `window.solflare`, `window.backpack`, `window.okxwallet.solana`) —
 *      a fallback for wallets that do not implement the standard yet.
 *
 * Nothing is ever invented: a wallet only appears in the selector when it is
 * actually discoverable in this browser. Connection + signing go through the
 * wallet the user explicitly chose. Only message signing (Ed25519, the
 * CrossSign challenge) is ever requested here — never a transaction.
 *
 * Ed25519 signatures are converted to base58 exactly as before
 * (see lib/base58.ts) so the Stylus verifier flow is unchanged.
 */

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount as StandardWalletAccount } from "@wallet-standard/base";

import { b58encode } from "@/lib/base58";
import {
  InjectedSolanaProvider,
  WalletError,
  WalletEntry,
  isUserRejection,
} from "@/lib/wallet/types";

// ─────────────────────────────────────────────────────────────────────────────
// Narrow Wallet Standard feature surfaces (only what CrossSign uses)
// ─────────────────────────────────────────────────────────────────────────────

interface StandardConnectFeature {
  connect(input?: {
    silent?: boolean;
  }): Promise<{ readonly accounts: readonly StandardWalletAccount[] }>;
}

interface StandardEventsFeature {
  on(event: "change", listener: () => void): () => void;
}

/** The wallet writes its response into the mutable `output` slot. */
interface SolanaSignMessageFeature {
  signMessage(
    output: Array<{
      signature?: Uint8Array;
      signedMessage?: Uint8Array;
      publicKey?: Uint8Array;
    }>,
    inputs: ReadonlyArray<{ account: StandardWalletAccount; message: Uint8Array }>,
  ): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session — the wallet the user explicitly chose
// ─────────────────────────────────────────────────────────────────────────────

export interface SolanaSession {
  walletId: string;
  walletName: string;
  walletIcon: string | null;
  /** Base58 address as shown by the wallet. */
  address: string;
  /** Base58 32-byte Ed25519 public key. */
  publicKey: string;
}

/** Internal session: the public view plus the signing closure. */
interface ActiveSolanaSession extends SolanaSession {
  sign(message: string): Promise<Uint8Array>;
}

let activeSession: ActiveSolanaSession | null = null;

/** The currently connected Solana wallet, if any. */
export function getActiveSolanaSession(): SolanaSession | null {
  return activeSession;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet Standard API (lazily initialised — never touched on the server)
// ─────────────────────────────────────────────────────────────────────────────

let walletsApi: ReturnType<typeof getWallets> | null = null;

function getWalletsApi(): ReturnType<typeof getWallets> | null {
  if (typeof window === "undefined") return null;
  if (!walletsApi) walletsApi = getWallets();
  return walletsApi;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy injected providers (fallback for non-Standard wallets)
// ─────────────────────────────────────────────────────────────────────────────

interface InjectedSolanaWindow {
  phantom?: { solana?: InjectedSolanaProvider };
  solflare?: InjectedSolanaProvider;
  backpack?: InjectedSolanaProvider;
  okxwallet?: { solana?: InjectedSolanaProvider };
}

interface InjectedSolanaDescriptor {
  /** Stable id component, e.g. `injected:phantom.solana`. */
  windowKey: string;
  name: string;
  installUrl: string;
  resolve: (w: InjectedSolanaWindow) => InjectedSolanaProvider | null | undefined;
}

const INJECTED_SOLANA_WALLETS: InjectedSolanaDescriptor[] = [
  {
    windowKey: "phantom.solana",
    name: "Phantom",
    installUrl: "https://phantom.app/download",
    resolve: (w) => w.phantom?.solana,
  },
  {
    windowKey: "solflare",
    name: "Solflare",
    installUrl: "https://solflare.com/download",
    resolve: (w) => w.solflare,
  },
  {
    windowKey: "backpack",
    name: "Backpack",
    installUrl: "https://backpack.app/download",
    resolve: (w) => w.backpack,
  },
  {
    windowKey: "okxwallet.solana",
    name: "OKX Wallet",
    installUrl: "https://www.okx.com/web3/download",
    resolve: (w) => w.okxwallet?.solana,
  },
];

function isValidInjectedSolana(
  provider: InjectedSolanaProvider | null | undefined,
): provider is InjectedSolanaProvider {
  return (
    Boolean(provider) &&
    typeof provider!.connect === "function" &&
    typeof provider!.signMessage === "function"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every Solana wallet actually discoverable in this browser right now.
 * Wallet Standard wallets win over legacy injected detections of the same
 * name (the standard path is the richer, supported one).
 */
export function listSolanaWallets(): WalletEntry[] {
  const entries: WalletEntry[] = [];
  const seen = new Set<string>();

  const api = getWalletsApi();
  if (api) {
    for (const wallet of api.get()) {
      if (!wallet.chains.some((chain) => chain.startsWith("solana:"))) continue;
      const key = wallet.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        id: `standard:${wallet.name}`,
        name: wallet.name,
        icon: wallet.icon ?? null,
        ecosystem: "solana",
        discovery: "wallet-standard",
        installUrl: null,
      });
    }
  }

  if (typeof window !== "undefined") {
    const injected = window as unknown as InjectedSolanaWindow;
    for (const descriptor of INJECTED_SOLANA_WALLETS) {
      if (seen.has(descriptor.name.toLowerCase())) continue;
      const provider = descriptor.resolve(injected);
      if (!isValidInjectedSolana(provider)) continue;
      seen.add(descriptor.name.toLowerCase());
      entries.push({
        id: `injected:${descriptor.windowKey}`,
        name: descriptor.name,
        icon: null,
        ecosystem: "solana",
        discovery: "injected",
        installUrl: descriptor.installUrl,
      });
    }
  }

  return entries;
}

/** True when at least one Solana wallet is discoverable. */
export function hasSolanaWallet(): boolean {
  return listSolanaWallets().length > 0;
}

/** Subscribe to Wallet Standard register/unregister events. */
export function subscribeSolanaWallets(onChange: () => void): () => void {
  const api = getWalletsApi();
  if (!api) return () => {};
  const offRegister = api.on("register", onChange);
  const offUnregister = api.on("unregister", onChange);
  return () => {
    offRegister();
    offUnregister();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect
// ─────────────────────────────────────────────────────────────────────────────

function sessionView(): SolanaSession {
  if (!activeSession) throw new WalletError("Wallet session was lost.");
  const { walletId, walletName, walletIcon, address, publicKey } = activeSession;
  return { walletId, walletName, walletIcon, address, publicKey };
}

/**
 * Connect the wallet the user picked in the selector and remember it as the
 * active Solana session. Throws a `WalletError` with a user-facing message
 * on failure; `userRejected` is true when the user cancelled in the wallet.
 */
export async function connectSolanaWallet(walletId: string): Promise<SolanaSession> {
  const entry = listSolanaWallets().find((wallet) => wallet.id === walletId);
  if (!entry) {
    throw new WalletError("That wallet is no longer available. Please pick another one.");
  }

  if (entry.discovery === "wallet-standard") {
    await connectWalletStandard(entry);
  } else {
    await connectInjected(entry);
  }
  return sessionView();
}

async function connectWalletStandard(entry: WalletEntry): Promise<void> {
  const api = getWalletsApi();
  const wallet: Wallet | undefined = api
    ?.get()
    .find((candidate) => `standard:${candidate.name}` === entry.id);
  if (!wallet) {
    throw new WalletError(`${entry.name} is no longer available. Please pick another one.`);
  }

  const connect = wallet.features["standard:connect"] as StandardConnectFeature | undefined;
  if (!connect) {
    throw new WalletError(`${wallet.name} did not expose a connection feature.`);
  }

  let accounts: readonly StandardWalletAccount[];
  try {
    ({ accounts } = await connect.connect());
  } catch (err) {
    throw toWalletError(err, `Connection was rejected in ${wallet.name}.`, `Could not connect to ${wallet.name}.`);
  }

  const account = accounts[0];
  if (!account) {
    throw new WalletError(`${wallet.name} did not return an account.`);
  }

  const signMessage = wallet.features["solana:signMessage"] as
    | SolanaSignMessageFeature
    | undefined;
  if (!signMessage) {
    throw new WalletError(`${wallet.name} cannot sign messages.`);
  }

  const address = account.address;
  const publicKey =
    account.publicKey && account.publicKey.byteLength > 0
      ? b58encode(new Uint8Array(account.publicKey))
      : address;

  activeSession = {
    walletId: entry.id,
    walletName: wallet.name,
    walletIcon: wallet.icon ?? null,
    address,
    publicKey,
    sign: async (message: string) => {
      const bytes = new TextEncoder().encode(message);
      const output: Array<{
        signature?: Uint8Array;
        signedMessage?: Uint8Array;
        publicKey?: Uint8Array;
      }> = [{}];
      try {
        await signMessage.signMessage(output, [{ account, message: bytes }]);
      } catch (err) {
        throw toWalletError(err, `Signature was rejected in ${wallet.name}.`, `Signing failed in ${wallet.name}.`);
      }
      const signature = output[0]?.signature;
      if (!signature) {
        throw new WalletError(`${wallet.name} did not return a signature.`);
      }
      return signature;
    },
  };

  // Drop the session if the wallet disconnects or switches accounts.
  const events = wallet.features["standard:events"] as StandardEventsFeature | undefined;
  if (events) {
    const off = events.on("change", () => {
      const stillConnected = wallet.accounts.some((a) => a.address === address);
      if (!stillConnected && activeSession?.walletId === entry.id) {
        activeSession = null;
        off();
      }
    });
  }
}

async function connectInjected(entry: WalletEntry): Promise<void> {
  const descriptor = INJECTED_SOLANA_WALLETS.find(
    (candidate) => `injected:${candidate.windowKey}` === entry.id,
  );
  if (!descriptor || typeof window === "undefined") {
    throw new WalletError(`${entry.name} is no longer available. Please pick another one.`);
  }

  const provider = descriptor.resolve(window as unknown as InjectedSolanaWindow);
  if (!isValidInjectedSolana(provider)) {
    throw new WalletError(`${descriptor.name} is no longer available. Please pick another one.`);
  }

  try {
    await provider.connect();
  } catch (err) {
    throw toWalletError(err, `Connection was rejected in ${descriptor.name}.`, `Could not connect to ${descriptor.name}.`);
  }

  const publicKey = provider.publicKey?.toString();
  if (!publicKey) {
    throw new WalletError(`${descriptor.name} did not return a public key.`);
  }

  activeSession = {
    walletId: entry.id,
    walletName: descriptor.name,
    walletIcon: null,
    address: publicKey,
    publicKey,
    sign: async (message: string) => {
      try {
        const response = await provider.signMessage(
          new TextEncoder().encode(message),
          "utf8",
        );
        return response.signature;
      } catch (err) {
        throw toWalletError(err, `Signature was rejected in ${descriptor.name}.`, `Signing failed in ${descriptor.name}.`);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign (message-only — never a transaction)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign a message with the wallet the user connected. Returns the raw 64-byte
 * Ed25519 signature. Throws `WalletError` when the session is gone or the
 * user rejects the signature.
 */
export async function signMessageWithActiveWallet(message: string): Promise<Uint8Array> {
  if (!activeSession) {
    throw new WalletError("The Solana wallet connection was lost. Please reconnect.");
  }
  return activeSession.sign(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toWalletError(err: unknown, rejectedMessage: string, fallbackMessage: string): WalletError {
  if (isUserRejection(err)) return new WalletError(rejectedMessage, true);
  if (err instanceof WalletError) return err;
  return new WalletError(fallbackMessage);
}

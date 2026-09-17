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

/**
 * `solana:signMessage` — the Wallet Standard message-signing feature.
 *
 * The CURRENT standard (`@solana/wallet-standard-features`) is variadic and
 * returns its outputs:
 *
 *   signMessage(...inputs: { account, message }[]) => Promise<outputs[]>
 *
 * An earlier draft of the standard instead handed the wallet a caller-owned
 * output array to fill in:
 *
 *   signMessage(output: [], inputs: []) => Promise<void>
 *
 * Real wallets — Phantom, Solflare, Backpack, OKX, Coinbase, MetaMask — ship
 * the current variadic form. Calling one of those the legacy way passes the
 * output array as its FIRST INPUT, so the wallet never receives
 * `{ account, message }` and the request fails inside the wallet even though
 * connect succeeded (the signature can also land in a return value we never
 * read). Both shapes are supported below; the convention is detected from the
 * feature's arity, so a request is never sent twice (never a double prompt).
 */
interface StandardSignMessageInput {
  account: StandardWalletAccount;
  message: Uint8Array;
}

interface StandardSignMessageOutput {
  signature?: Uint8Array;
  signedMessage?: Uint8Array;
  /**
   * Only the legacy draft reports the signing key; the current spec has no
   * key field (the account is the one passed in). Validated when present.
   */
  publicKey?: Uint8Array;
  /** "ed25519" when the wallet states it; CrossSign only verifies Ed25519. */
  signatureType?: string;
}

/** Deliberately loose: both drafts of the standard are callable shapes. */
type StandardSignMessageFn = (...args: never[]) => Promise<unknown>;

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
  /** Tears down provider event listeners for this session. */
  detach(): void;
  /** Best-effort wallet-side disconnect (where the provider supports it). */
  disconnectWallet(): Promise<void>;
}

let activeSession: ActiveSolanaSession | null = null;

// Session-change pub/sub — React mirrors the TRUE connection state through
// this so the UI can never display a wallet the module layer has dropped
// (and vice versa). Same contract as the EVM side.
const sessionListeners = new Set<() => void>();

function notifySessionChanged(): void {
  for (const listener of sessionListeners) listener();
}

/** Subscribe to Solana session changes (connect / disconnect / account drop). */
export function onSolanaSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/** Tear down the outgoing session's provider listeners before replacing it. */
function retireSession(): void {
  if (activeSession) activeSession.detach();
  activeSession = null;
}

/**
 * Explicitly drop the active Solana session. Called by the app's reset/
 * retry/setSource paths so a "fresh start" genuinely starts from NO wallet:
 * the next verification must re-run detection + explicit selection, and the
 * public key is re-read from the wallet. Where the provider exposes a
 * disconnect API (legacy injected `disconnect()`, Wallet Standard
 * `standard:disconnect`), it is invoked best-effort — extensions may still
 * remember site authorization internally (a wallet-extension behavior no
 * dapp can revoke; see module docs).
 */
export async function disconnectSolanaSession(): Promise<void> {
  const session = activeSession;
  retireSession();
  if (session) {
    try {
      await session.disconnectWallet();
    } catch {
      /* disconnect is best-effort — the local session is gone regardless */
    }
    notifySessionChanged();
  }
}

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
    // `silent: false` is the standard's default, but it is stated explicitly:
    // CrossSign never asks a wallet for a silent (non-interactive) connect, so
    // a site that is not authorized yet always gets an approval prompt. When
    // the extension HAS already authorized this site, Wallet Standard lets it
    // answer without prompting — that is extension-level state no dapp can or
    // should bypass; see the module docs.
    ({ accounts } = await connect.connect({ silent: false }));
  } catch (err) {
    throw toWalletError(err, `Connection was rejected in ${wallet.name}.`, `Could not connect to ${wallet.name}.`);
  }

  const account = accounts[0];
  if (!account) {
    throw new WalletError(`${wallet.name} did not return an account.`);
  }

  const signMessage = wallet.features["solana:signMessage"] as
    | { signMessage: StandardSignMessageFn }
    | undefined;
  if (!signMessage) {
    throw new WalletError(`${wallet.name} cannot sign messages.`);
  }

  const address = account.address;
  const publicKey =
    account.publicKey && account.publicKey.byteLength > 0
      ? b58encode(new Uint8Array(account.publicKey))
      : address;

  // Any previous session is explicitly retired first (event teardown +
  // disconnect best-effort) so switching wallets can never leave two live
  // sessions or dangling listeners behind.
  retireSession();

  activeSession = {
    walletId: entry.id,
    walletName: wallet.name,
    walletIcon: wallet.icon ?? null,
    address,
    publicKey,
    sign: async (message: string) => {
      const bytes = new TextEncoder().encode(message);
      let output: StandardSignMessageOutput;
      try {
        // Re-read the wallet's CURRENT accounts before asking it to sign. The
        // key the challenge was bound to must be the key the wallet signs
        // with: Wallet Standard publishes only the currently authorized
        // accounts, so this is the wallet confirming "still connected as this
        // key". If the account is gone, or its key no longer matches, the
        // session is stale — refuse, never sign with a cached key.
        let signAccount: StandardWalletAccount = account;
        if (wallet.accounts.length > 0) {
          const live = wallet.accounts.find(
            (candidate) => candidate.address === account.address,
          );
          if (!live) {
            throw new WalletError(
              `${wallet.name} no longer has the connected account. Please reconnect.`,
            );
          }
          const liveKey =
            live.publicKey && live.publicKey.byteLength > 0
              ? b58encode(new Uint8Array(live.publicKey))
              : live.address;
          if (liveKey !== publicKey) {
            throw new WalletError(
              `${wallet.name} changed the key of the connected account. Please reconnect.`,
            );
          }
          signAccount = live;
        }

        output = await requestStandardSignature({
          walletName: wallet.name,
          signMessage: signMessage.signMessage,
          account: signAccount,
          message: bytes,
        });
      } catch (err) {
        throw toWalletError(err, `Signature was rejected in ${wallet.name}.`, `Signing failed in ${wallet.name}.`);
      }

      const signature = output.signature;
      if (!signature || signature.byteLength === 0) {
        throw new WalletError(`${wallet.name} did not return a signature.`);
      }
      // Ed25519 only: the Stylus verifier reconstructs the canonical message
      // and checks a 64-byte Ed25519 signature over it.
      if (signature.byteLength !== 64) {
        throw new WalletError(
          `${wallet.name} returned a malformed signature (${signature.byteLength} bytes, expected 64).`,
        );
      }
      if (output.signatureType && output.signatureType !== "ed25519") {
        throw new WalletError(
          `${wallet.name} returned a ${output.signatureType} signature — CrossSign verifies Ed25519.`,
        );
      }
      // Defence in depth: when the wallet reports which key it signed with
      // (legacy draft), it must be the key we asked for — never trust a
      // response that doesn't match the request.
      if (output.publicKey && output.publicKey.byteLength > 0) {
        const signedKey = b58encode(new Uint8Array(output.publicKey));
        if (signedKey !== publicKey) {
          throw new WalletError(
            `${wallet.name} signed with a different account than the one connected. Please retry.`,
          );
        }
      }
      return signature;
    },
    detach: () => offEvents(),
    disconnectWallet: async () => {
      const disconnect = wallet.features["standard:disconnect"] as
        | { disconnect(): Promise<void> }
        | undefined;
      await disconnect?.disconnect();
    },
  };

  // Drop the session if the wallet disconnects or switches accounts, so no
  // signing attempt can run against a stale key.
  const events = wallet.features["standard:events"] as StandardEventsFeature | undefined;
  function offEvents(): void {
    off?.();
    off = null;
  }
  let off: (() => void) | null = null;
  if (events) {
    off = events.on("change", () => {
      const stillConnected = wallet.accounts.some((a) => a.address === address);
      if (!stillConnected && activeSession?.walletId === entry.id) {
        retireSession();
        notifySessionChanged();
      }
    });
  }
  notifySessionChanged();
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

  retireSession();

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
        // Defence in depth (same rule as the Wallet-Standard path above):
        // when the provider reports which key it signed with, it MUST be the
        // key this session is bound to. A wallet that answers from another
        // account must never have its signature attributed to this one.
        const signedKey = response.publicKey?.toString();
        if (signedKey && signedKey !== publicKey) {
          throw new WalletError(
            `${descriptor.name} signed with a different account than the one connected. Please retry.`,
          );
        }
        return response.signature;
      } catch (err) {
        throw toWalletError(err, `Signature was rejected in ${descriptor.name}.`, `Signing failed in ${descriptor.name}.`);
      }
    },
    detach: () => offEvents(),
    disconnectWallet: async () => {
      await provider.disconnect?.();
    },
  };

  const solanaProvider: InjectedSolanaProvider = provider;
  let attached = false;
  const offEvents = () => {
    if (!attached) return;
    attached = false;
    solanaProvider.removeListener?.("disconnect", onProviderDrop);
    solanaProvider.removeListener?.("accountChanged", onProviderDrop);
  };
  const onProviderDrop = () => {
    if (activeSession?.walletId !== entry.id) return;
    retireSession();
    notifySessionChanged();
  };

  // Phantom/Solflare-style providers emit disconnect + accountChanged;
  // honour them so a mid-attempt account switch invalidates the session
  // instead of signing with a stale key.
  if (typeof solanaProvider.on === "function") {
    solanaProvider.on("disconnect", onProviderDrop);
    solanaProvider.on("accountChanged", onProviderDrop);
    attached = true;
  }
  notifySessionChanged();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sign (message-only — never a transaction)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ask a Wallet Standard wallet to sign one message, supporting BOTH drafts of
 * the `solana:signMessage` feature (see the interface docs above).
 *
 * The convention is chosen from the feature's arity so exactly ONE request is
 * ever issued — a dapp must never risk prompting the user twice for the same
 * signature. `(...inputs)` (the current spec) has arity 0; the legacy
 * `(output, inputs)` form has arity 2. A wallet that disguises its arity is
 * handled after the fact (spilled output slot, or a retry that is only
 * possible when the first call threw a TypeError — i.e. before any prompt).
 */
async function requestStandardSignature(params: {
  walletName: string;
  signMessage: StandardSignMessageFn;
  account: StandardWalletAccount;
  message: Uint8Array;
}): Promise<StandardSignMessageOutput> {
  const { walletName, signMessage, account, message } = params;
  const input: StandardSignMessageInput = { account, message };

  // The legacy draft has the caller pre-allocate one output slot per input and
  // the wallet fills it in (an empty array makes wallets write `output[0]` of
  // `undefined`).
  const callLegacyDraft = async (): Promise<StandardSignMessageOutput[]> => {
    const outputs: StandardSignMessageOutput[] = [{}];
    await signMessage(outputs as never, [input] as never);
    return outputs;
  };

  let returned: unknown;

  if (signMessage.length >= 2) {
    returned = await callLegacyDraft();
  } else {
    try {
      returned = await signMessage(input as never);
    } catch (err) {
      // A TypeError means the wallet rejected the arguments (it never reached
      // the user), so a single retry through the legacy convention cannot
      // double-prompt. User rejections are never TypeErrors and propagate.
      if (!(err instanceof TypeError) || isUserRejection(err)) throw err;
      returned = await callLegacyDraft();
    }
    if (returned === undefined || returned === null) {
      // A legacy implementation that hides its arity but still wrote into the
      // first argument it was handed.
      const spilled = (input as unknown as Record<number, StandardSignMessageOutput>)[0];
      if (spilled && spilled.signature) returned = [spilled];
    }
  }

  const list: StandardSignMessageOutput[] = Array.isArray(returned)
    ? (returned as StandardSignMessageOutput[])
    : returned && typeof returned === "object"
      ? [returned as StandardSignMessageOutput]
      : [];

  const output = list.find((candidate) => candidate && candidate.signature) ?? list[0];
  if (!output || typeof output !== "object" || !output.signature) {
    throw new WalletError(`${walletName} did not return a signature.`);
  }
  return output;
}

/** Result of a wallet signature: the bytes AND the key they belong to. */
export interface SignedSolanaMessage {
  /** Raw 64-byte Ed25519 signature produced by the wallet. */
  signature: Uint8Array;
  /** Base58 public key of the session that produced it (same snapshot). */
  publicKeyBase58: string;
}

/**
 * Sign a message with the wallet the user connected.
 *
 * The active session is read ONCE: the signature and the public key it is
 * reported under come from the same snapshot, so a wallet that is replaced
 * while the signature request is pending can never be reported as the
 * signer. Throws `WalletError` when the session is gone or the user rejects
 * the signature.
 */
export async function signMessageWithActiveWallet(
  message: string,
): Promise<SignedSolanaMessage> {
  const session = activeSession;
  if (!session) {
    throw new WalletError("The Solana wallet connection was lost. Please reconnect.");
  }
  const signature = await session.sign(message);
  return { signature, publicKeyBase58: session.publicKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toWalletError(err: unknown, rejectedMessage: string, fallbackMessage: string): WalletError {
  if (isUserRejection(err)) return new WalletError(rejectedMessage, true);
  if (err instanceof WalletError) return err;
  // Never swallow the wallet's own diagnosis: a bare "Signing failed in X."
  // hides the one line that explains a real-browser failure. The original
  // error is logged whole and its message is appended to the user-facing one.
  console.warn(`[crosssign] ${fallbackMessage}`, err);
  const cause =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return new WalletError(cause ? `${fallbackMessage} ${cause}` : fallbackMessage);
}

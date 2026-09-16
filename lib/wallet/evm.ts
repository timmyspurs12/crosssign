/**
 * EVM / Arbitrum wallet layer.
 *
 * Discovery is standards-first and NEVER writes to `window.ethereum`:
 *
 *   1. EIP-6963 multi-provider discovery — the app listens for
 *      `eip6963:announceProvider` events and asks once via
 *      `eip6963:requestProvider`. Every installed wallet that implements the
 *      standard (MetaMask, OKX, Rabby, Zerion, Coinbase Wallet, Phantom's
 *      EVM provider, Trust, Brave…) announces itself with a name, icon and
 *      rdns, plus its own EIP-1193 provider object. This is how CrossSign
 *      lets the user pick between competing extensions without ever
 *      redefining or overwriting `window.ethereum`.
 *   2. Legacy fallback — a read-only scan of `window.ethereum` and the
 *      `window.ethereum.providers` array that multi-wallet extensions keep
 *      for backwards compatibility. Providers are identified by their
 *      documented `is*` flags (most-specific flags first, because many
 *      wallets set `isMetaMask` for compatibility).
 *
 * Connection uses `eth_requestAccounts` on the user-chosen provider. The
 * chosen provider is kept in a module-level session so on-chain submission
 * (lib/chain/client.ts) goes through exactly the wallet the user picked.
 *
 * The destination network is Arbitrum Sepolia (chain 421614). Wrong-network
 * detection + `wallet_switchEthereumChain` / `wallet_addEthereumChain`
 * handling live here so the UI can show a clear "switch network" state.
 */

import { NETWORK, TARGET_CHAIN_PARAMS } from "@/lib/config";
import {
  Eip1193Provider,
  Eip6963ProviderDetail,
  InjectedEvmFlags,
  WalletError,
  WalletEntry,
  isRequestAlreadyPending,
  isUserRejection,
} from "@/lib/wallet/types";

// ─────────────────────────────────────────────────────────────────────────────
// Target chain (Arbitrum Sepolia) — chain id comes from NEXT_PUBLIC_CHAIN_ID
// ─────────────────────────────────────────────────────────────────────────────

export const EVM_TARGET_CHAIN_ID = NETWORK.chainId;
const EVM_TARGET_CHAIN_ID_HEX = `0x${NETWORK.chainId.toString(16)}`;

export function isTargetChain(chainId: number | null): boolean {
  return chainId === EVM_TARGET_CHAIN_ID;
}

export async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const chainIdHex = await provider.request({ method: "eth_chainId" });
    return parseChainId(chainIdHex);
  } catch {
    return null;
  }
}

function parseChainId(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session — the EVM wallet the user explicitly chose
// ─────────────────────────────────────────────────────────────────────────────

export interface EvmSession {
  walletId: string;
  walletName: string;
  walletIcon: string | null;
  address: string;
  /** Chain id the wallet is currently on (null when it could not be read). */
  chainId: number | null;
}

interface ActiveEvmSession extends EvmSession {
  provider: Eip1193Provider;
  /** Removes the accountsChanged/chainChanged listeners attached to the provider. */
  detach: () => void;
}

let activeSession: ActiveEvmSession | null = null;
const sessionListeners = new Set<() => void>();

/** The currently connected Arbitrum (EVM) wallet, if any. */
export function getActiveEvmSession(): EvmSession | null {
  return activeSession;
}

/** The chosen EIP-1193 provider — the only one on-chain submits go through. */
export function getActiveEvmProvider(): Eip1193Provider | null {
  return activeSession?.provider ?? null;
}

function notifySessionChanged(): void {
  for (const listener of sessionListeners) listener();
}

/** Tear down the outgoing session (listeners first, then the session). */
function retireSession(): void {
  if (activeSession) activeSession.detach();
  activeSession = null;
}

/**
 * Explicitly drop the active EVM session. Clears the CrossSign-side state:
 * provider listeners, the remembered provider object and the account.
 *
 * LIMITATION (wallet-extension level, not CrossSign): EIP-1193 has no
 * dapp-side API to revoke a site authorization inside the extension, so
 * `eth_requestAccounts` may still resolve quickly next time the user picks
 * this wallet. CrossSign therefore always re-reads the account list on an
 * explicit connect and never adopts a session without one.
 */
export function disconnectEvmSession(): void {
  if (!activeSession) return;
  retireSession();
  notifySessionChanged();
}

/** Subscribe to session changes (connect / account switch / chain switch). */
export function onEvmSessionChange(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery — EIP-6963 + read-only legacy scan
// ─────────────────────────────────────────────────────────────────────────────

interface RegistryRecord {
  entry: WalletEntry;
  provider: Eip1193Provider;
}

const providerRegistry = new Map<string, RegistryRecord>();
const registryListeners = new Set<() => void>();
let eip6963ListenerInstalled = false;

function notifyRegistryChanged(): void {
  for (const listener of registryListeners) listener();
}

/**
 * Install the EIP-6963 announceProvider listener once and keep it for the
 * page lifetime (wallets may enable late). This only ever READS announced
 * providers — it does not touch or define window.ethereum.
 */
function ensureEip6963Listener(): void {
  if (eip6963ListenerInstalled || typeof window === "undefined") return;
  eip6963ListenerInstalled = true;

  window.addEventListener(
    "eip6963:announceProvider",
    (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail?.info?.rdns || !detail.provider) return;

      const id = `eip6963:${detail.info.rdns}`;
      const previous = providerRegistry.get(id);
      if (previous && previous.provider === detail.provider) return; // no change

      providerRegistry.set(id, {
        entry: {
          id,
          name: detail.info.name,
          icon: detail.info.icon ?? null,
          ecosystem: "evm",
          discovery: "eip-6963",
          installUrl: null,
        },
        provider: detail.provider,
      });
      notifyRegistryChanged();
    },
  );
}

function requestEip6963Providers(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** Read-only legacy providers: window.ethereum + its providers array. */
function collectLegacyProviders(): Eip1193Provider[] {
  if (typeof window === "undefined") return [];
  const ethereum = (window as unknown as { ethereum?: Eip1193Provider & InjectedEvmFlags })
    .ethereum;
  if (!ethereum) return [];

  const candidates: Eip1193Provider[] = [ethereum];
  if (Array.isArray(ethereum.providers)) {
    for (const provider of ethereum.providers) {
      if (provider && typeof (provider as Eip1193Provider).request === "function") {
        candidates.push(provider as Eip1193Provider);
      }
    }
  }

  // Dedup by provider object identity.
  const seen = new Set<Eip1193Provider>();
  return candidates.filter((provider) => {
    if (seen.has(provider)) return false;
    seen.add(provider);
    return typeof provider.request === "function";
  });
}

/** Most-specific flags first — many wallets set isMetaMask for compatibility. */
function identifyLegacyEvmWallet(flags: InjectedEvmFlags): string {
  if (flags.isRabby) return "Rabby";
  if (flags.isCoinbaseWallet) return "Coinbase Wallet";
  if (flags.isZerion) return "Zerion";
  if (flags.isOkxWallet || flags.isOKExWallet) return "OKX Wallet";
  if (flags.isTrust || flags.isTrustWallet) return "Trust Wallet";
  if (flags.isBraveWallet) return "Brave Wallet";
  if (flags.isPhantom) return "Phantom";
  if (flags.isMetaMask) return "MetaMask";
  return "Injected wallet";
}

/**
 * Every EVM wallet actually discoverable in this browser right now.
 * EIP-6963 announcements win (richer, standard metadata); legacy-only
 * providers are appended, keyed by provider identity so the same extension
 * is never listed twice.
 */
export function listEvmWallets(): WalletEntry[] {
  ensureEip6963Listener();

  const entries: WalletEntry[] = [];
  const knownProviders = new Set<Eip1193Provider>();
  const seenWalletKeys = new Set<string>();

  for (const record of providerRegistry.values()) {
    entries.push(record.entry);
    knownProviders.add(record.provider);
    seenWalletKeys.add(record.entry.name.toLowerCase());
  }

  for (const provider of collectLegacyProviders()) {
    if (knownProviders.has(provider)) continue; // already announced via EIP-6963
    const flags = provider as Eip1193Provider & InjectedEvmFlags;
    const name = identifyLegacyEvmWallet(flags);
    const key = name.toLowerCase();
    if (seenWalletKeys.has(key)) continue; // same wallet, standard + legacy
    seenWalletKeys.add(key);
    entries.push({
      // Stable id — no array indices, so late EIP-6963 announcements
      // cannot invalidate a wallet the user is about to click.
      id: `injected:evm:${key}`,
      name,
      icon: null,
      ecosystem: "evm",
      discovery: "injected",
      installUrl: null,
    });
  }

  return entries;
}

function findEvmProvider(walletId: string): RegistryRecord | null {
  // EIP-6963 record, if present.
  const fromRegistry = providerRegistry.get(walletId);
  if (fromRegistry) return fromRegistry;

  // Legacy entry: re-scan and match by the wallet's identified name.
  const entry = listEvmWallets().find((wallet) => wallet.id === walletId);
  if (!entry) return null;
  const known = new Set([...providerRegistry.values()].map((record) => record.provider));
  const provider = collectLegacyProviders().find(
    (candidate) =>
      !known.has(candidate) &&
      identifyLegacyEvmWallet(candidate as Eip1193Provider & InjectedEvmFlags).toLowerCase() ===
        entry.name.toLowerCase(),
  );
  return provider ? { entry, provider } : null;
}

/** Subscribe to discovery changes (EIP-6963 announcements may arrive late). */
export function subscribeEvmWallets(onChange: () => void): () => void {
  ensureEip6963Listener();
  registryListeners.add(onChange);
  requestEip6963Providers();
  return () => registryListeners.delete(onChange);
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect
// ─────────────────────────────────────────────────────────────────────────────

function sessionView(): EvmSession {
  if (!activeSession) throw new WalletError("Wallet session was lost.");
  const { walletId, walletName, walletIcon, address, chainId } = activeSession;
  return { walletId, walletName, walletIcon, address, chainId };
}

/**
 * Connect the EVM wallet the user picked (`eth_requestAccounts` on THAT
 * wallet's own provider — never a blind `window.ethereum` assumption) and
 * remember it as the active session, including its current chain id.
 */
export async function connectEvmWallet(walletId: string): Promise<EvmSession> {
  const record = findEvmProvider(walletId);
  if (!record) {
    throw new WalletError("That wallet is no longer available. Please pick another one.");
  }

  const { provider } = record;
  const name = record.entry.name;

  let accounts: string[];
  try {
    accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  } catch (err) {
    if (isUserRejection(err)) {
      throw new WalletError(`Connection was rejected in ${name}.`, true);
    }
    if (isRequestAlreadyPending(err)) {
      throw new WalletError(
        `${name} already has a pending connection request — open the extension and approve or reject it first.`,
      );
    }
    throw new WalletError(`Could not connect to ${name}.`);
  }

  const address = accounts?.[0];
  if (!address) {
    throw new WalletError(`${name} did not return an account.`);
  }

  const chainId = await readChainId(provider);

  // Retire any previous session (its provider listeners too) before
  // replacing it — switching wallets leaves nothing dangling.
  retireSession();

  activeSession = {
    walletId,
    walletName: name,
    walletIcon: record.entry.icon,
    address,
    chainId,
    provider,
    detach: attachSessionListeners(provider),
  };
  notifySessionChanged();
  return sessionView();
}

/** Attach live-session listeners; returns a teardown that removes them. */
function attachSessionListeners(provider: Eip1193Provider): () => void {
  const onChainChanged = (chainId: unknown) => {
    if (!activeSession || activeSession.provider !== provider) return;
    activeSession.chainId = parseChainId(chainId);
    notifySessionChanged();
  };

  const onAccountsChanged = (accounts: unknown) => {
    if (!activeSession || activeSession.provider !== provider) return;
    const list = Array.isArray(accounts) ? (accounts as string[]) : [];
    if (list.length === 0) {
      // Wallet fully disconnected → the session must die with it.
      retireSession();
    } else {
      // Account switch inside the wallet. The session tracks the wallet's
      // truth (the new account), and the verification layer invalidates any
      // in-flight attempt that was bound to the old one.
      activeSession.address = list[0];
    }
    notifySessionChanged();
  };

  provider.on?.("chainChanged", onChainChanged);
  provider.on?.("accountsChanged", onAccountsChanged);

  return () => {
    provider.removeListener?.("chainChanged", onChainChanged);
    provider.removeListener?.("accountsChanged", onAccountsChanged);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain management — Arbitrum Sepolia (421614)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Make sure the active EVM wallet is on Arbitrum Sepolia. Switches via
 * `wallet_switchEthereumChain`; if the wallet doesn't know the chain yet
 * (EIP-1193 4902 / older wallets), adds it via `wallet_addEthereumChain`
 * with the official Arbitrum Sepolia parameters.
 */
export async function ensureArbitrumSepolia(): Promise<void> {
  const session = activeSession;
  if (!session) {
    throw new WalletError("No Arbitrum wallet is connected.");
  }

  const current = await readChainId(session.provider);
  if (current === EVM_TARGET_CHAIN_ID) {
    session.chainId = current;
    notifySessionChanged();
    return;
  }

  try {
    await session.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: EVM_TARGET_CHAIN_ID_HEX }],
    });
  } catch (err) {
    if (isUserRejection(err)) {
      throw new WalletError(
        `Network switch was rejected in ${session.walletName}. CrossSign needs Arbitrum Sepolia (chain ${EVM_TARGET_CHAIN_ID}) to submit.`,
        true,
      );
    }
    // 4902 = chain not recognised → offer to add it, then continue.
    try {
      await session.provider.request({
        method: "wallet_addEthereumChain",
        params: [TARGET_CHAIN_PARAMS],
      });
    } catch (addErr) {
      if (isUserRejection(addErr)) {
        throw new WalletError(`Adding Arbitrum Sepolia was rejected in ${session.walletName}.`, true);
      }
      throw new WalletError(`Could not switch ${session.walletName} to Arbitrum Sepolia.`);
    }
  }

  const updated = await readChainId(session.provider);
  if (updated !== EVM_TARGET_CHAIN_ID) {
    throw new WalletError(`${session.walletName} is still not on Arbitrum Sepolia.`);
  }
  session.chainId = updated;
  notifySessionChanged();
}

"use client";

/**
 * Hydration-safe wallet discovery hooks.
 *
 * The rules these hooks follow (they are the reason /verify no longer
 * hydration-errors):
 *
 *   1. The FIRST client render must exactly match the server render —
 *      `ready: false, wallets: []` on both sides. No browser API is read
 *      during render (the old `useMemo(() => window.phantom…)` pattern).
 *   2. Discovery happens inside `useEffect`, strictly after hydration.
 *   3. Lists keep updating afterwards (Wallet Standard register events /
 *      EIP-6963 announce events), so wallets that initialise late appear
 *      without a page reload.
 */

import { useEffect, useState } from "react";

import type { WalletEntry } from "@/lib/wallet/types";
import { listSolanaWallets, subscribeSolanaWallets } from "@/lib/wallet/solana";
import { listEvmWallets, subscribeEvmWallets } from "@/lib/wallet/evm";

interface WalletsState {
  /** False until the first post-hydration scan completes. */
  ready: boolean;
  wallets: WalletEntry[];
}

const INITIAL: WalletsState = { ready: false, wallets: [] };

function useDiscoveredWallets(
  list: () => WalletEntry[],
  subscribe: (onChange: () => void) => () => void,
): WalletsState {
  const [state, setState] = useState<WalletsState>(INITIAL);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (alive) setState({ ready: true, wallets: list() });
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
    // list/subscribe are stable module functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

/** Wallets discoverable via the Solana Wallet Standard (+ legacy injected). */
export function useSolanaWallets(): WalletsState {
  return useDiscoveredWallets(listSolanaWallets, subscribeSolanaWallets);
}

/** Wallets discoverable via EIP-6963 (+ read-only legacy injected scan). */
export function useEvmWallets(): WalletsState {
  return useDiscoveredWallets(listEvmWallets, subscribeEvmWallets);
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  EvmConnection,
  ProofRecord,
  VerificationSource,
  VerificationState,
  VerificationStatus,
  WalletAccount,
} from "@/types";
import {
  connectLiveWallet,
  createChallengeForWallet,
  signLiveChallenge,
  submitSignature,
} from "@/lib/verify-service";
import {
  connectDemoWallet,
  signDemoChallenge,
  verifyDemoSignature,
} from "@/lib/demo-adapter";
import { saveProof } from "@/lib/registry";
import { hasSolanaWallet } from "@/lib/wallet/solana";
import {
  connectEvmWallet,
  ensureArbitrumSepolia,
  getActiveEvmSession,
  onEvmSessionChange,
} from "@/lib/wallet/evm";
import { NETWORK } from "@/lib/config";

export type WalletModalKind = "solana" | "evm";

interface VerificationContextValue {
  state: VerificationState;
  /** Run the scripted simulation (source = demo). */
  startVerification: (source: VerificationSource) => Promise<void>;
  /** Connect the Solana wallet the user picked in the selector. */
  connectSolanaWallet: (walletId: string) => Promise<void>;
  /** Connect the Arbitrum (EVM) wallet the user picked in the selector. */
  connectEvmWallet: (walletId: string) => Promise<void>;
  /** Ask the connected EVM wallet to switch to Arbitrum Sepolia. */
  switchEvmToArbitrum: () => Promise<void>;
  sign: () => Promise<void>;
  reset: () => void;
  retry: () => void;
  setSource: (source: VerificationSource) => void;
  clearNotice: () => void;
  /** Which wallet selector is open (null = closed). Only ever set on the client. */
  walletModal: WalletModalKind | null;
  openWalletModal: (kind: WalletModalKind) => void;
  closeWalletModal: () => void;
}

const INITIAL_STATE: VerificationState = {
  status: "idle",
  source: "live",
  account: null,
  challenge: null,
  error: null,
  proof: null,
  stepIndex: 0,
  evm: null,
  notice: null,
};

const VerificationContext = createContext<VerificationContextValue | null>(
  null,
);

function evmViewFromSession(): EvmConnection | null {
  const session = getActiveEvmSession();
  if (!session) return null;
  return {
    address: session.address,
    walletName: session.walletName,
    walletIcon: session.walletIcon,
    chainId: session.chainId,
    wrongChain: session.chainId !== NETWORK.chainId,
  };
}

export function VerificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VerificationState>(INITIAL_STATE);
  const [walletModal, setWalletModal] = useState<WalletModalKind | null>(null);
  const busyRef = useRef(false);
  // Latest state for async orchestration (avoids stale closures across awaits).
  const stateRef = useRef(state);
  stateRef.current = state;
  // Resolves the "connect an Arbitrum wallet" prompt opened mid-flow by sign().
  const evmPromptRef = useRef<((connected: boolean) => void) | null>(null);

  const update = useCallback((patch: Partial<VerificationState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // ── Hydration-safe client-only effects ────────────────────────────────────
  // The server render and the first client render are identical; everything
  // browser-dependent happens here, strictly after hydration.

  // Default to the interactive demo when no Solana wallet is discoverable
  // (e.g. reviewing on a fresh machine). Runs after paint — no flash of
  // inconsistent markup, no hydration mismatch.
  useEffect(() => {
    if (!hasSolanaWallet()) {
      setState((prev) =>
        prev.status === "idle" && prev.source === "live"
          ? { ...prev, source: "demo" }
          : prev,
      );
    }
  }, []);

  // Mirror the EVM wallet session into React state (chain/account changes
  // made inside the wallet update the UI live).
  useEffect(() => {
    return onEvmSessionChange(() => {
      setState((prev) => ({ ...prev, evm: evmViewFromSession() }));
    });
  }, []);

  const settleEvmPrompt = useCallback((connected: boolean) => {
    const resolve = evmPromptRef.current;
    if (resolve) {
      evmPromptRef.current = null;
      resolve(connected);
    }
  }, []);

  const closeWalletModal = useCallback(() => {
    setWalletModal(null);
    // Closing the modal while the flow waits for an Arbitrum wallet = cancel.
    settleEvmPrompt(false);
  }, [settleEvmPrompt]);

  const openWalletModal = useCallback((kind: WalletModalKind) => {
    setWalletModal(kind);
  }, []);

  const setSource = useCallback(
    (source: VerificationSource) => {
      settleEvmPrompt(false);
      setState({ ...INITIAL_STATE, source });
    },
    [settleEvmPrompt],
  );

  // ── Demo path (unchanged behaviour) ───────────────────────────────────────

  const startVerification = useCallback(
    async (source: VerificationSource) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        setState({ ...INITIAL_STATE, source, status: "connecting" });

        // 1. Connect the wallet first — the challenge binds the wallet key.
        const account = await connectDemoWallet();

        // 2. Build the canonical challenge for THIS wallet.
        const challenge = createChallengeForWallet(account);

        setState({
          source,
          status: "connected",
          account,
          challenge,
          error: null,
          proof: null,
          stepIndex: 2,
          evm: evmViewFromSession(),
          notice: null,
        });
      } catch (err) {
        update({
          source,
          status: "failed",
          error: err instanceof Error ? err.message : "Connection failed.",
          stepIndex: 1,
        });
      } finally {
        busyRef.current = false;
      }
    },
    [update],
  );

  // ── Live Solana path ──────────────────────────────────────────────────────

  const connectSolanaWallet = useCallback(
    async (walletId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        setState((prev) => ({
          ...INITIAL_STATE,
          source: "live",
          status: "connecting",
          evm: prev.evm,
        }));

        // 1. Connect the chosen wallet — the challenge binds the wallet key.
        const account = await connectLiveWallet(walletId);

        // 2. Build the canonical challenge for THIS wallet.
        const challenge = createChallengeForWallet(account);

        setState({
          source: "live",
          status: "connected",
          account,
          challenge,
          error: null,
          proof: null,
          stepIndex: 2,
          evm: evmViewFromSession(),
          notice: null,
        });
        setWalletModal(null);
      } catch (err) {
        // Back to idle; the selector surfaces the reason inline.
        setState((prev) => ({
          ...INITIAL_STATE,
          source: prev.source,
          evm: prev.evm,
        }));
        throw err;
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  // ── Arbitrum (EVM) path ───────────────────────────────────────────────────

  const connectEvmWalletById = useCallback(async (walletId: string) => {
    try {
      await connectEvmWallet(walletId);
      const view = evmViewFromSession();
      setState((prev) => ({
        ...prev,
        evm: view,
        notice:
          view && !view.wrongChain
            ? null
            : view
              ? `${view.walletName} is on the wrong network — switch to Arbitrum Sepolia to submit.`
              : prev.notice,
      }));
      setWalletModal(null);
      settleEvmPrompt(true);
    } catch (err) {
      // The selector surfaces the reason inline; the flow is untouched.
      throw err;
    }
  }, [settleEvmPrompt]);

  const switchEvmToArbitrum = useCallback(async () => {
    try {
      await ensureArbitrumSepolia();
      setState((prev) => ({ ...prev, evm: evmViewFromSession(), notice: null }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        notice:
          err instanceof Error
            ? err.message
            : "Could not switch the wallet to Arbitrum Sepolia.",
      }));
    }
  }, []);

  // ── Sign + submit ─────────────────────────────────────────────────────────

  const sign = useCallback(async () => {
    const { account, challenge, source } = stateRef.current;
    if (!account || !challenge || busyRef.current) return;

    busyRef.current = true;
    update({ status: "signing", error: null, notice: null });
    try {
      let signatureBase58: string;

      if (source === "demo") {
        const payload = await signDemoChallenge(
          challenge.message,
          account.publicKey,
        );
        signatureBase58 = payload.signatureBase58;
      } else {
        // Message-only Ed25519 signature — never a transaction request.
        const signed = await signLiveChallenge(challenge.message);
        signatureBase58 = signed.signatureBase58;
      }

      // Live submissions additionally need an Arbitrum (EVM) wallet on the
      // right network. Orchestrate it now, before anything touches the chain.
      if (source === "live") {
        if (!getActiveEvmSession()) {
          const connected = await new Promise<boolean>((resolve) => {
            evmPromptRef.current = resolve;
            setWalletModal("evm");
          });
          if (!connected) {
            update({
              status: "connected",
              stepIndex: 2,
              notice:
                "Connect an Arbitrum wallet (MetaMask, Rabby, OKX Wallet…) to submit the on-chain verification.",
            });
            return;
          }
        }

        try {
          await ensureArbitrumSepolia();
          const view = evmViewFromSession();
          if (view && view.wrongChain) {
            update({
              status: "connected",
              stepIndex: 2,
              notice: `${view.walletName} is still not on Arbitrum Sepolia — switch networks to submit.`,
            });
            return;
          }
          update({ evm: view });
        } catch (err) {
          update({
            status: "connected",
            stepIndex: 2,
            notice:
              err instanceof Error
                ? err.message
                : "Could not switch the wallet to Arbitrum Sepolia.",
          });
          return;
        }
      }

      update({ status: "verifying", stepIndex: 3 });

      let proof: ProofRecord;
      if (source === "demo") {
        proof = await verifyDemoSignature({
          account,
          message: challenge.message,
          signatureBase58,
        });
      } else {
        proof = await submitSignature({
          account,
          challenge,
          signatureBase58,
        });
      }

      saveProof(proof);
      update({ status: "verified", proof, stepIndex: 4, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed.";
      const rejected =
        /rejected/i.test(message) || /denied/i.test(message);
      update({
        status: rejected ? "rejected" : "failed",
        error: message,
        stepIndex: 2,
      });
    } finally {
      busyRef.current = false;
    }
  }, [update]);

  const reset = useCallback(() => {
    settleEvmPrompt(false);
    setWalletModal(null);
    setState(INITIAL_STATE);
  }, [settleEvmPrompt]);

  const retry = useCallback(() => {
    setState((prev) => ({ ...prev, status: "idle", error: null }));
  }, []);

  const clearNotice = useCallback(() => {
    setState((prev) => ({ ...prev, notice: null }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      startVerification,
      connectSolanaWallet,
      connectEvmWallet: connectEvmWalletById,
      switchEvmToArbitrum,
      sign,
      reset,
      retry,
      setSource,
      clearNotice,
      walletModal,
      openWalletModal,
      closeWalletModal,
    }),
    [
      state,
      startVerification,
      connectSolanaWallet,
      connectEvmWalletById,
      switchEvmToArbitrum,
      sign,
      reset,
      retry,
      setSource,
      clearNotice,
      walletModal,
      openWalletModal,
      closeWalletModal,
    ],
  );

  return (
    <VerificationContext.Provider value={value}>
      {children}
    </VerificationContext.Provider>
  );
}

export function useVerification(): VerificationContextValue {
  const ctx = useContext(VerificationContext);
  if (!ctx) {
    throw new Error(
      "useVerification must be used within a VerificationProvider",
    );
  }
  return ctx;
}

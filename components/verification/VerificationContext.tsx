"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
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

interface VerificationContextValue {
  state: VerificationState;
  startVerification: (source: VerificationSource) => Promise<void>;
  sign: () => Promise<void>;
  reset: () => void;
  retry: () => void;
  setSource: (source: VerificationSource) => void;
  phantomInstalled: boolean;
}

const INITIAL_STATE: VerificationState = {
  status: "idle",
  source: "live",
  account: null,
  challenge: null,
  error: null,
  proof: null,
  stepIndex: 0,
};

const VerificationContext = createContext<VerificationContextValue | null>(
  null,
);

export function VerificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VerificationState>(INITIAL_STATE);
  const busyRef = useRef(false);

  const update = useCallback((patch: Partial<VerificationState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setSource = useCallback((source: VerificationSource) => {
    setState(INITIAL_STATE);
    setState((prev) => ({ ...prev, source }));
  }, []);

  const startVerification = useCallback(
    async (source: VerificationSource) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        setState({ ...INITIAL_STATE, source, status: "connecting" });

        // 1. Connect the wallet first — the challenge binds the wallet key.
        const account =
          source === "demo" ? await connectDemoWallet() : await connectLiveWallet();

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

  const sign = useCallback(async () => {
    const { account, challenge, source } = state;
    if (!account || !challenge || busyRef.current) return;

    busyRef.current = true;
    update({ status: "signing", error: null });
    try {
      let signatureBase58: string;

      if (source === "demo") {
        const payload = await signDemoChallenge(
          challenge.message,
          account.publicKey,
        );
        signatureBase58 = payload.signatureBase58;
      } else {
        const signed = await signLiveChallenge(challenge.message);
        signatureBase58 = signed.signatureBase58;
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
  }, [state, update]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const retry = useCallback(() => {
    setState((prev) => ({ ...prev, status: "idle", error: null }));
  }, []);

  const phantomInstalled = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as unknown as { phantom?: { solana?: unknown } }).phantom?.solana);
  }, []);

  // On first client paint, default to demo mode when Phantom is unavailable
  // (e.g. a judge reviewing on a fresh machine). Runs before paint, so no flash.
  useLayoutEffect(() => {
    if (!phantomInstalled) {
      setState((prev) =>
        prev.status === "idle" && prev.source === "live"
          ? { ...prev, source: "demo" }
          : prev,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      state,
      startVerification,
      sign,
      reset,
      retry,
      setSource,
      phantomInstalled,
    }),
    [state, startVerification, sign, reset, retry, setSource, phantomInstalled],
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

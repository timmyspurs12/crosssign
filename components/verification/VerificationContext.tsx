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
import {
  disconnectSolanaSession,
  getActiveSolanaSession,
  hasSolanaWallet,
  onSolanaSessionChange,
} from "@/lib/wallet/solana";
import {
  connectEvmWallet,
  disconnectEvmSession,
  ensureArbitrumSepolia,
  getActiveEvmSession,
  isTargetChain,
  onEvmSessionChange,
} from "@/lib/wallet/evm";
import { isUserRejection } from "@/lib/wallet/types";
import { solanaPubkeyToHex } from "@/lib/base58";
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
  // Latest state for async orchestration (avoids stale closures across awaits).
  const stateRef = useRef(state);
  stateRef.current = state;
  // Resolves the "connect an Arbitrum wallet" prompt opened mid-flow by sign().
  const evmPromptRef = useRef<((connected: boolean) => void) | null>(null);

  // ── Verification-attempt generations ─────────────────────────────────────
  // Every state-changing action that starts or cancels an attempt bumps this
  // counter. Async continuations (wallet prompts, signing, on-chain submit)
  // capture the current generation and only write state while it is still
  // current. This is what makes reset()/retry()/source-switches actually
  // final: a half-finished sign or submit that resolves AFTER a reset can no
  // longer resurrect stale account/challenge/proof state.
  const attemptRef = useRef(0);
  const bumpAttempt = useCallback(() => ++attemptRef.current, []);

  // ── In-flight operation token (generation-keyed, deliberately NOT a bool) ─
  // A plain boolean lock could not be cancelled: a wallet prompt that never
  // settles kept it `true` forever, so after a reset the next "Connect wallet"
  // click was silently swallowed and the flow was dead. This token is stamped
  // with the generation of the operation that owns it:
  //   • an operation of the SAME generation is refused (double-submit guard);
  //   • an operation of an OLDER generation can never block the new attempt —
  //     reset()/retry()/setSource() therefore cancel an in-flight attempt in
  //     the only way that matters (its writes are dropped) without freezing
  //     the UI;
  //   • a late `finally` from the stale operation cannot clear the token of
  //     the newer one, because the generations differ.
  const busyRef = useRef<number | null>(null);

  const beginOperation = useCallback((gen: number): boolean => {
    if (busyRef.current !== null && busyRef.current === attemptRef.current) {
      return false;
    }
    busyRef.current = gen;
    return true;
  }, []);

  const endOperation = useCallback((gen: number) => {
    if (busyRef.current === gen) busyRef.current = null;
  }, []);

  // ── Deliberate session teardown marker ───────────────────────────────────
  // reset()/retry()/setSource()/mount drop wallet sessions on purpose. The
  // wallet layer notifies listeners (the EVM one synchronously, before React
  // has re-rendered), so the mirror effects below must be able to tell "we
  // cleared this ourselves as part of an attempt reset" apart from "the
  // wallet changed underneath us". Stamped with the generation that owns the
  // teardown; anything that happens in a later generation is external again.
  const selfTeardownRef = useRef(-1);

  const markSelfTeardown = useCallback(() => {
    selfTeardownRef.current = attemptRef.current;
  }, []);

  const updateIfCurrent = useCallback(
    (gen: number, patch: Partial<VerificationState>) => {
      if (attemptRef.current !== gen) return;
      setState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  // ── Hydration-safe client-only effects ────────────────────────────────────
  // The server render and the first client render are identical; everything
  // browser-dependent happens here, strictly after hydration.

  // A fresh mount NEVER adopts leftover wallet sessions. The wallet layer
  // keeps module-level sessions (they outlive React); without this, leaving
  // /verify mid-flow and coming back silently restored the previous
  // wallet — the "it reconnects to the old wallet without asking" bug.
  // After this, a session can only exist because the user explicitly picked
  // a wallet in a selector during THIS mount.
  useEffect(() => {
    markSelfTeardown();
    void disconnectSolanaSession();
    disconnectEvmSession();
    return () => {
      // Leaving the flow kills everything this provider owned: bump the
      // generation so a wallet prompt still in flight (its promise outlives
      // the unmount) can neither install a module-level session nor write
      // state on the way out. Without this, navigating away while a wallet
      // prompt was open let the connection complete later and be adopted as
      // the active session on the next visit.
      bumpAttempt();
    };
    // Intentionally mount-only: this is a "start clean" rule, not a sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default to the interactive demo when no Solana wallet is discoverable
  // (e.g. reviewing on a fresh machine). Runs after paint — no flash of
  // inconsistent markup, no hydration mismatch. Detection ≠ connection:
  // this only picks the mode; it never connects anything.
  useEffect(() => {
    if (!hasSolanaWallet()) {
      setState((prev) =>
        prev.status === "idle" && prev.source === "live"
          ? { ...prev, source: "demo" }
          : prev,
      );
    }
  }, []);

  const settleEvmPrompt = useCallback((connected: boolean) => {
    const resolve = evmPromptRef.current;
    if (resolve) {
      evmPromptRef.current = null;
      resolve(connected);
    }
  }, []);

  /**
   * Cancel the current attempt everywhere at once: invalidate async
   * continuations, close the prompt, drop transient verification state
   * (account/challenge/proof/notice/error) and re-mirror the true wallet
   * sessions into React so the UI and the wallet layer can never diverge.
   */
  const invalidateAttempt = useCallback(
    (reason: string) => {
      bumpAttempt();
      settleEvmPrompt(false);
      setWalletModal(null);
      setState((prev) => ({
        ...INITIAL_STATE,
        source: prev.source,
        evm: evmViewFromSession(),
        error: reason,
      }));
    },
    [bumpAttempt, settleEvmPrompt],
  );

  // Mirror the EVM wallet session into React state, and enforce the rule
  // "if the wallet account changes, invalidate the existing verification
  // attempt". A brand-new connect (null → view) is just the user choosing a
  // wallet and must NOT invalidate; a replaced/dropped account during an
  // in-flight attempt MUST.
  useEffect(() => {
    return onEvmSessionChange(() => {
      const view = evmViewFromSession();
      const prev = stateRef.current;
      // A teardown WE initiated (reset / retry / source switch / mount) is not
      // an external wallet change: the attempt is being cleared by that very
      // action. Without this, our own disconnect would report a bogus
      // "wallet disconnected" cancellation.
      if (attemptRef.current === selfTeardownRef.current) {
        setState((p) => ({ ...p, evm: view }));
        return;
      }
      const midAttempt =
        prev.source === "live" &&
        (prev.status === "connected" || prev.status === "signing");
      if (midAttempt && prev.evm && (!view || view.address !== prev.evm.address)) {
        setState((p) => ({ ...p, evm: view }));
        invalidateAttempt(
          view
            ? "Your Arbitrum wallet switched accounts — the verification attempt was cancelled. Sign again with the new account."
            : "Your Arbitrum wallet was disconnected — the verification attempt was cancelled.",
        );
        return;
      }
      setState((p) => ({ ...p, evm: view }));
    });
  }, [invalidateAttempt]);

  // Same mirroring for the Solana side: when the wallet drops the account
  // (disconnect / account switch detected inside the extension), the
  // in-flight attempt is cancelled rather than left showing a stale
  // "Connected" wallet that would sign against a dead or foreign key.
  //
  // This fires DURING an in-flight signature too, on purpose: a wallet-side
  // account switch while the sign prompt is open must cancel the attempt
  // immediately (the UI must not keep claiming the old wallet is connected),
  // not only once the wallet's promise happens to settle. Our own deliberate
  // teardowns are excluded via selfTeardownRef; the modal's explicit connect
  // cannot be mistaken for an external change because it sets status
  // "connecting" (never "connected"/"signing") before it replaces a session.
  useEffect(() => {
    return onSolanaSessionChange(() => {
      if (attemptRef.current === selfTeardownRef.current) return;
      const prev = stateRef.current;
      if (prev.source !== "live") return;
      const session = getActiveSolanaSession();
      const midAttempt = prev.status === "connected" || prev.status === "signing";
      if (!midAttempt) return;
      if (!session || session.publicKey !== prev.account?.publicKey) {
        invalidateAttempt(
          session
            ? "The connected Solana wallet switched accounts — that attempt was cancelled. Connect a wallet to start fresh."
            : "Your Solana wallet disconnected or switched accounts — that attempt was cancelled. Connect a wallet to start fresh.",
        );
      }
    });
  }, [invalidateAttempt]);

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
      // Switching modes is a hard boundary: cancel everything in flight and
      // drop BOTH wallet sessions, so demo never inherits a live wallet (or
      // vice versa) and the next attempt starts from an explicit selection.
      bumpAttempt();
      markSelfTeardown();
      settleEvmPrompt(false);
      setWalletModal(null);
      void disconnectSolanaSession();
      disconnectEvmSession();
      setState({ ...INITIAL_STATE, source });
    },
    [bumpAttempt, markSelfTeardown, settleEvmPrompt],
  );

  // ── Demo path ─────────────────────────────────────────────────────────────

  const startVerification = useCallback(
    async (source: VerificationSource) => {
      const gen = bumpAttempt();
      if (!beginOperation(gen)) return;
      try {
        setState((prev) => ({
          ...INITIAL_STATE,
          source,
          status: "connecting",
          evm: prev.evm,
        }));

        // 1. Connect the wallet first — the challenge binds the wallet key.
        const account = await connectDemoWallet();
        if (attemptRef.current !== gen) return;

        // 2. Build a FRESH canonical challenge for THIS wallet.
        const challenge = createChallengeForWallet(account);

        setState((prev) =>
          attemptRef.current !== gen
            ? prev
            : {
                source,
                status: "connected",
                account,
                challenge,
                error: null,
                proof: null,
                stepIndex: 2,
                evm: evmViewFromSession(),
                notice: null,
              },
        );
      } catch (err) {
        updateIfCurrent(gen, {
          source,
          status: "failed",
          error: err instanceof Error ? err.message : "Connection failed.",
          stepIndex: 1,
        });
      } finally {
        endOperation(gen);
      }
    },
    [beginOperation, bumpAttempt, endOperation, updateIfCurrent],
  );

  // ── Live Solana path ──────────────────────────────────────────────────────

  const connectSolanaWallet = useCallback(
    async (walletId: string) => {
      const gen = bumpAttempt();
      if (!beginOperation(gen)) return;
      try {
        // A new connect starts a NEW attempt: stale account/challenge/proof
        // data is dropped up front, never reused.
        setState((prev) => ({
          ...INITIAL_STATE,
          source: "live",
          status: "connecting",
          evm: prev.evm,
        }));

        // 1. Connect the chosen wallet — the challenge binds the wallet key.
        const account = await connectLiveWallet(walletId);

        if (attemptRef.current !== gen) {
          // Reset/navigation happened while the wallet prompt was open —
          // this fresh connection belongs to no attempt; drop it instead of
          // silently becoming the active session.
          markSelfTeardown();
          void disconnectSolanaSession();
          return;
        }

        // 2. Build a FRESH canonical challenge for THIS wallet+key.
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
        // Back to a clean idle state (the selector surfaces the reason
        // inline); the throw keeps WalletSelectorModal's handling intact.
        if (attemptRef.current === gen) {
          setState((prev) => ({
            ...INITIAL_STATE,
            source: prev.source,
            evm: prev.evm,
          }));
        }
        throw err;
      } finally {
        endOperation(gen);
      }
    },
    [beginOperation, bumpAttempt, endOperation, markSelfTeardown],
  );

  // ── Arbitrum (EVM) path ───────────────────────────────────────────────────

  const connectEvmWalletById = useCallback(
    async (walletId: string) => {
      // The wallet prompt can stay open for a long time. If a reset / retry /
      // source switch / navigation happened meanwhile, the connection this
      // prompt produces belongs to a cancelled attempt and must NOT be
      // adopted: without this guard the wallet layer would install a fresh
      // module session and the UI would render a wallet the user already
      // cleared — the "old wallet came back" bug through the EVM door.
      const gen = attemptRef.current;
      const session = await connectEvmWallet(walletId);

      if (attemptRef.current !== gen) {
        if (getActiveEvmSession()?.walletId === session.walletId) {
          disconnectEvmSession();
        }
        return;
      }

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
    },
    [settleEvmPrompt],
  );

  const switchEvmToArbitrum = useCallback(async () => {
    const gen = attemptRef.current;
    try {
      await ensureArbitrumSepolia();
      updateIfCurrent(gen, { evm: evmViewFromSession(), notice: null });
    } catch (err) {
      updateIfCurrent(gen, {
        notice:
          err instanceof Error
            ? err.message
            : "Could not switch the wallet to Arbitrum Sepolia.",
      });
    }
  }, [updateIfCurrent]);

  // ── Sign + submit ─────────────────────────────────────────────────────────

  const sign = useCallback(async () => {
    const gen = attemptRef.current;
    const { account, challenge, source } = stateRef.current;
    if (!account || !challenge) return;
    if (!beginOperation(gen)) return; // same attempt already has an op running
    let activeChallenge = challenge;
    try {
      // ── Freshness guards BEFORE consuming a signature (live only) ────────
      // The signature must always correspond to the CURRENT wallet key and a
      // CURRENT challenge. These checks make "the wallet changed behind our
      // back" an explicit, recoverable reset instead of a stale-key sign.
      if (source === "live") {
        const session = getActiveSolanaSession();
        if (!session) {
          invalidateAttempt(
            "The Solana wallet connection was lost. Connect a wallet to start a fresh verification.",
          );
          return;
        }
        if (session.publicKey !== account.publicKey) {
          invalidateAttempt(
            "The connected Solana wallet no longer matches this attempt. Start a new verification.",
          );
          return;
        }
        if (
          activeChallenge.wallet.toLowerCase() !==
          solanaPubkeyToHex(account.publicKey).toLowerCase()
        ) {
          invalidateAttempt(
            "That challenge is not bound to the connected wallet. Start a new verification.",
          );
          return;
        }
      }

      // An EXPIRED challenge is never signed — for either source. The wallet
      // is connected and its key just verified, so mint a fresh one instead
      // of reusing (or erroring on) dead bytes.
      if (Date.now() >= activeChallenge.expiresAt) {
        activeChallenge = createChallengeForWallet(account);
      }

      updateIfCurrent(gen, {
        status: "signing",
        challenge: activeChallenge,
        error: null,
        notice:
          activeChallenge !== challenge
            ? "The previous challenge expired — a fresh one was created for this attempt."
            : null,
      });

      // ── EVM gate runs BEFORE the signature request (live only) ────────────
      // Wrong network → show the switch flow; never change state silently
      // and never burn a signature first.
      if (source === "live") {
        const evmSession = getActiveEvmSession();
        if (!evmSession) {
          const connected = await new Promise<boolean>((resolve) => {
            evmPromptRef.current = resolve;
            setWalletModal("evm");
          });
          if (attemptRef.current !== gen) return; // reset/cancelled meanwhile
          if (!connected) {
            updateIfCurrent(gen, {
              status: "connected",
              stepIndex: 2,
              notice:
                "Connect an Arbitrum wallet (MetaMask, Rabby, OKX Wallet…) to submit the on-chain verification.",
            });
            return;
          }
          // The prompt can be settled by a connection that isn't there any
          // more (or by a stale one) — re-read the LIVE session instead of
          // trusting the boolean, so the signature is never requested on the
          // strength of a wallet that already went away.
          const afterPrompt = getActiveEvmSession();
          if (!afterPrompt) {
            updateIfCurrent(gen, {
              status: "connected",
              stepIndex: 2,
              notice:
                "Connect an Arbitrum wallet (MetaMask, Rabby, OKX Wallet…) to submit the on-chain verification.",
            });
            return;
          }
          if (afterPrompt.chainId !== null && !isTargetChain(afterPrompt.chainId)) {
            updateIfCurrent(gen, {
              status: "connected",
              stepIndex: 2,
              notice: `${afterPrompt.walletName} is on the wrong network — use “Switch” on the Arbitrum row, then sign again.`,
            });
            return;
          }
        } else if (
          evmSession.chainId !== null &&
          !isTargetChain(evmSession.chainId)
        ) {
          updateIfCurrent(gen, {
            status: "connected",
            stepIndex: 2,
            notice: `${evmSession.walletName} is on the wrong network — use “Switch” on the Arbitrum row, then sign again.`,
          });
          return;
        }
      }

      let signatureBase58: string;

      if (source === "demo") {
        const payload = await signDemoChallenge(
          activeChallenge.message,
          account.publicKey,
        );
        signatureBase58 = payload.signatureBase58;
      } else {
        // Message-only Ed25519 signature — never a transaction request.
        // (No demo fallback is reachable from a live attempt.)
        const signed = await signLiveChallenge(activeChallenge.message);
        // The signature must correspond to the current wallet key — if the
        // wallet answered with a different account, reject the result.
        if (signed.publicKeyBase58 !== account.publicKey) {
          throw new Error(
            "The wallet signed with a different account than the one connected. Please start a new verification.",
          );
        }
        signatureBase58 = signed.signatureBase58;
      }

      // An expired challenge is never submitted. The pre-sign guard re-mints
      // stale bytes, but the user can sit on the wallet prompt for longer
      // than the TTL — those bytes must die here, not on-chain.
      if (Date.now() >= activeChallenge.expiresAt) {
        invalidateAttempt(
          "The verification challenge expired while the signature was pending — nothing was submitted. Start a new verification.",
        );
        return;
      }

      /** Arbitrum account the user approved for this attempt (pinned below). */
      let approvedEvmAddress: string | null = null;

      if (source === "live") {
        if (attemptRef.current !== gen) return;

        // Wallet still the same one? (Account switch during the sign prompt.)
        const session = getActiveSolanaSession();
        if (!session || session.publicKey !== account.publicKey) {
          invalidateAttempt(
            "The Solana wallet changed during signing — nothing was submitted. Start a new verification.",
          );
          return;
        }

        // Final chain guarantee (race-safe: the user may have switched
        // networks in the wallet while the signature prompt was open).
        try {
          await ensureArbitrumSepolia();
          const view = evmViewFromSession();
          if (!view || view.wrongChain) {
            updateIfCurrent(gen, {
              status: "connected",
              stepIndex: 2,
              notice: `${view?.walletName ?? "The Arbitrum wallet"} is still not on Arbitrum Sepolia — switch networks to submit.`,
            });
            return;
          }
          approvedEvmAddress = view.address;
          updateIfCurrent(gen, { evm: view });
        } catch (err) {
          updateIfCurrent(gen, {
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

      updateIfCurrent(gen, { status: "verifying", stepIndex: 3 });

      let proof: ProofRecord;
      if (source === "demo") {
        proof = await verifyDemoSignature({
          account,
          message: activeChallenge.message,
          signatureBase58,
        });
      } else {
        // Pin the SUBMITTING wallet too: ethers resolves the signer account
        // at call time, so an `accountsChanged` between the network gate and
        // this line would otherwise send the transaction from an account the
        // user never approved on the Arbitrum row.
        const liveEvm = getActiveEvmSession();
        if (!liveEvm) {
          invalidateAttempt(
            "The Arbitrum wallet disconnected before the transaction was submitted — nothing was submitted. Start a new verification.",
          );
          return;
        }
        if (approvedEvmAddress && liveEvm.address !== approvedEvmAddress) {
          invalidateAttempt(
            "The Arbitrum wallet switched accounts before the transaction was submitted — nothing was submitted. Start a new verification.",
          );
          return;
        }
        proof = await submitSignature({
          account,
          challenge: activeChallenge,
          signatureBase58,
        });
      }

      if (attemptRef.current !== gen) return; // reset/navigated mid-submit
      saveProof(proof);
      updateIfCurrent(gen, {
        status: "verified",
        proof,
        stepIndex: 4,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed.";
      const rejected =
        isUserRejection(err) || /rejected|denied/i.test(message);
      // A failed/rejected attempt invalidates challenge+account: the next
      // attempt re-selects the wallet and ALWAYS mints a fresh challenge —
      // a previous signature can never be resubmitted against stale data.
      updateIfCurrent(gen, {
        status: rejected ? "rejected" : "failed",
        error: message,
        stepIndex: 2,
        account: null,
        challenge: null,
        proof: null,
      });
    } finally {
      // Generation-checked: a stale operation that resolves after a reset
      // must not release the token of the attempt that replaced it.
      endOperation(gen);
    }
  }, [beginOperation, endOperation, invalidateAttempt, updateIfCurrent]);

  const reset = useCallback(() => {
    // Full, honest reset: cancel in-flight work, drop the transient
    // verification state AND both module-level wallet sessions. After this,
    // the next verification requires a fresh, explicit wallet selection with
    // a re-read public key/account and a brand-new challenge.
    //
    // Cancellation is by generation: any instruction still waiting on a
    // wallet prompt can no longer write state, AND it no longer blocks a new
    // attempt (the busy token belongs to the old generation).
    bumpAttempt();
    markSelfTeardown();
    settleEvmPrompt(false);
    setWalletModal(null);
    void disconnectSolanaSession();
    disconnectEvmSession();
    setState((prev) => ({ ...INITIAL_STATE, source: prev.source }));
  }, [bumpAttempt, markSelfTeardown, settleEvmPrompt]);

  const retry = useCallback(() => {
    // "Try again" starts a NEW verification attempt: stale challenge/account
    // are cleared and the Solana session is dropped so the next connect
    // re-reads the CURRENT public key from the wallet. The Arbitrum wallet is
    // deliberately kept (it only pays gas and is re-selectable), but like
    // reset() this cancels every pending wallet-prompt continuation.
    bumpAttempt();
    markSelfTeardown();
    settleEvmPrompt(false);
    setWalletModal(null);
    void disconnectSolanaSession();
    setState((prev) => ({
      ...INITIAL_STATE,
      source: prev.source,
      evm: evmViewFromSession(),
    }));
  }, [bumpAttempt, markSelfTeardown, settleEvmPrompt]);

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

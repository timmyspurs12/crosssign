"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Info,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { Spinner } from "@/components/ui/Spinner";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { StatusDot } from "@/components/ui/StatusDot";
import { ChallengePanel } from "@/components/verification/ChallengePanel";
import { WalletCard } from "@/components/verification/WalletCard";
import { EvmWalletRow } from "@/components/verification/EvmWalletRow";
import { VerifyingSequence } from "@/components/verification/VerifyingSequence";
import { useVerification } from "@/components/verification/VerificationContext";
import { cn } from "@/lib/utils";

export function VerifyFlow() {
  const {
    state,
    startVerification,
    sign,
    retry,
    setSource,
    openWalletModal,
    switchEvmToArbitrum,
    clearNotice,
  } = useVerification();

  const source = state.source;
  const isDemo = source === "demo";

  return (
    <div className="flex flex-col gap-6">
      <SourceToggle source={source} setSource={setSource} />

      <StepIndicator current={state.stepIndex} />

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {/* terminal header */}
        <div className="flex items-center justify-between border-b border-line bg-paper/60 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            </span>
            <span className="ml-2 font-mono text-[11.5px] text-ink-muted">
              crosssign · verify
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isDemo && <Tag tone="warn" dot>Interactive demo</Tag>}
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-caps text-ink-faint">
              <StatusDot
                kind={
                  state.status === "verified"
                    ? "success"
                    : state.status === "failed" || state.status === "rejected"
                      ? "error"
                      : state.status === "idle"
                        ? "idle"
                        : "pending"
                }
              />
              {statusLabel(state.status)}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {/* ——— IDLE / CONNECT ——— */}
          {(state.status === "idle" ||
            state.status === "connecting" ||
            state.status === "failed" ||
            state.status === "rejected") && (
            <ConnectState
              busy={state.status === "connecting"}
              error={state.error}
              isDemo={isDemo}
              onStart={() =>
                isDemo ? startVerification("demo") : openWalletModal("solana")
              }
              onConnectEvm={() => openWalletModal("evm")}
              onRetry={retry}
            />
          )}

          {/* ——— CONNECTED / SIGN ——— */}
          {(state.status === "connected" || state.status === "signing") &&
            state.account &&
            state.challenge && (
              <SignState
                isDemo={isDemo}
                signing={state.status === "signing"}
                onSign={sign}
                onConnectEvm={() => openWalletModal("evm")}
                onSwitchChain={switchEvmToArbitrum}
                onDismissNotice={clearNotice}
                onChangeSolanaWallet={() => openWalletModal("solana")}
              />
            )}

          {/* ——— VERIFYING ——— */}
          {state.status === "verifying" && (
            <VerifyingSequence source={source} />
          )}
        </div>
      </div>

      {/* demo disclaimer */}
      {isDemo && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] leading-relaxed text-warn">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong className="font-medium">Simulation mode.</strong> This is a
            scripted demonstration of the verification flow — it is{" "}
            <strong className="font-medium">not</strong> a real on-chain
            verification. Switch to <strong className="font-medium">Live</strong>{" "}
            and connect a Solana wallet (Phantom, Solflare, Backpack, OKX…) to
            verify for real.
          </span>
        </p>
      )}
    </div>
  );
}

/* ————————————————— Source toggle ————————————————— */

function SourceToggle({
  source,
  setSource,
}: {
  source: "live" | "demo";
  setSource: (s: "live" | "demo") => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="inline-flex rounded-lg border border-line bg-surface p-1">
        {(
          [
            { key: "live", label: "Live" },
            { key: "demo", label: "Interactive demo" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSource(opt.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors",
              source === opt.key
                ? "bg-ink text-surface"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {source === "demo" ? (
        <p className="hidden text-[12px] text-ink-muted sm:block">
          No wallet required
        </p>
      ) : (
        <p className="hidden text-[12px] text-ink-muted sm:block">
          Solana + Arbitrum wallets
        </p>
      )}
    </div>
  );
}

/* ————————————————— Connect state ————————————————— */

function ConnectState({
  busy,
  error,
  isDemo,
  onStart,
  onConnectEvm,
  onRetry,
}: {
  busy: boolean;
  error: string | null;
  isDemo: boolean;
  onStart: () => void;
  onConnectEvm: () => void;
  onRetry: () => void;
}) {
  const { state } = useVerification();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-10 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-paper">
        <Wallet className="h-6 w-6 text-ink-soft" />
      </div>
      <h2 className="mt-5 text-lg font-semibold text-ink">
        Connect your Solana wallet
      </h2>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
        {isDemo
          ? "Use a simulated wallet to preview the full verification flow."
          : "Pick any installed Solana wallet — Phantom, OKX Wallet, Solflare, Backpack and every other Wallet-Standard wallet. No funds will move."}
      </p>
      {!isDemo && (
        <p className="mt-2 max-w-sm rounded-md border border-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-faint">
          Live verification also uses an <span className="text-ink-soft">Arbitrum wallet</span> (MetaMask, Rabby, OKX, Zerion, Coinbase…) on Arbitrum Sepolia — you&apos;ll sign the Solana message, then confirm the on-chain transaction.
        </p>
      )}

      {error && (
        <div className="mt-5 w-full max-w-md rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-left">
          <p className="flex items-start gap-2 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button
          size="lg"
          variant="accent"
          onClick={onStart}
          disabled={busy}
        >
          {busy ? (
            <>
              <Spinner className="h-4 w-4" /> Connecting…
            </>
          ) : isDemo ? (
            "Start simulation"
          ) : (
            "Connect Solana wallet"
          )}
        </Button>

        {!isDemo && (
          <div className="mt-1 w-full max-w-sm rounded-xl border border-line bg-paper/70 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-left">
                <p className="text-[12.5px] font-medium text-ink">
                  Arbitrum wallet
                </p>
                <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                  {state.evm
                    ? state.evm.wrongChain
                      ? `${state.evm.walletName} · wrong network — Arbitrum Sepolia required`
                      : `${state.evm.walletName} · ${NETWORK_LABEL}`
                    : "Optional now — required before on-chain submit"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {state.evm && !state.evm.wrongChain && (
                  <Tag tone="good" dot>
                    Ready
                  </Tag>
                )}
                <Button size="sm" variant="secondary" onClick={onConnectEvm}>
                  {state.evm ? "Change" : "Connect"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ————————————————— Sign state ————————————————— */

function SignState({
  isDemo,
  signing,
  onSign,
  onConnectEvm,
  onSwitchChain,
  onDismissNotice,
  onChangeSolanaWallet,
}: {
  isDemo: boolean;
  signing: boolean;
  onSign: () => void;
  onConnectEvm: () => void;
  onSwitchChain: () => void;
  onDismissNotice: () => void;
  onChangeSolanaWallet: () => void;
}) {
  const { state } = useVerification();
  const account = state.account!;
  const challenge = state.challenge!;
  const walletName = account.walletName ?? "Your wallet";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <WalletCard
            account={account}
            source={state.source}
            status="pending"
            statusLabel="Connected"
          />
        </div>
        {!isDemo && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onChangeSolanaWallet}
            disabled={signing}
            className="shrink-0"
          >
            Change
          </Button>
        )}
      </div>

      {!isDemo && (
        <EvmWalletRow
          evm={state.evm}
          onConnect={onConnectEvm}
          onSwitch={onSwitchChain}
          disabled={signing}
        />
      )}

      {state.notice && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-accent/25 bg-accent-faint px-4 py-3">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-accent-strong">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {state.notice}
          </p>
          <button
            onClick={onDismissNotice}
            aria-label="Dismiss"
            className="rounded p-0.5 text-accent-strong/70 transition-colors hover:text-accent-strong"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">
            Sign the verification message
          </h3>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            {isDemo
              ? "The simulation will produce a signature automatically."
              : `${walletName} will ask you to approve this signature request — a message signature only, never a transaction.`}
          </p>
        </div>
        <ChallengePanel challenge={challenge} />
        <Button size="lg" variant="accent" onClick={onSign} disabled={signing}>
          {signing ? (
            <>
              <Spinner className="h-4 w-4" /> Waiting for signature…
            </>
          ) : (
            <>
              Sign verification
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

/* ————————————————— helpers ————————————————— */

const NETWORK_LABEL = "Arbitrum Sepolia";

function statusLabel(status: string): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Ready to sign";
    case "signing":
      return "Signing";
    case "verifying":
      return "Verifying";
    case "verified":
      return "Verified";
    case "rejected":
      return "Rejected";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

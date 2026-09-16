"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  Download,
  Wallet,
  X,
} from "lucide-react";

import { useEvmWallets, useSolanaWallets } from "@/lib/wallet/useWallets";
import { WalletError, type WalletEntry } from "@/lib/wallet/types";
import { useVerification } from "@/components/verification/VerificationContext";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

/**
 * Wallet selector — the single place users pick a wallet, for both
 * ecosystems.
 *
 *   - kind="solana" lists wallets discovered via the Solana Wallet Standard
 *     (+ legacy injected fallbacks): Phantom, OKX Wallet, Solflare,
 *     Backpack, …
 *   - kind="evm" lists wallets discovered via EIP-6963 (+ read-only legacy
 *     scan): MetaMask, OKX Wallet, Rabby, Zerion, Coinbase Wallet, …
 *
 * Only wallets that are actually discoverable in this browser are listed —
 * nothing is ever pretended to be installed. When nothing is detected, the
 * modal offers official install links instead.
 */

const INSTALL_LINKS = {
  solana: [
    { name: "Phantom", url: "https://phantom.app/download" },
    { name: "Solflare", url: "https://solflare.com/download" },
    { name: "Backpack", url: "https://backpack.app/download" },
    { name: "OKX Wallet", url: "https://www.okx.com/web3/download" },
  ],
  evm: [
    { name: "MetaMask", url: "https://metamask.io/download/" },
    { name: "Rabby", url: "https://rabby.io/" },
    { name: "Zerion", url: "https://zerion.io/download" },
    { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads" },
    { name: "OKX Wallet", url: "https://www.okx.com/web3/download" },
  ],
} as const;

const TITLES = {
  solana: {
    eyebrow: "Solana",
    title: "Connect Solana wallet",
    hint: "Signs the CrossSign challenge (Ed25519). No funds move.",
  },
  evm: {
    eyebrow: "Arbitrum",
    title: "Connect Arbitrum wallet",
    hint: "Submits the verification on Arbitrum Sepolia. You approve the transaction.",
  },
} as const;

export function WalletSelectorModal() {
  const { walletModal, closeWalletModal, connectSolanaWallet, connectEvmWallet } =
    useVerification();
  const kind = walletModal;

  // Hydration-safe discovery: identical empty render on the server and on
  // the first client render; real lists arrive strictly after hydration.
  const solana = useSolanaWallets();
  const evm = useEvmWallets();

  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; rejected: boolean } | null>(
    null,
  );
  const titleRef = useRef<HTMLHeadingElement>(null);

  const meta = kind ? TITLES[kind] : null;
  const wallets = kind === "solana" ? solana.wallets : evm.wallets;
  const ready = kind === "solana" ? solana.ready : evm.ready;

  useEffect(() => {
    // Reset per-open state whenever a selector opens/closes/switches.
    setConnectingId(null);
    setError(null);
  }, [kind]);

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    if (!kind) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeWalletModal();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [kind, closeWalletModal]);

  const handleSelect = useCallback(
    async (entry: WalletEntry) => {
      if (connectingId) return;
      setConnectingId(entry.id);
      setError(null);
      try {
        if (kind === "solana") {
          await connectSolanaWallet(entry.id);
        } else if (kind === "evm") {
          await connectEvmWallet(entry.id);
        }
      } catch (err) {
        const rejected = err instanceof WalletError && err.userRejected;
        setError({
          message:
            err instanceof Error
              ? err.message
              : `Could not connect to ${entry.name}.`,
          rejected,
        });
        setConnectingId(null);
        return;
      }
      // Success: the context closes the modal and advances the flow.
      setConnectingId(null);
    },
    [kind, connectingId, connectSolanaWallet, connectEvmWallet],
  );

  if (!kind || !meta) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      {/* scrim */}
      <button
        aria-label="Close wallet selector"
        onClick={closeWalletModal}
        className="absolute inset-0 cursor-default bg-ink/40 backdrop-blur-[2px]"
      />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">{meta.eyebrow}</p>
            <h2
              ref={titleRef}
              tabIndex={-1}
              className="mt-1 text-[16.5px] font-semibold tracking-tight text-ink outline-none"
            >
              {meta.title}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              {meta.hint}
            </p>
          </div>
          <button
            onClick={closeWalletModal}
            aria-label="Close"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* wallet list — only wallets actually discovered in this browser */}
        <div className="max-h-[320px] overflow-y-auto">
          {wallets.map((entry) => (
            <button
              key={entry.id}
              onClick={() => handleSelect(entry)}
              disabled={connectingId !== null}
              className={cn(
                "group flex w-full items-center gap-3.5 border-b border-line/60 px-5 py-3.5 text-left transition-colors last:border-b-0",
                connectingId === entry.id
                  ? "bg-paper"
                  : "hover:bg-paper disabled:opacity-50",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-paper">
                {entry.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.icon}
                    alt=""
                    className="h-6 w-6 rounded-[5px]"
                    draggable={false}
                  />
                ) : (
                  <Wallet className="h-[18px] w-[18px] text-ink-soft" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] font-medium text-ink">
                  {entry.name}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-caps text-ink-faint">
                  {entry.discovery === "wallet-standard"
                    ? "Wallet Standard"
                    : entry.discovery === "eip-6963"
                      ? "EIP-6963"
                      : "Detected"}
                </span>
              </span>
              {connectingId === entry.id ? (
                <Spinner className="h-4 w-4 text-accent" />
              ) : (
                <ChevronRight className="h-4 w-4 text-ink-faint transition-colors group-hover:text-ink-soft" />
              )}
            </button>
          ))}

          {ready && wallets.length === 0 && (
            <div className="px-5 py-6">
              <p className="text-[13px] font-medium text-ink">
                No {kind === "solana" ? "Solana" : "Arbitrum"} wallets detected
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                Install one of these wallets, then reopen this selector.
              </p>
              <div className="mt-3.5 grid grid-cols-1 gap-1.5">
                {INSTALL_LINKS[kind].map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between rounded-lg border border-line bg-paper px-3.5 py-2.5 transition-colors hover:border-line-strong"
                  >
                    <span className="flex items-center gap-2.5 text-[13px] font-medium text-ink">
                      <Download className="h-3.5 w-3.5 text-ink-faint" />
                      {link.name}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-ink-faint transition-colors group-hover:text-ink" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {!ready && (
            <div className="flex items-center justify-center gap-2 px-5 py-8">
              <Spinner className="h-4 w-4 text-ink-faint" />
              <span className="font-mono text-[11px] uppercase tracking-caps text-ink-faint">
                Scanning for wallets
              </span>
            </div>
          )}
        </div>

        {/* inline error (e.g. connection cancelled in the wallet) */}
        {error && (
          <div className="border-t border-line px-5 py-3">
            <p
              className={cn(
                "flex items-start gap-2 text-[12.5px] leading-relaxed",
                error.rejected ? "text-ink-muted" : "text-danger",
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error.message}
            </p>
          </div>
        )}

        {/* footer */}
        <div className="border-t border-line bg-paper/60 px-5 py-3">
          <p className="font-mono text-[10.5px] uppercase tracking-caps text-ink-faint">
            Only wallets installed in this browser are shown
          </p>
        </div>
      </motion.div>
    </div>
  );
}

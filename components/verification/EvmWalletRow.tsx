"use client";

import { ArrowRight, Ban, RefreshCcw, Wallet } from "lucide-react";

import type { EvmConnection } from "@/types";
import { NETWORK } from "@/lib/config";
import { truncateMiddle } from "@/lib/utils";
import { Tag } from "@/components/ui/Tag";

/**
 * Arbitrum (EVM) wallet row — the explicit, separate counterpart to the
 * Solana wallet card. Shows the wallet the user connected (name + address),
 * the live network state, and a switch action when the wallet is not on
 * Arbitrum Sepolia. Nothing here assumes `window.ethereum` is any
 * particular wallet.
 */
export function EvmWalletRow({
  evm,
  onConnect,
  onSwitch,
  disabled,
}: {
  evm: EvmConnection | null;
  onConnect: () => void;
  onSwitch: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
            {evm?.walletIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={evm.walletIcon} alt="" className="h-5 w-5 rounded" draggable={false} />
            ) : (
              <Wallet className="h-5 w-5 text-ink-soft" />
            )}
          </div>
          {evm ? (
            <div className="min-w-0">
              <p className="font-mono text-[13px] font-medium text-ink">
                {truncateMiddle(evm.address, 8, 6)}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                {evm.walletName} · Arbitrum wallet
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[13.5px] font-medium text-ink">
                Arbitrum wallet
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                Needed to submit the on-chain verification
              </p>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {evm ? (
            evm.wrongChain ? (
              <>
                <Tag tone="warn" dot>
                  Wrong network
                </Tag>
                <button
                  onClick={onSwitch}
                  disabled={disabled}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:border-ink/40 hover:bg-paper disabled:opacity-45"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Switch
                </button>
              </>
            ) : (
              <Tag tone="good" dot>
                {NETWORK.name}
              </Tag>
            )
          ) : (
            <Buttonish onClick={onConnect} disabled={disabled} />
          )}
        </div>
      </div>
    </div>
  );
}

function Buttonish({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-[12.5px] font-medium text-ink transition-all hover:border-ink/40 hover:bg-paper active:translate-y-[1px] disabled:opacity-45 disabled:pointer-events-none"
    >
      <Ban className="h-3.5 w-3.5 text-ink-faint" />
      Connect
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

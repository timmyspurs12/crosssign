"use client";

import { Wallet } from "lucide-react";
import type { VerificationSource, WalletAccount } from "@/types";
import { truncateMiddle } from "@/lib/utils";
import { Tag } from "@/components/ui/Tag";
import { StatusDot, type StatusKind } from "@/components/ui/StatusDot";

export function WalletCard({
  account,
  source,
  status,
  statusLabel,
}: {
  account: WalletAccount;
  source: VerificationSource;
  status: StatusKind;
  statusLabel: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface overflow-hidden">
            {account.walletIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.walletIcon} alt="" className="h-6 w-6 rounded-md" draggable={false} />
            ) : (
              <Wallet className="h-5 w-5 text-ink-soft" />
            )}
          </div>
          <div>
            <p className="font-mono text-[13px] font-medium text-ink">
              {truncateMiddle(account.address, 8, 6)}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {account.network} · {account.ecosystem === "solana" ? "Phantom" : account.ecosystem}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {source === "demo" && <Tag tone="warn">Simulation</Tag>}
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft">
            <StatusDot kind={status} />
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

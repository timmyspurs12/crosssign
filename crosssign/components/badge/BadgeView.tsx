"use client";

import { ExternalLink, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { IdentityBadge } from "@/components/badge/IdentityBadge";
import { Tag } from "@/components/ui/Tag";
import { formatDateTime, truncateMiddle } from "@/lib/utils";
import { chainLabel, explorerUrl } from "@/lib/proof-format";
import { VERIFICATION_METHOD_LABEL } from "@/lib/config";
import type { ProofRecord } from "@/types";

export function BadgeView({ proof }: { proof: ProofRecord }) {
  const isDemo = proof.source === "demo";

  const details: { label: string; value: string; mono?: boolean; link?: string }[] = [
    { label: "Badge", value: proof.badgeId, mono: true },
    { label: "Wallet", value: truncateMiddle(proof.walletAddress, 10, 8), mono: true },
    { label: "Originating ecosystem", value: `${chainLabel(proof.origin)} (${proof.originNetwork})` },
    { label: "Destination chain", value: `Arbitrum (${proof.destinationNetwork})` },
    { label: "Verification method", value: VERIFICATION_METHOD_LABEL[proof.method] ?? proof.method },
    { label: "Verification timestamp", value: formatDateTime(proof.verifiedAt) },
    {
      label: "Transaction hash",
      value: truncateMiddle(proof.transactionHash, 10, 8),
      mono: true,
      link: explorerUrl("tx", proof),
    },
    {
      label: "Contract address",
      value: truncateMiddle(proof.contractAddress, 10, 8),
      mono: true,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="eyebrow">CrossSign verified identity</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            Identity credential
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && <Tag tone="warn" dot>Simulation</Tag>}
          <Tag tone="good" dot>Active</Tag>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* seal */}
        <div className="hairline-grid flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-10 py-10 shadow-card">
          <IdentityBadge size={190} className="text-ink" />
          <p className="mt-5 font-mono text-[11px] uppercase tracking-capsWide text-ink-muted">
            CrossSign · {proof.badgeId}
          </p>
        </div>

        {/* details */}
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <div className="border-b border-line px-5 py-3.5">
            <p className="eyebrow">Credential details</p>
          </div>
          <dl>
            {details.map((d, i) => (
              <div
                key={d.label}
                className={`flex items-center justify-between gap-4 px-5 py-3 ${
                  i !== details.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <dt className="text-[13px] text-ink-muted">{d.label}</dt>
                <dd className="flex items-center gap-2">
                  <span
                    className={
                      d.mono
                        ? "font-mono text-[12.5px] text-ink"
                        : "text-[13px] text-ink"
                    }
                  >
                    {d.value}
                  </span>
                  {d.link && (
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink-faint transition-colors hover:text-ink"
                      aria-label={`Open ${d.label} in explorer`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* compact proof strip */}
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <p className="eyebrow mb-4">Proof</p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <ProofNode label="Solana wallet" value={truncateMiddle(proof.walletAddress, 8, 6)} icon={KeyRound} />
          <div className="flex flex-col items-center justify-center gap-1 sm:px-2">
            <span className="font-mono text-[10px] uppercase tracking-caps text-ink-faint">
              {proof.method}
            </span>
            <span className="h-px w-10 bg-line-strong sm:w-12" />
          </div>
          <ProofNode label="CrossSign verifier" value="Arbitrum · Stylus" icon={ShieldCheck} />
          <div className="flex flex-col items-center justify-center gap-1 sm:px-2">
            <span className="font-mono text-[10px] uppercase tracking-caps text-ink-faint">
              badge
            </span>
            <span className="h-px w-10 bg-line-strong sm:w-12" />
          </div>
          <ProofNode label="Badge issued" value={proof.badgeId} icon={Fingerprint} />
        </div>
      </div>

      {/* ownership vs verification distinction */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-good/25 bg-good-soft p-5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-good">
            <ShieldCheck className="h-4 w-4" />
            What this proves
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            The holder of this credential demonstrated control of the listed
            wallet by producing a valid {proof.method} signature, verified
            on-chain on Arbitrum.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <KeyRound className="h-4 w-4 text-ink-muted" />
            What this does not prove
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            CrossSign does not know, and does not claim, the real-world
            identity of the wallet holder. This credential proves{" "}
            <strong className="font-medium text-ink-soft">
              wallet ownership
            </strong>
            , not who you are.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProofNode({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof KeyRound;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
        <Icon className="h-4 w-4 text-ink-soft" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-caps text-ink-faint">{label}</p>
        <p className="truncate font-mono text-[12.5px] text-ink">{value}</p>
      </div>
    </div>
  );
}

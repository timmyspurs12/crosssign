"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IdentityBadge } from "@/components/badge/IdentityBadge";
import { formatTime, truncateMiddle } from "@/lib/utils";
import { chainLabel, explorerUrl } from "@/lib/proof-format";
import { serializeProof } from "@/lib/registry";
import type { ProofRecord } from "@/types";

/**
 * The post-verification success state. Used inline on /verify and as the
 * body of the standalone /verify/success page.
 */
export function VerificationSuccess({
  proof,
  onReset,
}: {
  proof: ProofRecord;
  /** When provided, renders an in-context reset instead of a page link. */
  onReset?: () => void;
}) {
  const rows = [
    { label: "Wallet", value: truncateMiddle(proof.walletAddress, 8, 6), mono: true },
    { label: "Network", value: `${chainLabel(proof.origin)} · ${proof.originNetwork}` },
    { label: "Verification time", value: formatTime(proof.verifiedAt), mono: true },
    { label: "Transaction", value: truncateMiddle(proof.transactionHash, 8, 6), mono: true },
    { label: "Contract", value: truncateMiddle(proof.contractAddress, 8, 6), mono: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center py-6 text-center"
    >
      <IdentityBadge size={148} className="text-ink" />

      <div className="mt-6 flex items-center gap-2">
        <BadgeCheck className="h-5 w-5 text-good" />
        <h2 className="text-xl font-semibold text-ink sm:text-2xl">
          Identity verified
        </h2>
      </div>
      <p className="mt-2 text-[14.5px] text-ink-muted">
        Solana wallet ownership verified on Arbitrum.
      </p>

      <dl className="mt-8 w-full max-w-md rounded-xl border border-line bg-paper text-left">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`flex items-center justify-between gap-4 px-4 py-3 ${
              i !== rows.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <dt className="text-[12.5px] text-ink-muted">{row.label}</dt>
            <dd
              className={
                row.mono
                  ? "font-mono text-[12.5px] text-ink"
                  : "text-[13px] text-ink"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          href={`/badge?proof=${serializeProof(proof)}`}
          size="lg"
          variant="accent"
        >
          View verification
          <ArrowRight className="h-4 w-4" />
        </Button>
        {onReset ? (
          <Button size="lg" variant="secondary" onClick={onReset}>
            Verify another wallet
          </Button>
        ) : (
          <Button href="/verify" size="lg" variant="secondary">
            Verify another wallet
          </Button>
        )}
      </div>

      <a
        href={explorerUrl("tx", proof)}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
      >
        View transaction on the explorer
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </motion.div>
  );
}

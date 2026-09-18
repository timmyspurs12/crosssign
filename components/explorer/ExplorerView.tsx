"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileSearch, ShieldCheck } from "lucide-react";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import { IdentityBadge } from "@/components/badge/IdentityBadge";
import { formatDateTime, seededHex, truncateMiddle } from "@/lib/utils";
import { chainLabel, explorerUrl } from "@/lib/proof-format";
import { latestProofs } from "@/lib/registry";
import { ChainLookup } from "@/components/explorer/ChainLookup";
import { VERIFICATION_METHOD_LABEL } from "@/lib/config";
import { buildProofRecord } from "@/lib/proof-format";
import type { ProofRecord } from "@/types";

export function ExplorerView({ initialProof }: { initialProof?: ProofRecord | null }) {
  const [proof, setProof] = useState<ProofRecord | null>(initialProof ?? null);

  // Hydration-safe: the proof list is client/browser state, so the first
  // render (server AND client) must show the empty branch. The list only
  // appears via the effect after hydration — reading it during render is
  // exactly what caused the classic "Did not expect server HTML to contain
  // a <button> in a <div>" hydration mismatch on this page.
  const [recent, setRecent] = useState<ProofRecord[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  useEffect(() => {
    setRecent(latestProofs(6));
    setRecentLoaded(true);
  }, []);

  const loadExample = () => {
    const demo = buildProofRecord({
      id: `demo_${Date.now().toString(36)}`,
      origin: "solana",
      originNetwork: "Mainnet-Beta",
      walletAddress: "8xKf1mQz3nTv9R2sW4yA6bD8eF0gH2iJ4kL6mN8oP2qR5sT7uV9wX1yZ3aB5cD7e",
      publicKey: "8xKf1mQz3nTv9R2sW4yA6bD8eF0gH2iJ4kL6mN8oP2qR5sT7uV9wX1yZ3aB5cD7e",
      destination: "arbitrum",
      destinationNetwork: "Sepolia",
      method: "Ed25519",
      verifiedAt: new Date(),
      transactionHash: seededHex("example-tx", 64),
    });
    setProof({ ...demo, source: "demo" });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow">Public proof</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          CrossSign Proof
        </h1>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-ink-muted">
          Inspect a verification proof without connecting a wallet. Anyone can
          check that a proof is genuine.
        </p>
      </div>

      <ChainLookup />

      {proof ? (
        <Certificate proof={proof} />
      ) : (
        <div className="hairline-grid flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-16 text-center shadow-card">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-paper">
            <FileSearch className="h-5 w-5 text-ink-soft" />
          </div>
          <h2 className="mt-4 text-[15px] font-semibold text-ink">
            No proof loaded
          </h2>
          <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
            Paste a shared proof link (with <code className="font-mono text-[12px]">?proof=…</code>)
            or load an example to see what a certificate looks like.
          </p>
          <Button className="mt-5" variant="secondary" onClick={loadExample}>
            Load an example proof
          </Button>
        </div>
      )}

      {/* recent verifications */}
      <div>
        <p className="eyebrow mb-3">Recent verifications</p>
        {!recentLoaded ? (
          <div className="rounded-xl border border-dashed border-line bg-surface/50 px-5 py-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-caps text-ink-faint">
              Checking this session…
            </p>
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface/50 px-5 py-8 text-center">
            <p className="text-[13px] text-ink-muted">
              No verifications yet in this session. Run a verification to see it
              listed here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setProof(p)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-accent/40"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        p.source === "demo"
                          ? "h-2 w-2 rounded-full bg-warn"
                          : "h-2 w-2 rounded-full bg-good"
                      }
                    />
                    <span className="font-mono text-[12.5px] text-ink">
                      {truncateMiddle(p.walletAddress, 8, 6)}
                    </span>
                    {p.source === "demo" && <Tag tone="warn">Sim</Tag>}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-caps text-ink-faint">
                    {p.method} · {formatDateTime(p.verifiedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Certificate({ proof }: { proof: ProofRecord }) {
  const isDemo = proof.source === "demo";
  const fields = [
    { label: "Origin", value: `${chainLabel(proof.origin)} · ${proof.originNetwork}` },
    { label: "Destination", value: `Arbitrum · ${proof.destinationNetwork}` },
    { label: "Method", value: VERIFICATION_METHOD_LABEL[proof.method] ?? proof.method, mono: true },
    { label: "Badge", value: "Active", mono: false, good: true },
    { label: "Verified at", value: formatDateTime(proof.verifiedAt) },
    {
      label: "Transaction",
      value: truncateMiddle(proof.transactionHash, 12, 8),
      mono: true,
      link: explorerUrl("tx", proof),
    },
    { label: "Contract", value: truncateMiddle(proof.contractAddress, 12, 8), mono: true },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      {/* certificate header */}
      <div className="flex flex-col gap-4 border-b border-line bg-paper/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface">
            <ShieldCheck className="h-5 w-5 text-accent-strong" />
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-capsWide text-ink-muted">
              Certificate of verification
            </p>
            <p className="text-[14px] font-semibold text-ink">
              CrossSign · Proof #{proof.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDemo && <Tag tone="warn" dot>Simulation</Tag>}
          <Tag tone="good" dot>Verified</Tag>
        </div>
      </div>

      <div className="grid gap-6 p-6 lg:grid-cols-[auto_1fr] lg:items-center">
        <div className="flex justify-center">
          <IdentityBadge size={150} className="text-ink" />
        </div>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label} className="flex items-center justify-between gap-4 border-b border-line pb-2.5">
              <dt className="text-[12.5px] text-ink-muted">{f.label}</dt>
              <dd className="flex items-center gap-2">
                <span
                  className={
                    f.good
                      ? "font-mono text-[12px] uppercase tracking-caps text-good"
                      : f.mono
                        ? "font-mono text-[12.5px] text-ink"
                        : "text-[13px] text-ink"
                  }
                >
                  {f.value}
                </span>
                {f.link && (
                  <a
                    href={f.link}
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-faint transition-colors hover:text-ink"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="border-t border-line px-6 py-3 text-[12px] leading-relaxed text-ink-faint">
        This certificate proves wallet ownership — it does not assert the
        real-world identity of the holder. {isDemo ? "Simulated proof; not a real on-chain verification." : ""}
      </p>
    </div>
  );
}

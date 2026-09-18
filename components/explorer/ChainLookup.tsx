"use client";

import { useState } from "react";
import { Search, ExternalLink, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { NETWORK } from "@/lib/config";
import { cn, truncateMiddle } from "@/lib/utils";

/**
 * On-chain lookup.
 *
 * Everything shown here is read back FROM the deployed contracts through the
 * app's own read APIs (`/api/verification/:address`, `/api/badge/:id`) — the
 * chain is the source of truth, not this session's memory. Nothing is fetched
 * until the user asks, so the page stays static and warning-free on load.
 */

interface OnChainVerification {
  owner: string;
  public_key: string;
  origin_network: string;
  destination_network: string;
  chain_id: bigint | string;
  verified_at: bigint | string;
  badge_id: bigint | string;
  active: boolean;
}

interface OnChainBadge {
  owner: string;
  public_key: string;
  origin_network: string;
  verified_at: bigint | string;
  badge_id: bigint | string;
  active: boolean;
}

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "unavailable"; detail: string }
  | { kind: "error"; detail: string }
  | { kind: "found"; account: string; verification: OnChainVerification | null; badge: OnChainBadge | null };

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function toUnixSeconds(value: bigint | string | number): number | null {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatVerifiedAt(value: bigint | string): string {
  const seconds = toUnixSeconds(value);
  if (seconds === null) return "—";
  return new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function hexToBytes(hex: string): string {
  const s = hex.startsWith("0x") ? hex.slice(2) : hex;
  return `${s.length / 2} bytes`;
}

export function ChainLookup() {
  const [value, setValue] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });

  async function lookUp(event: React.FormEvent) {
    event.preventDefault();
    const account = value.trim().toLowerCase();

    if (!ADDRESS_RE.test(account)) {
      setState({
        kind: "error",
        detail: "Enter an Arbitrum address: 0x followed by 40 hex characters.",
      });
      return;
    }

    setState({ kind: "loading" });

    try {
      const res = await fetch(`/api/verification/${account}`, { cache: "no-store" });

      if (res.status === 503) {
        setState({
          kind: "unavailable",
          detail:
            "The Arbitrum Sepolia RPC could not be reached from this deployment, or the contracts are not configured. Try again shortly.",
        });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", detail: `Read failed with status ${res.status}.` });
        return;
      }

      const data = (await res.json()) as { verified: boolean; record: OnChainVerification | null };

      if (!data.record) {
        setState({ kind: "empty" });
        return;
      }

      // A verification record carries its badge id — read the badge too, so the
      // lookup shows the same two halves the verification flow produced.
      let badge: OnChainBadge | null = null;
      const badgeId = data.record.badge_id?.toString();
      if (badgeId && badgeId !== "0") {
        try {
          const badgeRes = await fetch(`/api/badge/${badgeId}`, { cache: "no-store" });
          if (badgeRes.ok) {
            badge = ((await badgeRes.json()) as { badge: OnChainBadge | null }).badge ?? null;
          }
        } catch {
          // The verification record stands on its own; a missing badge read
          // must not invalidate it.
        }
      }

      setState({ kind: "found", account, verification: data.record, badge });
    } catch {
      setState({
        kind: "error",
        detail: "The lookup could not be completed. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="border-b border-line bg-paper/60 px-6 py-4">
        <p className="eyebrow">On-chain lookup</p>
        <h2 className="mt-1.5 text-[15px] font-semibold text-ink">
          Ask the contracts directly
        </h2>
        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          Reads <code className="font-mono text-[12px]">is_verified</code> and{" "}
          <code className="font-mono text-[12px]">verification_of</code> from the deployed
          verifier on {NETWORK.name}. No wallet required.
        </p>
      </div>

      <form onSubmit={lookUp} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
        <label htmlFor="lookup-address" className="sr-only">
          Arbitrum address
        </label>
        <input
          id="lookup-address"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x… Arbitrum address"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3.5 py-2.5 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50"
        />
        <Button
          type="submit"
          variant="accent"
          disabled={state.kind === "loading"}
          className="shrink-0"
        >
          {state.kind === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Reading…
            </>
          ) : (
            <>
              <Search className="h-4 w-4" /> Look up
            </>
          )}
        </Button>
      </form>

      <div className="border-t border-line px-6 py-4">
        {state.kind === "idle" && (
          <p className="text-[13px] text-ink-faint">
            Paste an Arbitrum address that completed a verification to read its record back
            from the chain.
          </p>
        )}

        {state.kind === "loading" && (
          <p className="text-[13px] text-ink-muted">Reading {NETWORK.name}…</p>
        )}

        {state.kind === "error" && (
          <p className="flex items-start gap-2 text-[13px] text-danger">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {state.detail}
          </p>
        )}

        {state.kind === "unavailable" && (
          <p className="flex items-start gap-2 text-[13px] text-warn">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {state.detail}
          </p>
        )}

        {state.kind === "empty" && (
          <p className="flex items-start gap-2 text-[13px] text-ink-muted">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
            No active verification record for this address on {NETWORK.name}.
          </p>
        )}

        {state.kind === "found" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Tag tone={state.verification?.active ? "good" : "warn"} dot>
                {state.verification?.active ? "Verified" : "Inactive"}
              </Tag>
              <span className="font-mono text-[12px] text-ink-muted">
                {truncateMiddle(state.account, 12, 8)}
              </span>
              <a
                href={`${NETWORK.explorerUrl}/address/${state.account}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11.5px] text-ink-faint underline-offset-2 hover:text-ink hover:underline"
              >
                Arbitrum Sepolia <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {state.verification && (
              <Rows
                title="verification_of(account)"
                icon={<ShieldCheck className="h-3.5 w-3.5 text-good" />}
                rows={[
                  ["owner", state.verification.owner],
                  ["public key", `${truncateMiddle(state.verification.public_key, 18, 10)} (${hexToBytes(state.verification.public_key)})`],
                  ["origin network", state.verification.origin_network],
                  ["destination network", state.verification.destination_network],
                  ["chain id", String(state.verification.chain_id)],
                  ["verified at", formatVerifiedAt(state.verification.verified_at)],
                  ["badge id", String(state.verification.badge_id)],
                  ["active", String(state.verification.active)],
                ]}
              />
            )}

            {state.badge && (
              <Rows
                title={`badge(${state.badge.badge_id})`}
                icon={<ShieldCheck className="h-3.5 w-3.5 text-good" />}
                rows={[
                  ["owner", state.badge.owner],
                  ["origin network", state.badge.origin_network],
                  ["verified at", formatVerifiedAt(state.badge.verified_at)],
                  ["active", String(state.badge.active)],
                ]}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Rows({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: [string, string][];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        {icon}
        <span className="font-mono text-[11px] uppercase tracking-caps text-ink-faint">
          {title}
        </span>
      </div>
      <dl>
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={cn(
              "flex items-start justify-between gap-4 px-4 py-2.5",
              i !== rows.length - 1 && "border-b border-line",
            )}
          >
            <dt className="text-[12.5px] text-ink-muted">{label}</dt>
            <dd className="break-all text-right font-mono text-[12.5px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

"use client";

import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

const ROWS = [
  {
    label: "Signature scheme",
    solana: "Ed25519 (Phantom)",
    evm: "secp256k1 (ecrecover) only",
  },
  {
    label: "Where it runs",
    solana: "On-chain — Stylus (Rust → WASM)",
    evm: "In Solidity, if at all",
  },
  {
    label: "Native Ed25519",
    solana: "Yes — ed25519-dalek",
    evm: "Not supported",
  },
  {
    label: "Relative cost",
    solana: "~10–50× cheaper",
    evm: "Prohibitive / error-prone",
  },
];

export function TechnicalSection() {
  return (
    <section id="docs" className="scroll-mt-20 border-t border-line">
      <Container className="py-16 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <SectionHeading
              eyebrow="Under the hood"
              title="Verification that doesn't trust the middleman."
              description="CrossSign uses Stylus — Arbitrum's Rust-based VM — to verify Ed25519 signatures on-chain. The EVM cannot do this natively; CrossSign can, and it's cheaper than you'd think."
            />
            <div className="mt-8 space-y-4">
              <Note
                title="What we verify"
                body="Cryptographic control of a wallet — that you hold the key that produced a signature."
                tone="good"
              />
              <Note
                title="What we never claim"
                body="Real-world identity. CrossSign proves wallet ownership, not who you are."
                tone="neutral"
              />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="eyebrow">Why Stylus</p>
              <Tag tone="accent">Rust on-chain</Tag>
            </div>
            <table className="w-full text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-line font-mono text-[10.5px] uppercase tracking-caps text-ink-faint">
                  <th className="px-5 py-3 font-medium">Method</th>
                  <th className="px-5 py-3 font-medium">CrossSign (Stylus)</th>
                  <th className="px-5 py-3 font-medium">Plain EVM</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 font-medium text-ink-soft">
                      {row.label}
                    </td>
                    <td className="px-5 py-3.5 text-ink">{row.solana}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{row.evm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Note({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "good" | "neutral";
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface p-4">
      <span
        className={
          tone === "good"
            ? "mt-1 h-2 w-2 shrink-0 rounded-full bg-good"
            : "mt-1 h-2 w-2 shrink-0 rounded-full bg-ink-faint"
        }
      />
      <div>
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
          {body}
        </p>
      </div>
    </div>
  );
}

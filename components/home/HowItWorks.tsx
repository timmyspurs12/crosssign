"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: "01",
    title: "Connect",
    detail:
      "Connect the wallet you want to prove — any Solana Wallet-Standard wallet.",
    diagram: {
      left: "Solana wallet",
      right: "CrossSign",
      action: "Wallet connected",
    },
  },
  {
    n: "02",
    title: "Sign",
    detail:
      "Sign a single challenge message. It moves no funds and grants no approvals.",
    diagram: {
      left: "Solana wallet",
      right: "CrossSign",
      action: "Ed25519 signature",
    },
  },
  {
    n: "03",
    title: "Verify on-chain",
    detail:
      "The Stylus verifier checks the signature on Arbitrum. Nothing is trusted off-chain.",
    diagram: {
      left: "CrossSign",
      right: "Arbitrum Stylus",
      action: "Signature verified",
    },
  },
  {
    n: "04",
    title: "Badge issued",
    detail:
      "A soulbound CrossSign badge is issued. Any app can query it — no re-verification needed.",
    diagram: {
      left: "Arbitrum",
      right: "Badge registry",
      action: "Badge active",
    },
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);

  return (
    <section id="how" className="scroll-mt-20">
      <Container className="py-16 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title="Four steps. One proof."
          description="Select a step to follow what happens at each stage of a verification."
        />

        <div className="mt-12 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          {/* step list */}
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li key={step.n}>
                <button
                  onClick={() => setActive(i)}
                  className={cn(
                    "group flex w-full items-start gap-4 border-l-2 px-5 py-4 text-left transition-colors",
                    i === active
                      ? "border-accent bg-surface"
                      : "border-line hover:border-line-strong hover:bg-surface/60",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[13px] font-medium tabular",
                      i === active ? "text-accent-strong" : "text-ink-faint",
                    )}
                  >
                    {step.n}
                  </span>
                  <span>
                    <span
                      className={cn(
                        "block text-[15px] font-semibold",
                        i === active ? "text-ink" : "text-ink-soft",
                      )}
                    >
                      {step.title}
                    </span>
                    <span className="mt-1 block max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
                      {step.detail}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {/* diagram */}
          <div className="hairline-grid flex items-center justify-center rounded-2xl border border-line bg-surface p-8 shadow-card">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="w-full max-w-md"
              >
                <Diagram data={STEPS[active].diagram} stepIndex={active} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Diagram({
  data,
  stepIndex,
}: {
  data: { left: string; right: string; action: string };
  stepIndex: number;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between gap-4">
        <Node label={data.left} active />
        <div className="relative h-px flex-1 overflow-hidden bg-line">
          <motion.span
            className="absolute left-0 top-0 h-px w-full bg-accent"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ transformOrigin: "left" }}
          />
        </div>
        <Node label={data.right} active={stepIndex >= 2} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-4 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-caps text-accent-strong">
          {data.action}
        </span>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-caps text-ink-faint">
        {stepIndex < 3 ? "Awaiting next stage" : "Proof complete — reusable"}
      </p>
    </div>
  );
}

function Node({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={cn(
        "flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-xl border transition-colors",
        active ? "border-accent/40 bg-accent-faint" : "border-line bg-paper",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          active ? "bg-accent" : "bg-ink-faint",
        )}
      />
      <span
        className={cn(
          "font-mono text-[11px] font-medium uppercase tracking-caps",
          active ? "text-ink" : "text-ink-faint",
        )}
      >
        {label}
      </span>
    </div>
  );
}

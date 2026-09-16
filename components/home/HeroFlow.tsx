"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, PenLine, Boxes, BadgeCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Mark } from "@/components/layout/Logo";

type NodeState = "idle" | "active" | "done";

interface FlowNode {
  key: string;
  label: string;
  sub: string;
  icon?: "wallet" | "sign" | "mark" | "arbitrum" | "verified";
}

const NODES: FlowNode[] = [
  { key: "solana", label: "SOLANA WALLET", sub: "Phantom, Solflare, Backpack…", icon: "wallet" },
  { key: "sign", label: "SIGN", sub: "Ed25519", icon: "sign" },
  { key: "crosssign", label: "CROSSSIGN", sub: "Protocol", icon: "mark" },
  { key: "arbitrum", label: "ARBITRUM", sub: "Stylus", icon: "arbitrum" },
  { key: "verified", label: "VERIFIED", sub: "Badge issued", icon: "verified" },
];

const CYCLE_MS = 1500;
const PAUSE_AT_END_MS = 2400;

function NodeIcon({ icon, active }: { icon: FlowNode["icon"]; active: boolean }) {
  const cls = cn(
    "h-5 w-5 transition-colors",
    active ? "text-accent-strong" : "text-ink-faint",
  );
  switch (icon) {
    case "wallet":
      return <Wallet className={cls} />;
    case "sign":
      return <PenLine className={cls} />;
    case "arbitrum":
      return <Boxes className={cls} />;
    case "verified":
      return <BadgeCheck className={cls} />;
    case "mark":
      return (
        <span
          className={cn(
            "transition-opacity",
            active ? "opacity-100" : "opacity-40",
          )}
        >
          <Mark className="h-5 w-5" />
        </span>
      );
    default:
      return null;
  }
}

export function HeroFlow() {
  const [step, setStep] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = () => {
    setStep((s) => (s >= NODES.length - 1 ? 0 : s + 1));
  };

  useEffect(() => {
    timer.current = setTimeout(
      advance,
      step < 0 ? 600 : step === NODES.length - 1 ? PAUSE_AT_END_MS : CYCLE_MS,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [step]);

  const nodeState = (i: number): NodeState =>
    step < 0 ? "idle" : i < step ? "done" : i === step ? "active" : "idle";

  return (
    <div
      className="hairline-grid relative rounded-2xl border border-line bg-surface/70 p-6 shadow-card sm:p-8"
      onClick={advance}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && advance()}
      aria-label="Replay the verification flow animation"
    >
      <div className="mb-6 flex items-center justify-between">
        <p className="eyebrow">Verification flow — tap to replay</p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setStep(-1);
          }}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        {NODES.map((node, i) => {
          const state = nodeState(i);
          const isLast = i === NODES.length - 1;
          return (
            <Fragment key={node.key}>
              {/* node */}
              <div className="flex lg:flex-1 lg:flex-col lg:items-center lg:px-1">
                <div className="flex flex-1 items-start gap-3 lg:flex-col lg:items-center lg:gap-2 lg:text-center">
                  <div
                    className={cn(
                      "flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-xl border transition-all duration-300",
                      state === "active" &&
                        "border-accent bg-accent-soft shadow-[0_0_0_4px_rgba(0,179,164,0.08)]",
                      state === "done" && "border-line-strong bg-surface",
                      state === "idle" && "border-line bg-surface",
                    )}
                  >
                    <NodeIcon icon={node.icon} active={state !== "idle"} />
                  </div>
                  <div className="py-1 lg:py-0">
                    <p
                      className={cn(
                        "font-mono text-[11px] font-medium uppercase tracking-caps transition-colors",
                        state === "active"
                          ? "text-accent-strong"
                          : state === "done"
                            ? "text-ink"
                            : "text-ink-faint",
                      )}
                    >
                      {node.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {node.sub}
                    </p>
                  </div>
                </div>
              </div>

              {!isLast && (
                <>
                  {/* vertical connector (mobile) */}
                  <div className="ml-[27px] h-9 lg:hidden">
                    <ConnectorV
                      progress={state === "done" || state === "active" ? 1 : 0}
                    />
                  </div>
                  {/* horizontal connector (desktop) */}
                  <div className="hidden lg:block lg:flex-1 lg:self-center">
                    <ConnectorH
                      progress={state === "done" || state === "active" ? 1 : 0}
                    />
                  </div>
                </>
              )}
            </Fragment>
          );
        })}
      </div>

      <AnimatePresence>
        {step === NODES.length - 1 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-accent/25 bg-accent-soft py-2.5"
          >
            <BadgeCheck className="h-4 w-4 text-accent-strong" />
            <span className="font-mono text-[11px] font-medium uppercase tracking-caps text-accent-strong">
              Identity verified on Arbitrum
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConnectorV({ progress }: { progress: number }) {
  return (
    <span className="relative block h-full w-px overflow-hidden rounded-full bg-line">
      <motion.span
        className="absolute left-0 top-0 w-px bg-accent"
        initial={false}
        animate={{ height: `${progress * 100}%` }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
      {progress === 1 && (
        <motion.span
          className="absolute left-0 top-0 h-1 w-[3px] -translate-x-[1px] rounded-full bg-accent"
          animate={{ top: "100%" }}
          transition={{ duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
        />
      )}
    </span>
  );
}

function ConnectorH({ progress }: { progress: number }) {
  return (
    <span className="relative block h-px w-full overflow-hidden rounded-full bg-line">
      <motion.span
        className="absolute left-0 top-0 h-px bg-accent"
        initial={false}
        animate={{ width: `${progress * 100}%` }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      />
      {progress === 1 && (
        <motion.span
          className="absolute left-0 top-0 h-[3px] w-1 -translate-y-[1px] rounded-full bg-accent"
          animate={{ left: "100%" }}
          transition={{ duration: 0.6, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
        />
      )}
    </span>
  );
}

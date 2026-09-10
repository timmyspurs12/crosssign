"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  "Signature received",
  "Ed25519 check",
  "Arbitrum Stylus",
  "Identity verified",
];

const STEP_MS = 340;

export function VerifyingSequence({ source }: { source: "live" | "demo" }) {
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    setCompleted(0);
    const id = setInterval(() => {
      setCompleted((c) => {
        if (c >= STAGES.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rounded-xl border border-line bg-paper p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="eyebrow">Verification in progress</p>
        <span className="font-mono text-[10.5px] uppercase tracking-caps text-ink-faint">
          {source === "demo" ? "Simulation" : "Arbitrum · Sepolia"}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {STAGES.map((stage, i) => {
          const done = i < completed;
          const current = i === completed;
          const isFinal = i === STAGES.length - 1;
          return (
            <li
              key={stage}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                done && "bg-accent-faint",
                current && "bg-surface",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                {done ? (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 24 }}
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full",
                      isFinal ? "bg-good text-white" : "bg-accent text-white",
                    )}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </motion.span>
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-line-strong" />
                )}
              </span>
              <span
                className={cn(
                  "font-mono text-[12.5px] uppercase tracking-caps transition-colors",
                  done
                    ? isFinal
                      ? "font-medium text-good"
                      : "text-accent-strong"
                    : current
                      ? "text-ink"
                      : "text-ink-faint",
                )}
              >
                {stage}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

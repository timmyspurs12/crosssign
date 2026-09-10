"use client";

import { cn } from "@/lib/utils";

const STEPS = ["Connect", "Sign", "Verify", "Badge"] as const;

export function StepIndicator({
  current,
  className,
}: {
  current: number; // 0-based index of the active step (0–3)
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex w-full items-center gap-2 sm:gap-3",
        className,
      )}
      aria-label="Verification progress"
    >
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10.5px] font-medium transition-colors",
                  done && "border-accent bg-accent text-white",
                  active && "border-accent bg-surface text-accent-strong",
                  !done && !active && "border-line-strong bg-surface text-ink-faint",
                )}
              >
                {done ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                    <path
                      d="M2.5 6.2l2.3 2.3 4.7-4.9"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <span
                className={cn(
                  "hidden font-mono text-[11px] uppercase tracking-caps sm:inline",
                  active
                    ? "font-medium text-ink"
                    : done
                      ? "text-ink-soft"
                      : "text-ink-faint",
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                className={cn(
                  "h-px flex-1 transition-colors",
                  i < current ? "bg-accent" : "bg-line-strong",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

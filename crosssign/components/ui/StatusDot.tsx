"use client";

import { cn } from "@/lib/utils";

export type StatusKind = "idle" | "pending" | "success" | "error" | "warning";

const MAP: Record<StatusKind, { color: string; pulse: boolean }> = {
  idle: { color: "bg-ink-faint", pulse: false },
  pending: { color: "bg-accent", pulse: true },
  success: { color: "bg-good", pulse: false },
  error: { color: "bg-danger", pulse: false },
  warning: { color: "bg-warn", pulse: false },
};

export function StatusDot({
  kind = "idle",
  className,
}: {
  kind?: StatusKind;
  className?: string;
}) {
  const { color, pulse } = MAP[kind];
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            color,
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          color,
          !pulse && kind === "idle" && "animate-pulse-dot",
        )}
      />
    </span>
  );
}

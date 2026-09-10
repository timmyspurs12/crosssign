"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "accent" | "good" | "warn" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-strong border-accent/30",
  good: "bg-good-soft text-good border-good/25",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/25",
  neutral: "bg-paper text-ink-soft border-line-strong",
};

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Tag({ tone = "neutral", dot, className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "font-mono text-[10.5px] font-medium uppercase tracking-caps",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "accent" && "bg-accent",
            tone === "good" && "bg-good",
            tone === "warn" && "bg-warn",
            tone === "danger" && "bg-danger",
            tone === "neutral" && "bg-ink-muted",
          )}
        />
      )}
      {props.children}
    </span>
  );
}

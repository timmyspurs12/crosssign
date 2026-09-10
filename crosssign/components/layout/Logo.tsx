"use client";

import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/config";

/**
 * CrossSign mark — two nodes (ecosystems) joined by a "signature" stroke
 * that crosses the chain boundary, ending in a verified tick.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-7 w-7", className)}
      aria-hidden
    >
      {/* chain boundary */}
      <line
        x1="16"
        y1="4"
        x2="16"
        y2="28"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      {/* origin node */}
      <circle
        cx="8.5"
        cy="16"
        r="4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="8.5" cy="16" r="1.5" fill="currentColor" />
      {/* signature stroke crossing the boundary */}
      <path
        d="M12.5 16c2.2-2.4 3.6-2.4 5 0s2.8 2.4 5 0"
        stroke="#00B3A4"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* destination node + tick */}
      <circle
        cx="23.5"
        cy="16"
        r="4"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M21.7 16.2l1.3 1.3 2.2-2.4"
        stroke="#00B3A4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo({
  withWordmark = true,
  className,
}: {
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <Mark />
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-tight">
          {BRAND.wordmark}
        </span>
      )}
    </span>
  );
}

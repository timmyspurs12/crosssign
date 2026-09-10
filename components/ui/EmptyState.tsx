"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-ink-muted">
        {body}
      </p>
      {actionHref && actionLabel && (
        <Button className="mt-5" variant="primary" href={actionHref}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

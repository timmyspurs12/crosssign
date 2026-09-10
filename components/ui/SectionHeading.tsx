"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("eyebrow", className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "max-w-xl text-[15px] leading-relaxed text-ink-muted",
            align === "center" && "mx-auto",
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

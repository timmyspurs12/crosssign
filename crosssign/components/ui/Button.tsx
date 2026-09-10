"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-surface hover:bg-ink/90 border border-ink shadow-sm",
  accent:
    "bg-accent text-white hover:bg-accent-strong border border-accent shadow-sm",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink/40 hover:bg-paper shadow-sm",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:bg-ink/5",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders as an inline-flex anchor when provided. */
  href?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", href, ...props },
    ref,
  ) {
    const classes = cn(
      "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      "disabled:opacity-45 disabled:pointer-events-none select-none",
      "active:translate-y-[1px]",
      VARIANTS[variant],
      SIZES[size],
      className,
    );

    if (href) {
      return (
        <a href={href} className={classes}>
          {props.children}
        </a>
      );
    }

    return <button ref={ref} className={classes} {...props} />;
  },
);

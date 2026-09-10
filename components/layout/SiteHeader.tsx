"use client";

import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Verify", href: "/verify" },
  { label: "Explorer", href: "/explorer" },
  { label: "How it works", href: "/#how" },
  { label: "Docs", href: "/#docs" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-200",
        scrolled
          ? "border-b border-line bg-paper/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="transition-opacity hover:opacity-70">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13.5px] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[10.5px] uppercase tracking-caps text-ink-muted sm:inline">
            Arbitrum · Sepolia
          </span>
          <Button href="/verify" size="sm" variant="primary">
            Verify a wallet
          </Button>
        </div>
      </Container>
    </header>
  );
}

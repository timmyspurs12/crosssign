"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { Mark } from "@/components/layout/Logo";

export function FinalCta() {
  return (
    <Container className="py-16 lg:py-24">
      <div className="hairline-grid relative overflow-hidden rounded-2xl border border-line bg-surface px-8 py-14 text-center shadow-card sm:px-14">
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />
        <Mark className="mx-auto h-9 w-9 text-ink" />
        <h2 className="mx-auto mt-6 max-w-lg text-balance text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Verify a wallet in under a minute.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-ink-muted">
          No bridge. No funds moved. Just a signature that proves control of
          your wallet — verified on Arbitrum.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/verify" size="lg" variant="accent">
            Verify a wallet
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button href="/explorer" size="lg" variant="secondary">
            Browse the explorer
          </Button>
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-caps text-ink-faint">
          Works with Phantom, Solflare, Backpack + more · No seed phrase required · No funds move
        </p>
      </div>
    </Container>
  );
}

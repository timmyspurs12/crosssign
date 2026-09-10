"use client";

import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { SITE } from "@/lib/config";

export function BuildathonStrip() {
  return (
    <section className="border-t border-line bg-ink text-surface">
      <Container className="flex flex-col gap-6 py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-capsWide text-surface/50">
            Built for the Arbitrum Open House Singapore
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-surface/80">
            CrossSign is an entry in the Arbitrum Open House Singapore — Online
            Buildathon, built on Stylus with Ed25519 verification running
            on-chain.
          </p>
        </div>
        <a
          href={SITE.buildathonUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-surface/20 px-5 py-3 text-sm font-medium text-surface transition-colors hover:border-surface/40 hover:bg-surface/5"
        >
          View the buildathon
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </Container>
    </section>
  );
}

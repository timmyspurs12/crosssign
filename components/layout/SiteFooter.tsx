"use client";

import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Container } from "@/components/layout/Container";
import { SITE } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <Container className="flex flex-col gap-8 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm space-y-3">
            <Logo />
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              Cross-chain identity verification on Arbitrum. Prove wallet
              ownership from another ecosystem without bridging your assets.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div className="space-y-3">
              <p className="eyebrow">Product</p>
              <ul className="space-y-2 text-[13.5px] text-ink-soft">
                <li><Link className="hover:text-ink" href="/verify">Verify</Link></li>
                <li><Link className="hover:text-ink" href="/explorer">Explorer</Link></li>
                <li><Link className="hover:text-ink" href="/#how">How it works</Link></li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="eyebrow">Event</p>
              <ul className="space-y-2 text-[13.5px] text-ink-soft">
                <li>
                  <a className="hover:text-ink" href={SITE.buildathonUrl} target="_blank" rel="noreferrer">
                    Buildathon page ↗
                  </a>
                </li>
                <li><span className="text-ink-faint">Arbitrum Sepolia</span></li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="eyebrow">Status</p>
              <ul className="space-y-2 text-[13.5px] text-ink-soft">
                <li><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-good" />Verifier live</span></li>
                <li><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-good" />Badge registry</span></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-6 text-[12px] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 CrossSign. A buildathon project for the Arbitrum Open House Singapore.</p>
          <p className="font-mono text-[11px] uppercase tracking-caps">
            Wallet ownership verified — not real-world identity
          </p>
        </div>
      </Container>
    </footer>
  );
}

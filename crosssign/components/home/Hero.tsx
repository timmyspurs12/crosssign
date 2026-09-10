"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/layout/Container";
import { HeroFlow } from "@/components/home/HeroFlow";

const STATS = [
  { k: "Ed25519", v: "signature scheme" },
  { k: "0", v: "assets bridged" },
  { k: "1", v: "transaction to verify" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* subtle top gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(0,179,164,0.07), transparent 70%)",
        }}
      />
      <Container className="relative grid items-center gap-14 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24 lg:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow mb-5">
            Cross-chain identity · Arbitrum Stylus
          </p>
          <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Your identity,
            <br />
            <span className="text-accent-strong">across chains.</span>
          </h1>
          <p className="mt-6 max-w-md text-[16.5px] leading-relaxed text-ink-muted">
            Prove ownership of a wallet from another ecosystem without
            bridging your assets. CrossSign verifies your signature on-chain,
            on Arbitrum.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button href="/verify" size="lg" variant="accent">
              Verify a wallet
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/#how" size="lg" variant="secondary">
              Explore how it works
            </Button>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-8 gap-y-4 border-t border-line pt-6">
            {STATS.map((s) => (
              <div key={s.k}>
                <dt className="font-mono text-[10.5px] uppercase tracking-caps text-ink-faint">
                  {s.v}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular text-ink">
                  {s.k}
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        >
          <HeroFlow />
          <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-caps text-ink-faint">
            Solana → sign → verify on Arbitrum — no funds move
          </p>
        </motion.div>
      </Container>
    </section>
  );
}

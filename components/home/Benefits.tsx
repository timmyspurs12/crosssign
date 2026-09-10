"use client";

import { Link2, ShieldCheck, Fingerprint } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

const BENEFITS = [
  {
    icon: Link2,
    title: "No bridge",
    body: "No assets need to move. A single cryptographic signature is all it takes to prove control of your wallet.",
  },
  {
    icon: ShieldCheck,
    title: "On-chain proof",
    body: "Verification happens on Arbitrum, verified by the Stylus verifier contract. Nothing lives off-chain.",
  },
  {
    icon: Fingerprint,
    title: "Reusable identity",
    body: "Other apps can recognise the same proof. Verify once, and carry your badge across the ecosystem.",
  },
];

export function Benefits() {
  return (
    <section className="border-y border-line bg-surface">
      <Container className="py-16 lg:py-20">
        <SectionHeading
          eyebrow="Why CrossSign"
          title="Proof, without the friction."
          description="Cross-signing replaces bridges and manual attestations with a single verifiable signature."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="group rounded-xl border border-line bg-paper p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-colors group-hover:border-accent/40 group-hover:text-accent-strong">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-mono text-[13px] font-medium uppercase tracking-caps text-ink">
                {b.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Container } from "@/components/layout/Container";
import { BadgeView } from "@/components/badge/BadgeView";
import { EmptyState } from "@/components/ui/EmptyState";
import { deserializeProof } from "@/lib/registry";

export function BadgePage() {
  const params = useSearchParams();
  const raw = params.get("proof") ?? "";
  const proof = deserializeProof(raw);

  return (
    <>
      <SiteHeader />
      <main className="min-h-[70vh]">
        <Container className="py-10 lg:py-14">
          {proof ? (
            <BadgeView proof={proof} />
          ) : (
            <EmptyState
              title="No credential found"
              body="This link doesn't contain a valid identity credential. Verify a wallet to issue your CrossSign badge."
              actionHref="/verify"
              actionLabel="Verify a wallet"
            />
          )}
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

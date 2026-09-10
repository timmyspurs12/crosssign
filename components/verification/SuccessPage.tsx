"use client";

import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Container } from "@/components/layout/Container";
import { VerificationSuccess } from "@/components/verification/VerificationSuccess";
import { EmptyState } from "@/components/ui/EmptyState";
import { deserializeProof } from "@/lib/registry";

export function SuccessPage() {
  const params = useSearchParams();
  const raw = params.get("proof") ?? "";
  const proof = deserializeProof(raw);

  return (
    <>
      <SiteHeader />
      <main className="min-h-[70vh]">
        <Container className="max-w-2xl py-10 lg:py-14">
          {proof ? (
            <VerificationSuccess proof={proof} />
          ) : (
            <EmptyState
              title="No verification found"
              body="This link doesn't contain a valid verification proof. Run a verification to get your own."
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

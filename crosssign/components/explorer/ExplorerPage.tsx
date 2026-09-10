"use client";

import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Container } from "@/components/layout/Container";
import { ExplorerView } from "@/components/explorer/ExplorerView";
import { deserializeProof } from "@/lib/registry";

export function ExplorerPage() {
  const params = useSearchParams();
  const raw = params.get("proof") ?? "";
  const proof = deserializeProof(raw);

  return (
    <>
      <SiteHeader />
      <main className="min-h-[70vh]">
        <Container className="max-w-3xl py-10 lg:py-14">
          <ExplorerView initialProof={proof} />
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

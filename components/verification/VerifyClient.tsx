"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Container } from "@/components/layout/Container";
import {
  VerificationProvider,
  useVerification,
} from "@/components/verification/VerificationContext";
import { VerifyFlow } from "@/components/verification/VerifyFlow";
import { VerificationSuccess } from "@/components/verification/VerificationSuccess";
import { WalletSelectorModal } from "@/components/verification/WalletSelectorModal";

export function VerifyClient() {
  return (
    <VerificationProvider>
      <SiteHeader />
      <main className="min-h-[70vh]">
        <Container className="max-w-3xl py-10 lg:py-14">
          <VerifyBody />
        </Container>
      </main>
      <SiteFooter />
      <WalletSelectorModal />
    </VerificationProvider>
  );
}

function VerifyBody() {
  const { state, reset } = useVerification();

  return (
    <div className="flex flex-col gap-6">
      {state.status === "verified" && state.proof ? (
        <VerificationSuccess proof={state.proof} onReset={reset} />
      ) : (
        <>
          <div>
            <p className="eyebrow">Verification</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Verify your wallet
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-muted">
              Connect a Solana wallet, sign one message, and receive an
              on-chain proof of ownership on Arbitrum.
            </p>
          </div>
          <VerifyFlow />
        </>
      )}
    </div>
  );
}

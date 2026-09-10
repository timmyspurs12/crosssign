"use client";

import { ShieldAlert } from "lucide-react";
import type { VerificationChallenge } from "@/types";

export function ChallengePanel({
  challenge,
}: {
  challenge: VerificationChallenge;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="eyebrow">Signing message</span>
        <span className="font-mono text-[10.5px] uppercase tracking-caps text-ink-faint">
          domain · {challenge.domain}
        </span>
      </div>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-ink-soft">
        {challenge.message}
      </pre>
      <div className="flex items-center gap-2 border-t border-line bg-accent-faint px-4 py-2.5">
        <ShieldAlert className="h-4 w-4 shrink-0 text-accent-strong" />
        <p className="text-[12.5px] font-medium text-accent-strong">
          This signature proves control of the wallet. No funds will move.
        </p>
      </div>
    </div>
  );
}

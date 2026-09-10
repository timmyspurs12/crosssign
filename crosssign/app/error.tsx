"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Route-level error boundary. If a client component throws, Next.js renders
 * this instead of the generic "Application error" overlay, with a working
 * reset. Logs the error to the console for debugging.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[crosssign] client error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-8 py-12 text-center shadow-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-danger/25 bg-danger/5">
          <AlertTriangle className="h-5 w-5 text-danger" />
        </div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-caps text-ink-faint">
          Verification unavailable
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          A client-side error interrupted this page. Reload to try again — your
          wallet and verification are not affected.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper transition-opacity hover:opacity-90"
        >
          <RotateCcw className="h-4 w-4" />
          Reload
        </button>
        <p className="mt-4 font-mono text-[11px] text-ink-faint">
          {error.digest ? `digest ${error.digest}` : error.message.slice(0, 96)}
        </p>
      </div>
    </div>
  );
}

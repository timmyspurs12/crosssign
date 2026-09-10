/**
 * Minimal Phantom provider surface — only what CrossSign uses.
 * Keep it narrow on purpose: fewer assumptions, easier to swap later.
 */
export interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string };
  }>;
  disconnect: () => Promise<void>;
  signMessage: (
    message: Uint8Array,
    display?: "utf8" | "hex",
  ) => Promise<{ signature: Uint8Array; publicKey: { toString(): string } }>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (event?: string) => void;
}

export interface PhantomWindow extends Window {
  phantom?: {
    solana?: PhantomProvider;
  };
}

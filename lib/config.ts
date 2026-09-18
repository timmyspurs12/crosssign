import type { Ecosystem } from "@/types";

/**
 * Central static config. Anything that would eventually come from an
 * environment variable or on-chain registry lives here so the UI stays pure.
 */

export const BRAND = {
  name: "CrossSign",
  wordmark: "CROSSSIGN",
  tagline: "Identity across chains.",
} as const;

export const SITE = {
  url: "https://crosssign.vercel.app",
  buildathonUrl:
    "https://arbitrum-singapore.hackquest.io/buildathons/Arbitrum-Open-House-Singapore-Online-Buildathon",
  buildathonName: "Arbitrum Open House Singapore — Online Buildathon",
} as const;

export const CHAINS: Record<
  Ecosystem,
  { label: string; network: string; short: string }
> = {
  solana: { label: "Solana", network: "Mainnet-Beta", short: "SOL" },
  arbitrum: { label: "Arbitrum", network: "Sepolia", short: "ARB" },
  robinhood: { label: "Robinhood Chain", network: "Testnet", short: "RHC" },
};

export const EXPLORERS = {
  solana: "https://solscan.io/account/",
  arbitrum: "https://sepolia.arbiscan.io/tx/",
  robinhood: "https://explorer.testnet.chain.robinhood.com/tx/",
} as const;

/**
 * Destination network configuration.
 * 421614 = Arbitrum Sepolia (the buildathon demo chain).
 */
export const NETWORK = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 421614),
  destinationNetwork: "arbitrum-sepolia",
  name: "Arbitrum Sepolia",
  rpcUrl:
    process.env.NEXT_PUBLIC_ARBITRUM_RPC ??
    "https://sepolia-rollup.arbitrum.io/rpc",
  explorerUrl: "https://sepolia.arbiscan.io",
} as const;

/**
 * EIP-3085 parameters for `wallet_addEthereumChain` / `wallet_switchEthereumChain`
 * — used by lib/wallet/evm.ts when the user's EVM wallet is on another network.
 */
export const TARGET_CHAIN_PARAMS = {
  chainId: `0x${NETWORK.chainId.toString(16)}`,
  chainName: NETWORK.name,
  rpcUrls: [NETWORK.rpcUrl],
  blockExplorerUrls: [NETWORK.explorerUrl],
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
} as const;

/**
 * Deployed contract addresses (see `contract/deployments/sepolia.json`).
 *
 * ⚠️ READ THIS BEFORE REFACTORING: the two `process.env.NEXT_PUBLIC_*`
 * references below MUST stay **statically written out**.
 *
 * Next.js inlines `NEXT_PUBLIC_*` variables into the browser bundle at build
 * time, but it can only do that for a literal `process.env.SOME_NAME`. A
 * dynamic lookup such as `process.env[key]` is not replaced, so it survives
 * into the bundle where `process.env` is an empty object — it silently
 * evaluates to `undefined` and the fallback is used in EVERY build, production
 * included. That is exactly how CrossSign previously produced a transaction
 * that mined, reported success, emitted no logs and minted nothing: the browser
 * knew only the zero address.
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Resolve a build-time address, falling back to the zero address. */
function buildTimeAddress(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return (trimmed === "" ? ZERO_ADDRESS : trimmed).toLowerCase();
}

export const CONTRACTS = {
  verifier: buildTimeAddress(process.env.NEXT_PUBLIC_VERIFIER_ADDRESS),
  registry: buildTimeAddress(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
  badgeId: "CS-0001",
} as const;

export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS;
}

/**
 * Are the deployed contract addresses actually configured?
 *
 * When they are not, the addresses above fall back to the zero address — and a
 * call to the zero address SUCCEEDS as a no-op: the transaction mines, reports
 * status "Success", emits no logs, and no badge is minted. That failure mode is
 * indistinguishable from a real verification unless we refuse to build a
 * challenge or submit anything in the first place. Everything that touches the
 * deployed contracts therefore calls `assertContractsConfigured()` first.
 */
export const CONTRACTS_CONFIGURED =
  !isZeroAddress(CONTRACTS.verifier) && !isZeroAddress(CONTRACTS.registry);

/** Shown to the user when the deployment addresses are missing. */
export const CONTRACTS_SETUP_HINT =
  "This deployment has no contract addresses configured. Set " +
  "NEXT_PUBLIC_VERIFIER_ADDRESS and NEXT_PUBLIC_REGISTRY_ADDRESS (see " +
  "contract/DEPLOYMENT.md §5) and rebuild — live verification is disabled " +
  "until then.";

/**
 * Throw unless both deployed addresses are configured. Called at the two
 * boundaries that talk to the chain (challenge creation and submission) so a
 * misconfigured build fails loudly instead of "succeeding" against 0x0.
 */
export function assertContractsConfigured(): void {
  if (!CONTRACTS_CONFIGURED) {
    throw new Error(CONTRACTS_SETUP_HINT);
  }
}

/**
 * Challenge protocol constants — MUST match the verifier contract
 * (contract/verifier/src/lib.rs). The canonical message format is defined in
 * lib/canonical.ts and checked against the Rust fixture by
 * scripts/check-canonical.mjs.
 */
export const CHALLENGE = {
  domain: "crosssign.verification",
  ttlSeconds: 300,
} as const;

export const VERIFICATION_METHOD_LABEL: Record<string, string> = {
  Ed25519: "Ed25519 (Solana)",
  secp256k1: "secp256k1 (EVM)",
};

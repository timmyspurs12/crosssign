/**
 * CrossSign on-chain contract interfaces (Solidity ABI).
 *
 * Typed mirror of the two Stylus contracts:
 *   contract/verifier/src/lib.rs  → CrossSignVerifier
 *   contract/registry/src/lib.rs  → CrossSignBadgeRegistry
 *
 * Used by `lib/chain/client.ts` (ethers) to talk to the deployed contracts.
 * Kept in sync manually — the contract is the source of truth.
 */

export const VERIFIER_ABI = [
  // introspect
  "function owner() view returns (address)",
  "function badgeRegistry() view returns (address)",
  "function chainId() view returns (uint64)",
  "function verifierAddress() view returns (address)",
  "function destinationNetwork() view returns (string)",
  "function verificationCount() view returns (uint256)",
  // challenge + crypto
  "function buildChallenge(uint8[] public_key, string nonce, uint64 expires) view returns (string)",
  "function verifySignature(uint8[] public_key, uint8[] signature, uint8[] message) view returns (bool)",
  // verification
  "function verifyAndIssue(uint8[] public_key, string nonce, uint64 expires, uint8[] signature, string origin_network) returns (uint256)",
  "function isVerified(address account) view returns (bool)",
  "function verificationOf(address account) view returns (tuple(address owner, bytes public_key, string origin_network, string destination_network, uint256 chain_id, uint256 verified_at, uint256 badge_id, bool active))",
  "function nonceUsed(string nonce) view returns (bool)",
  // admin
  "function setBadgeRegistry(address registry)",
  // events
  "event VerificationRequested(address indexed wallet, bytes public_key, string nonce, uint64 expires)",
  "event WalletVerified(address indexed wallet, uint256 indexed badge_id, bytes public_key, uint256 verified_at)",
] as const;

export const REGISTRY_ABI = [
  "function issue(address recipient, uint8[] public_key, string origin_network) returns (uint256)",
  "function owner() view returns (address)",
  "function issuer() view returns (address)",
  "function badgeCount() view returns (uint256)",
  "function isIssued(address account) view returns (bool)",
  "function badgeIdOf(address account) view returns (uint256)",
  "function badge(uint256 badge_id) view returns (tuple(address owner, bytes public_key, string origin_network, uint256 verified_at, uint256 badge_id, bool active))",
  "function badgeOf(address account) view returns (tuple(address owner, bytes public_key, string origin_network, uint256 verified_at, uint256 badge_id, bool active))",
  "function setIssuer(address new_issuer)",
  "function revoke(uint256 badge_id)",
  // events
  "event BadgeIssued(address indexed owner, uint256 indexed badge_id, bytes public_key, string origin_network)",
  "event BadgeRevoked(address indexed owner, uint256 indexed badge_id)",
] as const;

export interface OnChainBadge {
  owner: string;
  public_key: string;
  origin_network: string;
  verified_at: bigint;
  badge_id: bigint;
  active: boolean;
}

export interface OnChainVerification {
  owner: string;
  public_key: string;
  origin_network: string;
  destination_network: string;
  chain_id: bigint;
  verified_at: bigint;
  badge_id: bigint;
  active: boolean;
}

/** Arguments for the on-chain `verify_and_issue` call (bytes are 0x-hex). */
export interface VerifyAndIssueArgs {
  publicKeyHex: string; // 0x + 64 hex
  nonce: string;
  expires: number; // unix seconds
  signatureHex: string; // 0x + 128 hex
  originNetwork: string;
}

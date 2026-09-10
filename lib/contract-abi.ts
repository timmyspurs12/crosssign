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
  "function badge_registry() view returns (address)",
  "function chain_id() view returns (uint64)",
  "function verifier_address() view returns (address)",
  "function destination_network() view returns (string)",
  "function verification_count() view returns (uint256)",
  // challenge + crypto
  "function build_challenge(bytes public_key, string nonce, uint64 expires) view returns (string)",
  "function verify_signature(bytes public_key, bytes signature, bytes message) view returns (bool)",
  // verification
  "function verify_and_issue(bytes public_key, string nonce, uint64 expires, bytes signature, string origin_network) returns (uint256)",
  "function is_verified(address account) view returns (bool)",
  "function verification_of(address account) view returns (tuple(address owner, bytes public_key, string origin_network, string destination_network, uint256 chain_id, uint256 verified_at, uint256 badge_id, bool active))",
  "function nonce_used(string nonce) view returns (bool)",
  // admin
  "function set_badge_registry(address registry)",
  // events
  "event VerificationRequested(address indexed wallet, bytes public_key, string nonce, uint64 expires)",
  "event WalletVerified(address indexed wallet, uint256 indexed badge_id, bytes public_key, uint256 verified_at)",
] as const;

export const REGISTRY_ABI = [
  "function issue(address recipient, bytes public_key, string origin_network) returns (uint256)",
  "function owner() view returns (address)",
  "function issuer() view returns (address)",
  "function badge_count() view returns (uint256)",
  "function is_issued(address account) view returns (bool)",
  "function badge_id_of(address account) view returns (uint256)",
  "function badge(uint256 badge_id) view returns (tuple(address owner, bytes public_key, string origin_network, uint256 verified_at, uint256 badge_id, bool active))",
  "function badge_of(address account) view returns (tuple(address owner, bytes public_key, string origin_network, uint256 verified_at, uint256 badge_id, bool active))",
  "function set_issuer(address new_issuer)",
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

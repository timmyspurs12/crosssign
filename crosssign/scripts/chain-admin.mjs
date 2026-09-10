/**
 * CrossSign chain admin helper (owner-only transactions + reads).
 *
 * Usage (from the web app root, where `ethers` is installed):
 *
 *   # Authorize the verifier to mint badges (required after deploy):
 *   PRIVATE_KEY=0x… node scripts/chain-admin.mjs set-issuer <registry> <verifier>
 *
 *   # Read a verification record:
 *   node scripts/chain-admin.mjs verification <verifier> <arbitrum-address>
 *
 *   # Read a badge:
 *   node scripts/chain-admin.mjs badge <registry> <badgeId>
 */
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const rpc = process.env.RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const provider = new JsonRpcProvider(rpc);

const REGISTRY_ABI = [
  "function set_issuer(address new_issuer)",
  "function issuer() view returns (address)",
  "function badge(uint256 badge_id) view returns (tuple(address owner, bytes public_key, string origin_network, uint256 verified_at, uint256 badge_id, bool active))",
];
const VERIFIER_ABI = [
  "function verification_of(address account) view returns (tuple(address owner, bytes public_key, string origin_network, string destination_network, uint256 chain_id, uint256 verified_at, uint256 badge_id, bool active))",
  "function is_verified(address account) view returns (bool)",
];

async function setIssuer(registryAddr, verifierAddr) {
  const priv = process.env.PRIVATE_KEY;
  if (!priv) throw new Error("set PRIVATE_KEY env var");
  const wallet = new Wallet(priv, provider);
  const registry = new Contract(registryAddr, REGISTRY_ABI, wallet);
  console.log("calling set_issuer(" + verifierAddr + ") from " + wallet.address);
  const tx = await registry.set_issuer(verifierAddr);
  const r = await tx.wait();
  console.log("tx:", r.hash);
  console.log("issuer now:", await registry.issuer());
}

async function readVerification(verifierAddr, account) {
  const verifier = new Contract(verifierAddr, VERIFIER_ABI, provider);
  console.log("is_verified:", await verifier.is_verified(account));
  const rec = await verifier.verification_of(account);
  console.log(JSON.stringify(rec, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

async function readBadge(registryAddr, badgeId) {
  const registry = new Contract(registryAddr, REGISTRY_ABI, provider);
  const badge = await registry.badge(badgeId);
  console.log(JSON.stringify(badge, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "set-issuer") await setIssuer(a, b);
  else if (cmd === "verification") await readVerification(a, b);
  else if (cmd === "badge") await readBadge(a, b);
  else {
    console.log("usage: node scripts/chain-admin.mjs <set-issuer|verification|badge> …");
    process.exit(1);
  }
} catch (err) {
  console.error("error:", err.shortMessage ?? err.message ?? err);
  process.exit(1);
}

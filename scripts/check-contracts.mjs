#!/usr/bin/env node
/**
 * CrossSign deployment check.
 *
 * Verifies both Stylus contracts answer the camelCase exports the app uses
 * (the SDK renames Rust snake_case: badge_count() -> badgeCount()), and that
 * the owner/issuer wiring is correct.
 *
 *   node scripts/check-contracts.mjs <registry> <verifier>
 *
 * Exit code 0 = every check passed.
 */
import { JsonRpcProvider, Interface } from "ethers";

const RPC = process.env.RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const DEPLOYER = "0xf8e604137A2F4b213AC115D33fee170EB5a63282";

const [registryAddr, verifierAddr] = process.argv.slice(2);
if (!registryAddr || !verifierAddr) {
  console.error("usage: node scripts/check-contracts.mjs <registry> <verifier>");
  process.exit(2);
}

const provider = new JsonRpcProvider(RPC);

const REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function issuer() view returns (address)",
  "function badgeCount() view returns (uint256)",
];

const VERIFIER_ABI = [
  "function owner() view returns (address)",
  "function badgeRegistry() view returns (address)",
  "function chainId() view returns (uint64)",
  "function verifierAddress() view returns (address)",
  "function destinationNetwork() view returns (string)",
  "function verificationCount() view returns (uint256)",
  "function isVerified(address account) view returns (bool)",
  "function nonceUsed(string nonce) view returns (bool)",
];

async function probe(label, address, abi, calls) {
  const iface = new Interface(abi);
  const code = await provider.getCode(address);
  console.log("\n=== " + label + " " + address + "  (" + (code.length - 2) / 2 + " bytes)");
  const out = {};
  for (const [fn, args] of calls) {
    try {
      const data = iface.encodeFunctionData(fn, args);
      const raw = await provider.call({ to: address, data });
      const value = iface.decodeFunctionResult(fn, raw)[0];
      out[fn] = typeof value === "bigint" ? value.toString() : value;
      console.log("  " + fn.padEnd(20) + " " + out[fn]);
    } catch {
      out[fn] = null;
      console.log("  " + fn.padEnd(20) + " REVERT");
    }
  }
  return out;
}

const reg = await probe("registry", registryAddr, REGISTRY_ABI, [
  ["owner", []],
  ["issuer", []],
  ["badgeCount", []],
]);

const ver = await probe("verifier", verifierAddr, VERIFIER_ABI, [
  ["owner", []],
  ["badgeRegistry", []],
  ["chainId", []],
  ["verifierAddress", []],
  ["destinationNetwork", []],
  ["verificationCount", []],
  ["isVerified", [DEPLOYER]],
  ["nonceUsed", ["probe"]],
]);

const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

const checks = [
  ["registry.owner is the deployer", eq(reg.owner, DEPLOYER)],
  ["registry.issuer is the verifier", eq(reg.issuer, verifierAddr)],
  ["registry.badgeCount readable", reg.badgeCount !== null],
  ["verifier.owner is the deployer", eq(ver.owner, DEPLOYER)],
  ["verifier.badgeRegistry points at the registry", eq(ver.badgeRegistry, registryAddr)],
  ["verifier.chainId is 421614", ver.chainId === "421614"],
  ["verifier.destinationNetwork is arbitrum-sepolia", ver.destinationNetwork === "arbitrum-sepolia"],
  ["verifier.isVerified readable", ver.isVerified !== null],
  ["verifier.nonceUsed readable", ver.nonceUsed !== null],
];

console.log("\n=== summary");
for (const [name, ok] of checks) console.log((ok ? "PASS  " : "FAIL  ") + name);
const failed = checks.filter(([, ok]) => !ok).length;
console.log("\n" + (checks.length - failed) + "/" + checks.length + " checks passed");
process.exit(failed === 0 ? 0 : 1);

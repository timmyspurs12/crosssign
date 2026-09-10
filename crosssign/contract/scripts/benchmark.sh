#!/usr/bin/env bash
#
# Measure gas usage of the CrossSign verifier on Arbitrum Sepolia.
#
# Prerequisites: deployed contracts (deployments/sepolia.json) and a funded
# wallet. Run from the contract/ directory.
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; source .env; set +a; fi
: "${PRIVATE_KEY:?Set PRIVATE_KEY in .env}"
RPC="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"

VERIFIER=$(node -e 'console.log(require("./deployments/sepolia.json").verifier)' 2>/dev/null || echo "")

if [ -z "$VERIFIER" ] || [ "$VERIFIER" = "undefined" ]; then
  echo "No deployments/sepolia.json found — deploy first (scripts/deploy.sh)."
  exit 1
fi

node <<'NODE'
const { Contract, JsonRpcProvider, Wallet } = require("ethers");
const fs = require("fs");

const cfg = JSON.parse(fs.readFileSync("deployments/sepolia.json", "utf8"));
const rpc = process.env.RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc";
const provider = new JsonRpcProvider(rpc);
const wallet = new Wallet(process.env.PRIVATE_KEY, provider);

const ABI = [
  "function verify_signature(bytes public_key, bytes signature, string message) view returns (bool)",
  "function verify_and_issue(bytes public_key, string nonce, uint64 expires, bytes signature, string origin_network) returns (uint256)",
];

async function main() {
  const v = new Contract(cfg.verifier, ABI, wallet);

  // A throwaway 32-byte key + 64-byte signature + fresh nonce.
  const key = "0x" + "11".repeat(32);
  const sig = "0x" + "22".repeat(64);
  const nonce = "bench-" + Date.now().toString(36);

  // Gas for a pure verification call (eth_estimateGas, no tx).
  try {
    const g = await v.verify_signature.estimateGas(key, sig, "CROSSSIGN_VERIFY\nbenchmark");
    console.log("verify_signature (pure view)  ~", g.toString(), "gas (estimate)");
  } catch (e) {
    console.log("verify_signature estimate failed:", e.shortMessage);
  }

  // Gas for the full verify_and_issue path (will revert on bad sig — that's
  // fine for an estimate; for a real end-to-end figure, drive a real proof).
  try {
    const g = await v.verify_and_issue.estimateGas(key, nonce, BigInt(Math.floor(Date.now() / 1000) + 300), sig, "mainnet-beta");
    console.log("verify_and_issue (full path)  ~", g.toString(), "gas (estimate)");
  } catch (e) {
    console.log("verify_and_issue estimate failed:", e.shortMessage);
  }
}
main();
NODE

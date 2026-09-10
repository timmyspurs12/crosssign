#!/usr/bin/env bash
#
# Deploy CrossSign to Arbitrum Sepolia.
#
# Prerequisites (see DEPLOYMENT.md):
#   - Rust + wasm32-unknown-unknown target
#   - cargo-stylus installed:  cargo install cargo-stylus --locked
#   - a funded Sepolia wallet (faucet: https://arbitrum.faucet.dev)
#   - .env with PRIVATE_KEY set (copy from .env.example)
#
# What it does:
#   1. deploys CrossSignBadgeRegistry   (constructor: issuer = deployer)
#   2. deploys CrossSignVerifier        (constructor: registry, destination_network)
#   3. writes deployments/sepolia.json with addresses
#   4. prints the one remaining manual step (set_issuer → verifier)
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; source .env; set +a; fi
: "${PRIVATE_KEY:?Set PRIVATE_KEY in .env (copy from .env.example)}"
RPC="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
DEST_NETWORK="${DESTINATION_NETWORK:-arbitrum-sepolia}"

# Write the key to a temp file (never appears in process args / shell history).
KEYFILE=$(mktemp)
trap 'rm -f "$KEYFILE"' EXIT
printf '%s' "$PRIVATE_KEY" > "$KEYFILE"
chmod 600 "$KEYFILE"

# Derive the deployer address if no explicit issuer was provided.
if [ -z "${ISSUER_ADDRESS:-}" ]; then
  ISSUER_ADDRESS=$(node -e '
    const { Wallet } = require("ethers");
    console.log(new Wallet(process.argv[1]).address);
  ' "$PRIVATE_KEY")
fi
echo "Deployer / initial issuer: $ISSUER_ADDRESS"

mkdir -p deployments

echo ""
echo "==> [1/2] Deploying CrossSignBadgeRegistry"
(cd registry && cargo stylus deploy \
    --endpoint "$RPC" \
    --private-key-path "$KEYFILE" \
    --constructor-args "$ISSUER_ADDRESS" \
    2>&1 | tee ../deployments/registry.log)
REGISTRY=$(grep -oE "0x[a-fA-F0-9]{40}" deployments/registry.log | tail -1)
echo "    registry deployed at: $REGISTRY"

echo ""
echo "==> [2/2] Deploying CrossSignVerifier"
(cd verifier && cargo stylus deploy \
    --endpoint "$RPC" \
    --private-key-path "$KEYFILE" \
    --constructor-args "$REGISTRY" "$DEST_NETWORK" \
    2>&1 | tee ../deployments/verifier.log)
VERIFIER=$(grep -oE "0x[a-fA-F0-9]{40}" deployments/verifier.log | tail -1)
echo "    verifier deployed at:  $VERIFIER"

# Persist the deployment config.
node -e '
  const fs = require("fs");
  const cfg = {
    network: "Arbitrum Sepolia",
    chainId: 421614,
    registry: process.argv[1],
    verifier: process.argv[2],
    destinationNetwork: process.argv[3],
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync("deployments/sepolia.json", JSON.stringify(cfg, null, 2));
' "$REGISTRY" "$VERIFIER" "$DEST_NETWORK"

echo ""
echo "✅ Deployed. Saved to deployments/sepolia.json"
echo ""
echo "One manual step remains — authorize the verifier to mint badges:"
echo "  cd .. && node scripts/chain-admin.mjs set-issuer $REGISTRY $VERIFIER"
echo ""
echo "Then set in the web app (.env.local):"
echo "  NEXT_PUBLIC_VERIFIER_ADDRESS=$VERIFIER"
echo "  NEXT_PUBLIC_REGISTRY_ADDRESS=$REGISTRY"

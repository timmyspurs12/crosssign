#!/usr/bin/env bash
#
# Deploy CrossSign to Arbitrum Sepolia.
#
# By default, this script REUSES the existing CrossSignBadgeRegistry
# (0x2862cbDc…). Set FORCE_REGISTRY_DEPLOY=true only when you intentionally
# want to deploy a completely new registry.
#
# What it does:
#   1. reuses (or force-deploys) CrossSignBadgeRegistry
#   2. deploys CrossSignVerifier       (constructor: registry, destination_network)
#   3. writes deployments/sepolia.json with the addresses + tx hashes
#   4. prints the one remaining manual step (set_issuer → verifier)
#
# Prerequisites (see DEPLOYMENT.md):
#   - Rust + wasm32-unknown-unknown target, cargo-stylus installed
#   - a funded Sepolia wallet, .env with PRIVATE_KEY set

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

: "${PRIVATE_KEY:?Set PRIVATE_KEY in .env (copy from .env.example)}"

RPC="${RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
DEST_NETWORK="${DESTINATION_NETWORK:-arbitrum-sepolia}"
MAX_FEE_PER_GAS_GWEI="${MAX_FEE_PER_GAS_GWEI:-0.5}"

# Existing, already deployed and activated registry.
LIVE_REGISTRY="0x2862cbdc406546e457a8eb493708613fd9f7c8ac"

# Allow an explicit registry address, otherwise use the live registry.
REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-$LIVE_REGISTRY}"

# Safety switch: registry deployment is OFF by default.
FORCE_REGISTRY_DEPLOY="${FORCE_REGISTRY_DEPLOY:-false}"

# Keep the key inside the project workspace so reproducible cargo-stylus
# Docker builds can access it.
#
# NOTE: cargo-stylus runs from INSIDE the crate directories (we `cd registry` /
# `cd verifier` below), so the path handed to `--private-key-path` must be
# ABSOLUTE. A crate-relative path such as "registry/../.deploy-private-key.tmp"
# resolves a second level too deep (contract/registry/.deploy-private-key.tmp)
# and cargo exits with "unable to read the private key file".
KEYFILE="$PWD/.deploy-private-key.tmp"

trap 'rm -f "$KEYFILE"' EXIT

printf '%s' "$PRIVATE_KEY" > "$KEYFILE"
chmod 600 "$KEYFILE"

# Derive deployer address if one was not explicitly supplied.
if [ -z "${ISSUER_ADDRESS:-}" ]; then
  ISSUER_ADDRESS=$(node -e '
    const { Wallet } = require("ethers");
    console.log(new Wallet(process.argv[1]).address);
  ' "$PRIVATE_KEY")
fi

echo ""
echo "=========================================="
echo " CrossSign Arbitrum Sepolia Deployment"
echo "=========================================="
echo ""
echo "Deployer / initial issuer: $ISSUER_ADDRESS"
echo "Registry target:           $REGISTRY_ADDRESS"
echo "Destination network:       $DEST_NETWORK"
echo "Max fee per gas:            ${MAX_FEE_PER_GAS_GWEI} gwei"
echo ""

mkdir -p deployments

# ------------------------------------------------------------
# 1. REGISTRY
# ------------------------------------------------------------

if [ "$FORCE_REGISTRY_DEPLOY" = "true" ]; then

  echo "==> [1/2] FORCE DEPLOYING a NEW CrossSignBadgeRegistry"
  echo "WARNING: This will create a new registry contract."
  echo ""

  (
    cd registry

    cargo stylus deploy \
      --endpoint "$RPC" \
      --private-key-path "$KEYFILE" \
      --max-fee-per-gas-gwei "$MAX_FEE_PER_GAS_GWEI" \
      --constructor-args "$ISSUER_ADDRESS" \
      2>&1 | tee ../deployments/registry.log
  )

  REGISTRY_ADDRESS=$(grep -oE "0x[a-fA-F0-9]{40}" deployments/registry.log | tail -1)

  echo ""
  echo "New registry deployed at:"
  echo "$REGISTRY_ADDRESS"

else

  echo "==> [1/2] REUSING EXISTING REGISTRY"
  echo ""
  echo "Registry:"
  echo "$REGISTRY_ADDRESS"
  echo ""
  echo "No registry deployment will be performed."

fi

# ------------------------------------------------------------
# 2. VERIFIER
# ------------------------------------------------------------

echo ""
echo "==> [2/2] Deploying CrossSignVerifier"
echo ""

(
  cd verifier

  cargo stylus deploy \
    --endpoint "$RPC" \
    --private-key-path "$KEYFILE" \
    --max-fee-per-gas-gwei "$MAX_FEE_PER_GAS_GWEI" \
    --constructor-args "$REGISTRY_ADDRESS" "$DEST_NETWORK" \
    2>&1 | tee ../deployments/verifier.log
)

VERIFIER=$(grep -oE "0x[a-fA-F0-9]{40}" deployments/verifier.log | tail -1)

echo ""
echo "Verifier deployed at:"
echo "$VERIFIER"

# ------------------------------------------------------------
# Extract transaction hashes
# ------------------------------------------------------------

REGISTRY_DEPLOYMENT_TX=""

if [ -f deployments/registry.log ]; then
  REGISTRY_DEPLOYMENT_TX=$(
    grep -oE "deployment tx hash: 0x[a-fA-F0-9]{64}" \
      deployments/registry.log |
      tail -1 |
      sed 's/.*: //'
  ) || true
fi

# The registry's activation tx is produced by the deploy command as well
# ("activated contract ... with tx ..."), so record it when the log has it.
REGISTRY_ACTIVATION_TX=""
if [ -f deployments/registry.log ]; then
  REGISTRY_ACTIVATION_TX=$(
    grep -oE 'activated contract .* with tx "[0-9a-fA-F]{64}"' \
      deployments/registry.log |
      tail -1 |
      sed -E 's/.* with tx "([0-9a-fA-F]{64})"/0x\1/'
  ) || true
fi

VERIFIER_DEPLOYMENT_TX=$(
  grep -oE "deployment tx hash: 0x[a-fA-F0-9]{64}" \
    deployments/verifier.log |
    tail -1 |
    sed 's/.*: //'
) || true

VERIFIER_ACTIVATION_TX=$(
  grep -oE 'activated contract .* with tx "[0-9a-fA-F]{64}"' \
    deployments/verifier.log |
    tail -1 |
    sed -E 's/.* with tx "([0-9a-fA-F]{64})"/0x\1/'
) || true

# ------------------------------------------------------------
# Save deployment configuration
# ------------------------------------------------------------

node -e '
  const fs = require("fs");

  const cfg = {
    network: "Arbitrum Sepolia",
    chainId: 421614,
    rpc: process.argv[1],
    registry: process.argv[2],
    registryDeploymentTx: process.argv[3] || null,
    registryActivationTx: process.argv[4] || null,
    verifier: process.argv[5],
    verifierDeploymentTx: process.argv[6] || null,
    verifierActivationTx: process.argv[7] || null,
    destinationNetwork: process.argv[8],
    deployer: process.argv[9],
    deployedAt: new Date().toISOString(),
    note: "Regenerate with contract/scripts/deploy.sh. After deploying, authorize the verifier with scripts/chain-admin.mjs set-issuer, or verify_and_issue reverts Unauthorized at the registry."
  };

  fs.writeFileSync(
    "deployments/sepolia.json",
    JSON.stringify(cfg, null, 2) + "\n"
  );
' \
  "$RPC" \
  "$REGISTRY_ADDRESS" \
  "$REGISTRY_DEPLOYMENT_TX" \
  "$REGISTRY_ACTIVATION_TX" \
  "$VERIFIER" \
  "$VERIFIER_DEPLOYMENT_TX" \
  "$VERIFIER_ACTIVATION_TX" \
  "$DEST_NETWORK" \
  "$ISSUER_ADDRESS"

echo ""
echo "=========================================="
echo " Deployment complete"
echo "=========================================="
echo ""
echo "Registry:"
echo "$REGISTRY_ADDRESS"
echo ""
echo "Verifier:"
echo "$VERIFIER"
echo ""
echo "Deployment record:"
echo "deployments/sepolia.json"
echo ""

echo "REQUIRED NEXT STEP — without it every verification reverts (Unauthorized):"
echo ""
echo "node scripts/chain-admin.mjs set-issuer $REGISTRY_ADDRESS $VERIFIER"
echo ""

echo "Web app environment:"
echo ""
echo "NEXT_PUBLIC_VERIFIER_ADDRESS=$VERIFIER"
echo "NEXT_PUBLIC_REGISTRY_ADDRESS=$REGISTRY_ADDRESS"
echo ""

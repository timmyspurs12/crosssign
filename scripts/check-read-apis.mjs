#!/usr/bin/env node
// Offline regression: real ethers ABI decoding + actual chain readers/routes.
// Only the RPC transport is faked; no transactions are sent.
// Run: node scripts/check-read-apis.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { Interface, ZeroAddress } from "ethers";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const deployment = JSON.parse(readFileSync(resolve(root, "contract/deployments/sepolia.json"), "utf8"));
process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = deployment.registry;
process.env.NEXT_PUBLIC_VERIFIER_ADDRESS = deployment.verifier;

// Use the installed TypeScript compiler; no new test dependency or emitted files.
const cache = new Map();
let routeReaders;
function load(relative) {
  const filename = resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name === "@/lib/chain/client" && routeReaders) return routeReaders;
    if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
    return require(name);
  };
  runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(
    localRequire, module, module.exports,
  );
  cache.set(filename, module.exports);
  return module.exports;
}

const { VERIFIER_ABI, REGISTRY_ABI } = load("lib/contract-abi.ts");
const verifier = new Interface(VERIFIER_ABI);
const registry = new Interface(REGISTRY_ABI);
assert.equal(verifier.getFunction("verifyAndIssue").selector, "0xe5f28691");
assert.equal(registry.getFunction("issue").selector, "0x4a7d65c1");
const { toJsonSafe } = load("lib/json-safe.ts");
const maxUint = (1n << 256n) - 1n;
assert.deepEqual(toJsonSafe({ nested: [0n, maxUint], empty: null }), {
  nested: ["0", maxUint.toString()], empty: null,
});

const owner = "0x6648bc2a1b5444cd96535c96e8f2da37a74dfd38";
const publicKey = `0x${"ab".repeat(32)}`;
// Deliberately exceeds Number.MAX_SAFE_INTEGER to detect precision loss.
const timestamp = 9007199254740993n;
let failure = null;
let calls = 0;
const provider = {
  async call(tx) {
    calls++;
    if (failure) throw failure;
    const isRegistry = tx.to.toLowerCase() === deployment.registry;
    const iface = isRegistry ? registry : verifier;
    const call = iface.parseTransaction(tx);
    if (isRegistry) {
      assert.equal(call.name, "badge");
      const active = call.args[0] === 2n;
      return iface.encodeFunctionResult("badge", [[
        active ? owner : ZeroAddress, active ? publicKey : "0x",
        active ? "mainnet-beta" : "", active ? timestamp : 0n, call.args[0], active,
      ]]);
    }
    assert.equal(call.name, "verificationOf");
    const active = call.args[0].toLowerCase() === owner;
    return iface.encodeFunctionResult("verificationOf", [[
      call.args[0], active ? publicKey : "0x", active ? "mainnet-beta" : "",
      "arbitrum-sepolia", 421614n, active ? timestamp : 0n, active ? 2n : 0n, active,
    ]]);
  },
};
const readers = load("lib/chain/client.ts");
routeReaders = {
  readBadge: (id) => readers.readBadge(id, provider),
  readVerification: (address) => readers.readVerification(address, provider),
};
const badgeGet = load("app/api/badge/[badgeId]/route.ts").GET;
const verificationGet = load("app/api/verification/[address]/route.ts").GET;
const request = new Request("http://crosssign.test");
async function response(get, params, status) {
  const res = await get(request, { params });
  assert.equal(res.status, status);
  return res.json();
}

const badge = await response(badgeGet, { badgeId: "2" }, 200);
assert.equal(Array.isArray(badge.badge), false);
assert.equal(badge.badge.owner.toLowerCase(), owner);
assert.equal(badge.badge.public_key, publicKey);
assert.equal(badge.badge.origin_network, "mainnet-beta");
assert.equal(badge.badge.badge_id, "2");
assert.equal(badge.badge.verified_at, timestamp.toString());
assert.equal(badge.badge.active, true);
assert.equal("unavailable" in badge, false);
const verification = await response(verificationGet, { address: owner.toUpperCase() }, 200);
assert.equal(verification.address, owner);
assert.equal(verification.verified, true);
assert.equal(Array.isArray(verification.record), false);
assert.equal(verification.record.public_key, publicKey);
assert.equal(verification.record.badge_id, "2");
assert.equal(verification.record.chain_id, "421614");
assert.equal(verification.record.verified_at, timestamp.toString());
assert.equal(verification.record.destination_network, "arbitrum-sepolia");
assert.equal(verification.record.active, true);
assert.equal("unavailable" in verification, false);
assert.deepEqual(await response(badgeGet, { badgeId: "999" }, 200), { badgeId: "999", badge: null });
assert.deepEqual(await response(verificationGet, { address: ZeroAddress }, 200), {
  address: ZeroAddress, verified: false, record: null,
});
const beforeInvalid = calls;
await response(badgeGet, { badgeId: "-1" }, 400);
await response(badgeGet, { badgeId: "2.5" }, 400);
await response(verificationGet, { address: "invalid" }, 400);
assert.equal(calls, beforeInvalid, "Invalid input must not reach RPC");

failure = new Error("test RPC unavailable");
const logged = [];
const originalError = console.error;
console.error = (...args) => logged.push(args);
try {
  assert.deepEqual(await response(badgeGet, { badgeId: "2" }, 503), {
    badgeId: "2", badge: null, unavailable: true,
  });
  assert.deepEqual(await response(verificationGet, { address: owner }, 503), {
    address: owner, verified: false, record: null, unavailable: true,
  });
  assert.equal(logged.length, 2);
  assert.ok(logged.every((entry) => entry[1].error === failure), "Log original errors");
} finally {
  console.error = originalError;
}
console.log("PASS — named records, lossless BigInt JSON, null records, input validation, logged RPC failures, live selectors.");
console.log("Fixture badge response:", JSON.stringify(badge));
console.log("Fixture verification response:", JSON.stringify(verification));

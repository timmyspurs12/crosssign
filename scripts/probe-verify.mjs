#!/usr/bin/env node
/**
 * Does the deployed verifier recognise `verifyAndIssue`?
 *   node scripts/probe-verify.mjs [verifierAddress]
 *
 * stylus-sdk 0.10.9 exports Vec<u8> as `uint8[]` (NOT `bytes`), so the correct
 * selector is 0xe5f28691. The args here are deliberately stale, so a WORKING
 * contract answers with a named error — that is success for this probe. An
 * EMPTY 0x revert means the selector is not on-chain at that address.
 */
import { JsonRpcProvider, Interface, getBytes, id } from "ethers";
import { readFileSync, existsSync } from "node:fs";

const env = (k) => {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(new RegExp("^\\s*" + k + "=(.*)$", "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
};

const RPC = env("NEXT_PUBLIC_ARBITRUM_RPC") ?? ("https://" + "sepolia-rollup.arbitrum.io" + "/rpc");
const VERIFIER = process.argv[2] ?? env("NEXT_PUBLIC_VERIFIER_ADDRESS");
const FROM = "0xf8e604137A2F4b213AC115D33fee170EB5a63282";

const arr = new Interface(["function verifyAndIssue(uint8[] public_key, string nonce, uint64 expires, uint8[] signature, string origin_network) returns (uint256)"]);
const legacy = new Interface(["function verifyAndIssue(bytes public_key, string nonce, uint64 expires, bytes signature, string origin_network) returns (uint256)"]);
const hex2arr = (h) => Array.from(getBytes(h));

const PK = "0x76e35b858594887ef1b08806bbd86952df048e4f4f0eac593d43c69ea5d0c34f";
const SIG = "0x6c56fc555ab55844b26c5f8b8c9c9f410481089e5293b86565501d924cc9122013f9847287fae436b985e4df6b1c188d9ff7261c002c2d85042f26dc16b71903";
const NONCE = "dfaf90f93671873f7f8fcfe5";
const EXPIRES = 1789816336n;
const ORIGIN = "mainnet-beta";

const ERR = {
  "0x118fd7b8": "AlreadyVerified", "0xa2d0fee8": "InvalidPublicKey",
  "0x8baa579f": "InvalidSignature", "0x756688fe": "InvalidNonce",
  "0x1fb09b80": "NonceAlreadyUsed", "0xf06506c5": "ChallengeExpired",
  "0xed485934": "ChallengeTooFarFuture", "0x5cbc9ccc": "RegistryCallFailed",
  "0x30cd7471": "NotOwner",
};

const p = new JsonRpcProvider(RPC);
console.log("verifier :", VERIFIER);
console.log("code size:", ((await p.getCode(VERIFIER)).length - 2) / 2, "bytes");
console.log("uint8[] selector:", id("verifyAndIssue(uint8[],string,uint64,uint8[],string)").slice(0, 10));
console.log("bytes   selector:", id("verifyAndIssue(bytes,string,uint64,bytes,string)").slice(0, 10));

const run = async (label, data) => {
  try {
    const raw = await p.call({ to: VERIFIER, data, from: FROM });
    console.log("\n" + label + ": SUCCESS " + raw.slice(0, 42));
  } catch (e) {
    const d = e.data ?? e.revert?.data ?? null;
    if (!d || d === "0x") { console.log("\n" + label + ": EMPTY revert -> selector NOT on this contract"); return; }
    const sel = d.slice(0, 10);
    console.log("\n" + label + ": " + sel + " " + (ERR[sel] ?? "(custom)"));
    if (["InvalidSignature","ChallengeExpired","NonceAlreadyUsed"].includes(ERR[sel]))
      console.log("  GOOD: the function exists and the guards run. Stale args are expected here.");
    if (ERR[sel] === "RegistryCallFailed")
      console.log("  Verifier ran but the registry rejected issue() -> predates the uint8[] fix. Redeploy.");
  }
};

const args = [hex2arr(PK), NONCE, EXPIRES, hex2arr(SIG), ORIGIN];
await run("verifyAndIssue(uint8[])", arr.encodeFunctionData("verifyAndIssue", args));
await run("verifyAndIssue(bytes)  ", legacy.encodeFunctionData("verifyAndIssue", [PK, NONCE, EXPIRES, SIG, ORIGIN]));

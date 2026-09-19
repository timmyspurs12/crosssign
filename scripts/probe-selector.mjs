import { id, Interface, getBytes, JsonRpcProvider } from "ethers";
import { readFileSync, existsSync } from "node:fs";

const env = (k) => {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(new RegExp("^\\s*" + k + "=(.*)$", "m"));
    if (m) return m[1].trim();
  }
  return undefined;
};
const RPC = env("NEXT_PUBLIC_ARBITRUM_RPC");
const VERIFIER = env("NEXT_PUBLIC_VERIFIER_ADDRESS");
const REGISTRY = env("NEXT_PUBLIC_REGISTRY_ADDRESS");
const DEPLOYER = "0xf8e604137A2F4b213AC115D33fee170EB5a63282";

const pk = "0x76e35b858594887ef1b08806bbd86952df048e4f4f0eac593d43c69ea5d0c34f";
const sig = "0x6c56fc555ab55844b26c5f8b8c9c9f410481089e5293b86565501d924cc9122013f9847287fae436b985e4df6b1c188d9ff7261c002c2d85042f26dc16b71903";
const asArr = (h) => Array.from(getBytes(h));
const ERR = { "0x118fd7b8":"AlreadyVerified","0xa2d0fee8":"InvalidPublicKey","0x8baa579f":"InvalidSignature","0x756688fe":"InvalidNonce","0x1fb09b80":"NonceAlreadyUsed","0xf06506c5":"ChallengeExpired","0xed485934":"ChallengeTooFarFuture","0x5cbc9ccc":"RegistryCallFailed","0x30cd7471":"NotOwner","0x118fd7b8":"AlreadyVerified" };

const bI = new Interface(["function verifyAndIssue(bytes public_key, string nonce, uint64 expires, bytes signature, string origin_network) returns (uint256)"]);
const aI = new Interface(["function verifyAndIssue(uint8[] public_key, string nonce, uint64 expires, uint8[] signature, string origin_network) returns (uint256)"]);
const iB = new Interface(["function issue(address recipient, bytes public_key, string origin_network) returns (uint256)"]);
const iA = new Interface(["function issue(address recipient, uint8[] public_key, string origin_network) returns (uint256)"]);

const p = new JsonRpcProvider(RPC);
const attempt = async (label, to, data, from) => {
  try { console.log("  " + label.padEnd(32) + "-> SUCCESS"); }
  catch {}
  try { const r = await p.call({ to, data, from }); console.log("  " + label.padEnd(32) + "-> SUCCESS " + r.slice(0, 20)); }
  catch (e) {
    const d = e.data ?? e.revert?.data ?? null;
    console.log("  " + label.padEnd(32) + (!d || d === "0x" ? "-> EMPTY 0x (selector not on-chain)" : "-> " + d.slice(0, 10) + " " + (ERR[d.slice(0, 10)] ?? "(custom error)")));
  }
};
console.log("VERIFIER " + VERIFIER + "   bytes=" + id("verifyAndIssue(bytes,string,uint64,bytes,string)").slice(0,10) + "  uint8[]=" + id("verifyAndIssue(uint8[],string,uint64,uint8[],string)").slice(0,10));
await attempt("verifyAndIssue(bytes...)", VERIFIER, bI.encodeFunctionData("verifyAndIssue", [pk, "dd93c27657a649c3e8fac3c0", 1789813338n, sig, "mainnet-beta"]), DEPLOYER);
await attempt("verifyAndIssue(uint8[]...)", VERIFIER, aI.encodeFunctionData("verifyAndIssue", [asArr(pk), "dd93c27657a649c3e8fac3c0", 1789813338n, asArr(sig), "mainnet-beta"]), DEPLOYER);
console.log("REGISTRY " + REGISTRY);
await attempt("issue(address,bytes,string)", REGISTRY, iB.encodeFunctionData("issue", [DEPLOYER, pk, "mainnet-beta"]), VERIFIER);
await attempt("issue(address,uint8[],string)", REGISTRY, iA.encodeFunctionData("issue", [DEPLOYER, asArr(pk), "mainnet-beta"]), VERIFIER);

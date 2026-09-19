#!/usr/bin/env node
/**
 * CrossSign mint diagnostic — one command that answers "why did the mint fail?"
 *   node scripts/diagnose-mint.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { JsonRpcProvider, Interface, id } from "ethers";

const OLD_REGISTRY = "0x2862cbdc406546e457a8eb493708613fd9f7c8ac";
const OLD_VERIFIER = "0x39db2d89ceb5b3f312c7a37459c39da05e251d2e";
function envValue(file, key) {
  if (!existsSync(file)) return undefined;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const m = raw.match(new RegExp("^\\s*" + key + "=(.*)$"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}
const NEW_REGISTRY = envValue(".env.local", "NEXT_PUBLIC_REGISTRY_ADDRESS") ?? "0x1be5fca582abbe2f69f5a3ce15311dea553ec8f2";
const NEW_VERIFIER = envValue(".env.local", "NEXT_PUBLIC_VERIFIER_ADDRESS") ?? "0x2fc638bdca648c8181c8d2c978b13c3b0762ad78";
const DEPLOYER = "0xf8e604137A2F4b213AC115D33fee170EB5a63282";
const RPC = process.env.RPC_URL ?? envValue(".env.local", "NEXT_PUBLIC_ARBITRUM_RPC") ?? ("https://" + "sepolia-rollup.arbitrum.io" + "/rpc");

const line = (s = "") => console.log(s);
const head = (s) => line("\n=== " + s);

head("1. build-time env (precedence: .env.production.local > .env.local > .env.production > .env)");
for (const f of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  if (!existsSync(f)) continue;
  line("\n  " + f);
  for (const raw of readFileSync(f, "utf8").split("\n")) {
    if (/^\s*(NEXT_PUBLIC|RPC_URL|PRIVATE_KEY)/.test(raw)) {
      const k = raw.split("=")[0];
      const v = raw.split("=").slice(1).join("=");
      const shown = k.includes("PRIVATE_KEY") ? "<hidden>" : v;
      const flag = /39db2d89|2862cbdc/.test(v) ? "   <-- OLD pair A" : /1be5fca5|2fc638bd/.test(v) ? "   <-- new" : "";
      line("    " + k + "=" + shown + flag);
    }
  }
}

head("2. built bundle (.next) — which addresses ended up inlined?");
const hits = { oldReg: [], oldVer: [], newReg: [], newVer: [] };
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { walk(p); continue; }
    if (!/\.(js|json|html|rsc|txt)$/.test(entry) || st.size > 4000000) continue;
    let text; try { text = readFileSync(p, "utf8"); } catch { continue; }
    if (text.includes(OLD_REGISTRY.slice(2))) hits.oldReg.push(p);
    if (text.includes(OLD_VERIFIER.slice(2))) hits.oldVer.push(p);
    if (text.includes(NEW_REGISTRY.slice(2))) hits.newReg.push(p);
    if (text.includes(NEW_VERIFIER.slice(2))) hits.newVer.push(p);
  }
}
for (const d of [".next/static", ".next/server"]) walk(d);
const show = (label, arr) => line("  " + label.padEnd(26) + (arr.length ? arr.length + " file(s)  e.g. " + arr[0] : "absent"));
show("old verifier 39db2d89", hits.oldVer);
show("old registry 2862cbdc", hits.oldReg);
show("new verifier 2fc638bd", hits.newVer);
show("new registry 1be5fca5", hits.newReg);
if (hits.oldVer.length && !hits.newVer.length) line("\n  >> BUILD IS STALE: it still targets pair A.");
else if (hits.newVer.length && !hits.oldVer.length) line("\n  >> build looks correct (new verifier inlined, old one gone).");

const provider = new JsonRpcProvider(RPC);
const ERRORS = {
  [id("AlreadyVerified()").slice(0, 10)]: "AlreadyVerified",
  [id("InvalidPublicKey()").slice(0, 10)]: "InvalidPublicKey",
  [id("InvalidSignature()").slice(0, 10)]: "InvalidSignature",
  [id("InvalidNonce()").slice(0, 10)]: "InvalidNonce",
  [id("NonceAlreadyUsed()").slice(0, 10)]: "NonceAlreadyUsed",
  [id("ChallengeExpired()").slice(0, 10)]: "ChallengeExpired",
  [id("ChallengeTooFarFuture()").slice(0, 10)]: "ChallengeTooFarFuture",
  [id("RegistryCallFailed()").slice(0, 10)]: "RegistryCallFailed",
  [id("NotOwner()").slice(0, 10)]: "NotOwner",
};
async function probe(address, abi, calls) {
  const iface = new Interface(abi);
  const out = {};
  for (const [fn, args] of calls) {
    try {
      const raw = await provider.call({ to: address, data: iface.encodeFunctionData(fn, args) });
      const v = iface.decodeFunctionResult(fn, raw)[0];
      out[fn] = typeof v === "bigint" ? v.toString() : v;
    } catch { out[fn] = null; }
  }
  return out;
}

head("3. on-chain state");
try {
  line("  new verifier code size : " + ((await provider.getCode(NEW_VERIFIER)).length - 2) / 2 + " bytes");
  const reg = await probe(NEW_REGISTRY, ["function owner() view returns (address)","function issuer() view returns (address)","function badgeCount() view returns (uint256)"], [["owner", []], ["issuer", []], ["badgeCount", []]]);
  const ver = await probe(NEW_VERIFIER, ["function owner() view returns (address)","function badgeRegistry() view returns (address)","function chainId() view returns (uint64)","function destinationNetwork() view returns (string)"], [["owner", []], ["badgeRegistry", []], ["chainId", []], ["destinationNetwork", []]]);
  line("  registry.owner         : " + (reg.owner ?? "REVERT") + (reg.owner && reg.owner.toLowerCase() === DEPLOYER.toLowerCase() ? "  (deployer, correct)" : ""));
  line("  registry.issuer        : " + (reg.issuer ?? "REVERT") + (reg.issuer && reg.issuer.toLowerCase() === NEW_VERIFIER ? "  (verifier, correct)" : reg.issuer ? "  <-- MUST equal the verifier: run set-issuer" : ""));
  line("  registry.badgeCount    : " + (reg.badgeCount ?? "REVERT"));
  line("  verifier.badgeRegistry : " + (ver.badgeRegistry ?? "REVERT") + (ver.badgeRegistry && ver.badgeRegistry.toLowerCase() === NEW_REGISTRY ? "  correct" : ""));
  line("  verifier.chainId       : " + (ver.chainId ?? "REVERT"));
  line("  verifier.destination   : " + (ver.destinationNetwork ?? "REVERT"));
} catch (e) { line("  RPC problem: " + (e.shortMessage ?? e.message)); }

head("4. does verifyAndIssue exist on the new verifier?");
const iface = new Interface(["function verifyAndIssue(bytes public_key, string nonce, uint64 expires, bytes signature, string origin_network) returns (uint256)"]);
const staleArgs = [
  "0x76e35b858594887ef1b08806bbd86952df048e4f4f0eac593d43c69ea5d0c34f",
  "dd93c27657a649c3e8fac3c0",
  1789813338n,
  "0x6c56fc555ab55844b26c5f8b8c9c9f410481089e5293b86565501d924cc9122013f9847287fae436b985e4df6b1c188d9ff7261c002c2d85042f26dc16b71903",
  "mainnet-beta",
];
line("  selector app sends     : " + iface.encodeFunctionData("verifyAndIssue", staleArgs).slice(0, 10));
try {
  const raw = await provider.call({ to: NEW_VERIFIER, data: iface.encodeFunctionData("verifyAndIssue", staleArgs), from: DEPLOYER });
  line("  -> call SUCCEEDED: " + raw.slice(0, 42));
} catch (e) {
  const data = e.data ?? e.revert?.data ?? null;
  if (!data || data === "0x") {
    line("  -> EMPTY revert: the verifier does NOT recognise verifyAndIssue().");
  } else {
    const sel = data.slice(0, 10);
    line("  -> revert " + sel + "  " + (ERRORS[sel] ? ERRORS[sel] + "()" : "(unknown)"));
    if (["ChallengeExpired","InvalidSignature"].includes(ERRORS[sel])) line("     GOOD: function exists, guards run — args are just stale.");
    if (ERRORS[sel] === "RegistryCallFailed") line("     Verifier ran, REGISTRY rejected issue() -> run set-issuer.");
  }
}

head("verdict");
line("  §2 correct + §4 says the function exists -> the browser tab is serving a");
line("  cached bundle. Open the app in a FRESH INCOGNITO WINDOW and read the Live");
line("  panel's contract= value. If it shows " + OLD_VERIFIER.slice(0, 12) + " you are on the old build.");

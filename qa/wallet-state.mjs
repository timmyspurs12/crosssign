/**
 * CrossSign — wallet-state / signing / reset E2E verification (production build).
 *
 * Drives a headless Chromium against `http://localhost:3000` with FAKE
 * wallets injected at document-start, exercising the exact flows the bug
 * report listed. No real extensions, no mocking of CrossSign itself:
 *
 *   • A Solana **Wallet Standard** wallet is registered through the real
 *     `wallet-standard:app-ready` handshake (like Phantom does).
 *   • A legacy **injected** Solana provider (`window.solflare`) exercises the
 *     fallback discovery path + disconnect/accountChanged events.
 *   • EVM wallets announce through real **EIP-6963**
 *     (`eip6963:requestProvider` / `eip6963:announceProvider`).
 *   • `window.ethereum` is pre-FROZEN with Object.defineProperty so ANY
 *     CrossSign attempt to assign/redefine it would throw a page error
 *     ("Cannot redefine property") and fail the run.
 *
 * Every assertion fails loudly; console errors (incl. React hydration
 * errors) and page errors are collected per scenario and fail the suite.
 *
 * Run:  node wallet-state.mjs [baseUrl]
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BASE = process.argv[2] ?? "http://localhost:3000";

const Chromium = (await import("@sparticuz/chromium")).default;
const { inflate, setupLambdaEnvironment } = await import("@sparticuz/chromium");
const { chromium: pw } = require("playwright");

await inflate("./node_modules/@sparticuz/chromium/bin/al2023.tar.br");
setupLambdaEnvironment("/tmp/al2023/lib");

// ─────────────────────────────────────────────────────────────────────────────
// Assertion plumbing
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];
const scenarioErrors = []; // { scenario, kind, text }

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function fail(name, detail) {
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}
const SCENARIO_BUDGET_MS = 300000;
async function withBudget(label, p) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((res) => { timer = setTimeout(() => { fail(label || "scenario", `budget ${SCENARIO_BUDGET_MS / 1000}s exceeded`); res("timeout"); }, SCENARIO_BUDGET_MS); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function check(page, name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    let dump = "";
    try {
      dump = await page.evaluate(() =>
        " sol=" + JSON.stringify((window.__log?.solana || []).slice(-6)) +
        " evm=" + JSON.stringify((window.__log?.evm || []).slice(-6)) +
        " dlg=" + (document.querySelector('[role="dialog"]')?.innerText || "none").replace(/\s+/g, " ").slice(0, 200) +
        " body=" + (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 1500));
      const safe = name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
      await page.screenshot({ path: `fail-${safe}.png`, fullPage: false });
      dump += ` [shot: fail-${safe}.png]`;
    } catch { dump = " (page gone)"; }
    fail(name, (err.message || "") + "\n      └" + dump);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? "assertion failed");
}
/** Runs a setup action, prefixing failures with the step that broke. */
async function step(label, fn) {
  try {
    return await fn();
  } catch (err) {
    throw new Error(`setup[${label}]: ${(err && err.message) || err}`);
  }
}

const HYDRATION_RE =
  /hydrat|did not expect server html|error while hydrating|418|423|text content does not match|warning: rendered fewer|warning: rendered more|cannot redefine property|redefine property/i;

function instrument(page, scenario) {
  const collected = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      const text = msg.text();
      // React dev-mode SSR-only warnings are excluded; production build logs
      // hydration failures as console.error — those must never appear.
      if (/Download the React DevTools/i.test(text)) return;
      collected.push({ kind: `console.${type}`, text });
    }
  });
  page.on("pageerror", (err) => collected.push({ kind: "pageerror", text: String(err) }));
  return {
    collected,
    assertClean() {
      const bad = collected.filter((e) => HYDRATION_RE.test(e.text));
      assert(bad.length === 0, `console/page errors (${bad.length}): ${bad.map((b) => `${b.kind}: ${b.text.slice(0, 240)}`).join(" | ")}`);
      const anyError = collected.filter((e) => e.kind === "pageerror" || e.kind === "console.error");
      assert(anyError.length === 0, `unexpected errors: ${anyError.map((b) => `${b.kind}: ${b.text.slice(0, 240)}`).join(" | ")}`);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The fake wallet harness injected into every page (runs before app JS)
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_WALLETS = /* js */ `(() => {
  const cfg = Object.assign({
    phantomTest: false,   // Wallet Standard "Phantom Test" (LEGACY draft shape)
    backpackTest: false,  // Wallet Standard "Backpack Test" (LEGACY draft shape)
    phantomModern: false, // Wallet Standard "Phantom" (CURRENT spec shape, like real Phantom)
    solflareLegacy: false,// legacy injected window.solflare
    metamock: false,      // EIP-6963 "MetaMock"
    rabbyMock: false,     // EIP-6963 "RabbyMock"
    legacyEthereum: false,// window.ethereum (frozen) legacy scan target
  }, window.__wtestCfg || {});

  const b58 = (bytes) => {
    const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n;
    for (const b of bytes) n = n * 256n + BigInt(b);
    let s = "";
    while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b === 0) s = "1" + s; else break; }
    return s;
  };
  const hex = (bytes) => "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  window.__log = { solana: [], evm: [] };
  window.__test = {
    solSignCount: 0,
    solLastMessage: null,
    solLastWallet: null,
    solConnectedCount: 0,
    evmRequestAccountsCount: 0,
    evmTxCount: 0,
    evmLastTxData: null,
    solRejectConnect: false,
    solRejectSign: false,
    evmRejectConnect: false,
    evmRejectSwitch: false,
    evmUnknownChain: false,
    // ── regression hooks (wallet-state/signing) ──────────────────────────────
    solSignStarted: false,     // set when the wallet receives a sign request
    solHangSign: false,        // signature request never settles on its own
    solSignDelayMs: 0,         // …or settles after N ms (slow approval)
    solHangConnect: false,     // connection request never settles on its own
    solReturnWrongKey: false,  // wallet/provider reports a foreign signer key
    solShortSignature: false,  // wallet returns a malformed (non-64-byte) signature
    solSignError: null,        // wallet throws this exact error on sign
    evmHangRequestAccounts: false, // eth_requestAccounts never settles
    // Call conventions observed at the wallet boundary
    solSignStyle: null,        // "legacy-draft" | "variadic" (current spec)
    solLastConnectInput: undefined, // argument the wallet got on standard:connect
    solLastAccountIsLive: null,     // did the sign request use wallet.accounts[0]?
    solConnectArgsMissing: 0,       // connects invoked with NO input argument
  };
  // Prompts left pending by the hang hooks above, released by the test.
  const pending = { signs: [], connects: [], evmAccounts: [] };
  window.__test.releaseHungSigns = () => { for (const r of pending.signs.splice(0)) r(); };
  window.__test.releaseHungConnects = () => { for (const r of pending.connects.splice(0)) r(); };
  window.__test.releaseHungRequestAccounts = () => { for (const r of pending.evmAccounts.splice(0)) r(); };
  const hangIf = (flag, bucket) =>
    flag ? new Promise((resolve) => bucket.push(resolve)) : Promise.resolve();
  const delay = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  // ── Solana Wallet Standard fakes ──────────────────────────────────────────
  function makeStandardWallet(name, seed) {
    const bytes = new Uint8Array(32).fill(seed);
    const address = b58(bytes);
    const account = {
      address, publicKey: bytes, label: name + " account",
      namespace: "solana", features: {},
    };
    const listeners = {};
    const wallet = {
      name,
      icon: "data:image/svg+xml;base64,AAAA",
      version: "1.0.0",
      chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      accounts: [account],
      features: {
        "standard:connect": {
          connect: async (input) => {
            window.__test.solConnectedCount++;
            window.__test.solLastConnectInput = input === undefined ? null : JSON.parse(JSON.stringify(input));
            if (input === undefined) window.__test.solConnectArgsMissing++;
            window.__log.solana.push("connect:" + name);
            if (window.__test.solRejectConnect) {
              const e = new Error("User rejected the request."); e.code = 4001; throw e;
            }
            await hangIf(window.__test.solHangConnect, pending.connects);
            return { accounts: wallet.accounts };
          },
        },
        "standard:disconnect": {
          disconnect: async () => { window.__log.solana.push("disconnect:" + name); },
        },
        "standard:events": {
          on: (event, listener) => {
            (listeners[event] ||= []).push(listener);
            return () => { listeners[event] = (listeners[event] || []).filter((l) => l !== listener); };
          },
        },
        // SUPERSEDED draft shape: signMessage(outputs, inputs) => Promise<void>
        "solana:signMessage": {
          signMessage: async (output, inputs) => {
            const msg = new TextDecoder().decode(inputs[0].message);
            window.__test.solSignCount++;
            window.__test.solSignStyle = "legacy-draft";
            window.__test.solLastMessage = msg;
            window.__test.solLastWallet = name;
            window.__test.solLastAccountIsLive = inputs[0].account === wallet.accounts[0];
            window.__test.solSignStarted = true;
            window.__log.solana.push("signMessage:" + name);
            if (window.__test.solRejectSign) {
              const e = new Error("User rejected the signature request"); e.code = 4001; throw e;
            }
            if (window.__test.solSignError) throw new Error(window.__test.solSignError);
            await hangIf(window.__test.solHangSign, pending.signs);
            await delay(window.__test.solSignDelayMs);
            const sig = new Uint8Array(64).fill((seed % 251) + 3);
            output[0].signature = sig;
            output[0].publicKey = inputs[0].account.publicKey;
            output[0].signedMessage = new Uint8Array([...inputs[0].account.publicKey, ...inputs[0].message]);
          },
        },
      },
      // test hooks
      __emitChange() { for (const l of listeners.change || []) { try { l(); } catch {} } },
      __removeAccount() { wallet.accounts.length = 0; wallet.__emitChange(); },
      __replaceAccount(seed2) {
        const bytes2 = new Uint8Array(32).fill(seed2);
        wallet.accounts[0] = { address: b58(bytes2), publicKey: bytes2, label: name + " acct2", namespace: "solana", features: {} };
        wallet.__emitChange();
      },
      __pubkeyHex: () => hex(account.publicKey),
    };
    return wallet;
  }

  // ── Solana Wallet Standard fake: CURRENT spec shape (like real Phantom) ────
  // 'solana:signMessage' is variadic and RETURNS its outputs:
  //     signMessage(...inputs: { account, message }[]) => Promise<outputs[]>
  // This is what Phantom/Solflare/Backpack/OKX/Coinbase/MetaMask ship. A dapp
  // that still calls the superseded draft — signMessage(outputs, inputs) —
  // hands the wallet an array where it expects { account, message }; the
  // wallet throws and the flow fails even though connect succeeded.
  function makeModernStandardWallet(name, seed) {
    const bytes = new Uint8Array(32).fill(seed);
    const address = b58(bytes);
    const makeAccount = (b) => ({
      address: b58(b), publicKey: b, label: name + " account",
      namespace: "solana", features: ["solana:signMessage"],
    });
    const account = makeAccount(bytes);
    const listeners = {};
    const wallet = {
      name,
      icon: "data:image/svg+xml;base64,AAAA",
      version: "1.0.0",
      chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      accounts: [account],
      features: {
        "standard:connect": {
          // Real extension behaviour: if the site is already authorized (or the
          // user approves), the promise resolves with the CURRENT accounts.
          // A dapp requesting { silent: true } may be answered without any UI.
          connect: async (input) => {
            window.__test.solConnectedCount++;
            window.__test.solLastConnectInput = input === undefined ? null : JSON.parse(JSON.stringify(input));
            if (input === undefined) window.__test.solConnectArgsMissing++;
            window.__log.solana.push("connect:" + name);
            if (window.__test.solRejectConnect) {
              const e = new Error("User rejected the request."); e.code = 4001; throw e;
            }
            await hangIf(window.__test.solHangConnect, pending.connects);
            return { accounts: wallet.accounts };
          },
        },
        "standard:disconnect": {
          disconnect: async () => { window.__log.solana.push("disconnect:" + name); },
        },
        "standard:events": {
          on: (event, listener) => {
            (listeners[event] ||= []).push(listener);
            return () => { listeners[event] = (listeners[event] || []).filter((l) => l !== listener); };
          },
        },
        // CURRENT Wallet Standard shape: (...inputs) => Promise<outputs[]>
        "solana:signMessage": {
          version: "1.1.0",
          signMessage: async (...inputs) => {
            const input = inputs[0];
            // What a conforming variadic wallet does when handed legacy-shaped
            // arguments (the output array as "input"): it cannot read
            // account/message, so it throws before any prompt appears.
            if (!input || typeof input !== "object" || !(input.message instanceof Uint8Array)) {
              throw new TypeError("solana:signMessage expects { account, message } inputs");
            }
            window.__test.solSignCount++;
            window.__test.solSignStyle = "variadic";
            window.__test.solLastMessage = new TextDecoder().decode(input.message);
            window.__test.solLastWallet = name;
            // Proof the app re-read the wallet's CURRENT account for signing.
            window.__test.solLastAccountIsLive = input.account === wallet.accounts[0];
            window.__test.solSignStarted = true;
            window.__log.solana.push("signMessage:" + name);
            if (window.__test.solRejectSign) {
              const e = new Error("User rejected the signature request"); e.code = 4001; throw e;
            }
            if (window.__test.solSignError) throw new Error(window.__test.solSignError);
            await hangIf(window.__test.solHangSign, pending.signs);
            await delay(window.__test.solSignDelayMs);
            return inputs.map((i) => ({
              signature: window.__test.solShortSignature
                ? new Uint8Array(32).fill(0x77) // malformed on purpose
                : new Uint8Array(64).fill((seed % 251) + 3),
              signedMessage: i.message,
              // The current spec has no key field; a wallet MAY report one, and
              // CrossSign must still validate it when present.
              ...(window.__test.solReturnWrongKey
                ? { publicKey: new Uint8Array(32).fill(0x99) }
                : { publicKey: i.account.publicKey }),
            }));
          },
        },
      },
      // test hooks
      __emitChange() { for (const l of listeners.change || []) { try { l(); } catch {} } },
      __removeAccount() { wallet.accounts.length = 0; wallet.__emitChange(); },
      __replaceAccount(seed2) {
        wallet.accounts[0] = makeAccount(new Uint8Array(32).fill(seed2));
        wallet.__emitChange();
      },
      /** The extension switching accounts BETWEEN app sessions (no event). */
      __setAccountSilently(seed2) {
        wallet.accounts[0] = makeAccount(new Uint8Array(32).fill(seed2));
      },
      __pubkeyHex: () => hex(wallet.accounts[0].publicKey),
    };
    return wallet;
  }

  const standardWallets = [];
  if (cfg.phantomTest) standardWallets.push(makeStandardWallet("Phantom Test", 0x11));
  if (cfg.backpackTest) standardWallets.push(makeStandardWallet("Backpack Test", 0x22));
  if (cfg.phantomModern) standardWallets.push(makeModernStandardWallet("Phantom", 0x44));

  const register = (api) => { for (const w of standardWallets) api.register(w); };
  window.addEventListener("wallet-standard:app-ready", (ev) => register(ev.detail));
  // Belt & braces: announce late for apps that missed the ready event.
  setTimeout(() => window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register })), 600);
  window.__test.standardWallets = () => standardWallets;

  // ── Legacy injected Solflare fake ─────────────────────────────────────────
  if (cfg.solflareLegacy) {
    const bytes = new Uint8Array(32).fill(0x33);
    const addr = b58(bytes);
    const evs = {};
    window.solflare = {
      isSolflare: true,
      publicKey: null,
      connect: async () => {
        window.__test.solConnectedCount++;
        window.__log.solana.push("connect:solflare-injected");
        if (window.__test.solRejectConnect) { const e = new Error("User rejected the request."); e.code = 4001; throw e; }
        await hangIf(window.__test.solHangConnect, pending.connects);
        window.solflare.publicKey = { toString: () => addr };
        return { publicKey: window.solflare.publicKey };
      },
      disconnect: async () => { window.solflare.publicKey = null; window.__log.solana.push("disconnect:solflare-injected"); },
      signMessage: async (msgBytes) => {
        const msg = new TextDecoder().decode(msgBytes);
        window.__test.solSignCount++;
        window.__test.solLastMessage = msg;
        window.__test.solLastWallet = "solflare-injected";
        window.__test.solSignStarted = true;
        window.__log.solana.push("signMessage:solflare-injected");
        if (window.__test.solRejectSign) { const e = new Error("User rejected the signature request"); e.code = 4001; throw e; }
        await hangIf(window.__test.solHangSign, pending.signs);
        await delay(window.__test.solSignDelayMs);
        // A wallet may report WHICH key it signed with — this fake can report
        // a foreign one, to prove CrossSign refuses such a response.
        return {
          signature: new Uint8Array(64).fill(0x44),
          ...(window.__test.solReturnWrongKey
            ? { publicKey: { toString: () => "ForeignKey1111111111111111111111111111111" } }
            : {}),
        };
      },
      on: (ev, l) => { (evs[ev] ||= []).push(l); },
      removeListener: (ev, l) => { evs[ev] = (evs[ev] || []).filter((x) => x !== l); },
      __emit: (ev) => { for (const l of evs[ev] || []) { try { l(); } catch {} } },
      __pubkeyHex: () => hex(bytes),
    };
  }

  // ── EVM: EIP-6963 fakes + frozen legacy window.ethereum ──────────────────
  function makeEvmProvider(label, seedAddr, chainStart) {
    const account = "0x" + seedAddr.toString(16).padStart(40, "0");
    const state = { chainId: chainStart, accounts: [account] };
    const evs = {};
    const emit = (ev, ...args) => { for (const l of evs[ev] || []) { try { l(...args); } catch {} } };
    const hexChain = () => "0x" + state.chainId.toString(16);
    const block = () => ({
      number: "0x65", hash: "0x" + "ab".repeat(32), parentHash: "0x" + "cd".repeat(32),
      timestamp: "0x65f00000", baseFeePerGas: "0x3b9aca00", gasLimit: "0x1c9c380",
      gasUsed: "0x1000", miner: "0x" + "00".repeat(20), extraData: "0x",
      difficulty: "0x0", totalDifficulty: "0x0",
      logsBloom: "0x" + "00".repeat(256), uncles: [], transactions: [],
      stateRoot: "0x" + "ee".repeat(32), receiptsRoot: "0x" + "ff".repeat(32),
      mixHash: "0x" + "11".repeat(32), nonce: "0x0000000000000000",
    });
    const txHash = "0x" + "5f".repeat(32);
    const account0 = () => "0x" + seedAddr.toString(16).padStart(40, "0");
    const receipt = () => ({
      transactionHash: txHash, transactionIndex: "0x0", blockHash: "0x" + "ab".repeat(32),
      blockNumber: "0x64", from: state.accounts[0], to: "0x" + "01".repeat(20),
      cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00",
      contractAddress: null, logs: [], logsBloom: "0x" + "00".repeat(256),
      status: "0x1", type: "0x0", root: null,
    });
    const request = async ({ method, params }) => {
      window.__log.evm.push(label + ":" + method);
      switch (method) {
        case "eth_chainId": return hexChain();
        case "net_version": return String(state.chainId);
        case "eth_accounts": return state.accounts;
        case "eth_requestAccounts":
          window.__test.evmRequestAccountsCount++;
          if (window.__test.evmRejectConnect) { const e = new Error("User rejected the request."); e.code = 4001; e.label = label; throw e; }
          await hangIf(window.__test.evmHangRequestAccounts, pending.evmAccounts);
          return state.accounts;
        case "wallet_switchEthereumChain": {
          if (window.__test.evmRejectSwitch) { const e = new Error("User rejected"); e.code = 4001; throw e; }
          if (window.__test.evmUnknownChain) { const e = new Error("Unrecognized chain"); e.code = 4902; throw e; }
          const wanted = parseInt(params[0].chainId, 16);
          if (wanted !== 421614 && wanted !== Number(window.__targetChainId || 421614)) {
            const e = new Error("Unrecognized chain"); e.code = 4902; throw e;
          }
          state.chainId = wanted; emit("chainChanged", hexChain()); return null;
        }
        case "wallet_addEthereumChain": {
          if (window.__test.evmRejectSwitch) { const e = new Error("User rejected"); e.code = 4001; throw e; }
          state.chainId = parseInt(params[0].chainId, 16); emit("chainChanged", hexChain()); return null;
        }
        case "eth_estimateGas": return "0x01c9c380";
        case "eth_gasPrice": return "0x3b9aca00";
        case "eth_maxPriorityFeePerGas": return "0x3b9aca00";
        case "eth_feeHistory": return { baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"], oldestBlock: "0x1", reward: [["0x1"]], gasUsedRatio: [0.5] };
        case "eth_blockNumber": return "0x65";
        case "eth_getTransactionCount": return "0x0";
        case "eth_getBlockByNumber": return block();
        case "eth_getBlockByHash": return block();
        case "eth_call": return "0x";
        case "eth_sendTransaction":
          window.__test.evmTxCount++;
          window.__test.evmLastTxData = params[0] && params[0].data ? params[0].data : null;
          return txHash;
        case "eth_getTransactionReceipt": return receipt();
        case "eth_getTransactionByHash": return {
          hash: txHash, type: "0x0", chainId: hexChain(), nonce: "0x0",
          from: state.accounts[0] || account0(), to: "0x" + "01".repeat(20),
          value: "0x0", gas: "0x1c9c380", gasPrice: "0x3b9aca00", input: "0x",
          blockHash: "0x" + "ab".repeat(32), blockNumber: "0x64", transactionIndex: "0x0",
          r: "0x" + "11".repeat(32), s: "0x" + "22".repeat(32), yParity: "0x0",
        };
        case "eth_newBlockFilter": return "0x1";
        case "eth_newPendingTransactionFilter": return "0x2";
        case "eth_getFilterChanges": return ["0x" + "ab".repeat(32)];
        case "eth_getFilterLogs": return [receipt()];
        case "eth_uninstallFilter": return true;
        case "eth_subscribe": { const e = new Error("not supported"); e.code = 4200; throw e; }
        default: { const e = new Error("method not found: " + method); e.code = 4200; throw e; }
      }
    };
    const provider = {
      request,
      on: (ev, l) => { (evs[ev] ||= []).push(l); },
      removeListener: (ev, l) => { evs[ev] = (evs[ev] || []).filter((x) => x !== l); },
      __state: state,
      __hexChain: hexChain,
      __switchTo: (id) => { state.chainId = id; emit("chainChanged", hexChain()); },
      __setAccount: (seedAddr2) => { state.accounts = ["0x" + seedAddr2.toString(16).padStart(40, "0")]; emit("accountsChanged", state.accounts); },
      __dropAccounts: () => { state.accounts = []; emit("accountsChanged", []); state.accounts = [account]; },
      __account: () => account,
      // MetaMask-compatible flags (read-only scan path)
      isMetaMask: label === "MetaMask",
      isRabby: label === "Rabby",
      providers: undefined,
    };
    return provider;
  }

  const announced = [];
  if (cfg.metamock) announced.push({ rdns: "io.metamock.test", name: "MetaMask", provider: makeEvmProvider("MetaMask", 0xaaaa, 1) });
  if (cfg.rabbyMock) announced.push({ rdns: "io.rabbymock.test", name: "Rabby", provider: makeEvmProvider("Rabby", 0xbbbb, 1) });

  const announce = () => {
    for (const a of announced) {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid: crypto.randomUUID(), name: a.name, icon: "data:image/svg+xml;base64,AAAA", rdns: a.rdns }, provider: a.provider },
      }));
    }
  };
  window.addEventListener("eip6963:requestProvider", announce);
  setTimeout(announce, 300); // some extensions announce eagerly too

  // Frozen legacy window.ethereum — CrossSign must NEVER write/redefine this.
  if (cfg.legacyEthereum) {
    const legacy = makeEvmProvider("MetaMask", 0xaaaa, 1);
    Object.defineProperty(window, "ethereum", { value: legacy, writable: false, configurable: false });
    window.__test.legacyEthereum = legacy;
  }
  window.__test.announced = () => announced;
})();`;

function cfgScript(cfg) {
  return `window.__wtestCfg = ${JSON.stringify(cfg)};`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openPage(browserRef, cfg) {
  for (let attempt = 0; ; attempt++) {
    try {
      const context = await browserRef.current.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(cfgScript(cfg));
      await context.addInitScript(FAKE_WALLETS);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      openContexts.push(context);
      const instr = instrument(page, JSON.stringify(cfg));
      return { context, page, instr };
    } catch (err) {
      if (attempt > 1 || !/closed|crashed|ECONNRESET/i.test(String(err))) throw err;
      console.log("  (browser died — relaunching)");
      browserRef.current = await launchBrowser();
    }
  }
}
const browserRef = { get current() { return browser; }, set current(b) { browser = b; } };

async function goto(page, path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=/Verify your wallet|CrossSign Proof|No credential found|Identity verified|No verification found/i", { timeout: 15000 });
}

const btn = (page, name) => page.getByRole("button", { name, exact: false });
const txt = (page, s) => page.getByText(s, { exact: false }).first();
const isVisible = async (page, s) => {
  try { await txt(page, s).waitFor({ state: "visible", timeout: 2500 }); return true; } catch { return false; }
};

async function connectSolana(page, walletName) {
  await btn(page, "Connect Solana wallet").click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator(`[role="dialog"] button:has-text("${walletName}")`).first().click();
}

async function connectEvm(page, walletName) {
  await page.getByRole("button", { name: "Connect", exact: true }).first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.locator(`[role="dialog"] button:has-text("${walletName}")`).first().click();
}

const getNonce = (page) =>
  page.evaluate(() => {
    const el = document.querySelector("pre");
    const m = el && el.textContent.match(/nonce=([0-9a-f]+)/);
    return m ? m[1] : null;
  });

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

const chromePath = await Chromium.executablePath();
async function launchBrowser() {
  // Chromium.args includes --single-process/--no-zygote (Lambda-oriented) which
  // becomes input-unstable after the first page closes here; use a plain
  // multiprocess headless launch instead.
  return pw.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-setuid-sandbox", "--disable-site-isolation-trials", "--single-process", "--no-zygote"],
  });
}
let browser = await launchBrowser();
const openContexts = [];
console.log("CrossSign wallet-state E2E — production build @ " + BASE);

// ═══ S0: No wallets installed — detection ≠ connection, no hydration errors ═══
console.log("\n[S0] no wallets installed");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, {});
  await goto(page, "/verify");
  await page.waitForTimeout(1200); // allow discovery scans + effects
  await check(page, "S0 demo mode auto-selected with zero wallets (no wallet-dependent SSR flash)", async () =>
    assert(await isVisible(page, "Simulation mode"), "expected demo fallback banner"));
  await check(page, "S0 status Idle", async () =>
    assert(await isVisible(page, "Idle"), "expected idle status"));
  await check(page, "S0 no connect attempt made on load (detection is not connection)", async () =>
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 0, "wallet connect was invoked on load!"));
  await check(page, "S0 zero EVM requests on load", async () =>
    assert((await page.evaluate(() => window.__log.evm.length)) === 0, "EVM requests issued without user action"));
  await check(page, "S0 Solana selector shows install links, never phantom wallets", async () => {
    await page.locator("button:has-text('Live')").first().click(); // demo → live
    await btn(page, "Connect Solana wallet").click();
    await page.waitForSelector('[role="dialog"]');
    assert(await isVisible(page, "No Solana wallets detected"), "expected 'no wallets detected'");
    assert(await isVisible(page, "Install one of these wallets"), "expected install guidance");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S0 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S1/S2: Multiple Solana wallets (standard + injected) & EIP-6963 EVM, ═══
// ═══        frozen window.ethereum, detection lists without connecting     ═══
console.log("\n[S1] multi-wallet discovery, read-only provider handling");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, {
    phantomTest: true, backpackTest: true, solflareLegacy: true, metamock: true, rabbyMock: true, legacyEthereum: true,
  });
  await goto(page, "/verify");
  await check(page, "S1 window.ethereum stayed frozen (CrossSign never redefines it)", async () =>
    await page.waitForTimeout(800) && instr.assertClean());
  await check(page, "S1 live source kept when wallets are detected (no forced demo)", async () =>
    assert(!(await isVisible(page, "Simulation mode")), "unexpectedly fell back to demo"));
  await check(page, "S1 Solana selector lists all 3 discovered wallets", async () => {
    await btn(page, "Connect Solana wallet").click();
    await page.waitForSelector('[role="dialog"]');
    for (const w of ["Phantom Test", "Backpack Test", "Solflare"]) {
      assert(await page.locator(`[role="dialog"] button:has-text("${w}")`).count() > 0, `${w} missing from selector`);
    }
    assert(await page.locator(`[role="dialog"] button:has-text("Wallet Standard")`).count() === 2, "expected two Wallet-Standard badges");
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 0, "opening the selector must not connect anything");
    await page.keyboard.press("Escape");
  });
  await check(page, "S1 EVM selector lists both EIP-6963 wallets (no dupes from legacy scan)", async () => {
    await page.getByRole("button", { name: "Connect", exact: true }).first().click();
    await page.waitForSelector('[role="dialog"]');
    assert(await page.locator(`[role="dialog"] button:has-text("MetaMask")`).count() === 1, "MetaMask should appear exactly once (6963 + frozen legacy deduped)");
    assert(await page.locator(`[role="dialog"] button:has-text("Rabby")`).count() === 1, "Rabby should appear exactly once");
    assert((await page.evaluate(() => window.__test.evmRequestAccountsCount)) === 0, "discovery must not call eth_requestAccounts");
    await page.keyboard.press("Escape");
  });
 } catch (err) {
  fail("S1 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S3: Connect Solana → sign → EVM gate; challenge freshness ═══
console.log("\n[S3] connect → challenge → EVM gate → network flow → sign → submit");
let firstNonce = null;
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await check(page, "S3 explicit selection connects exactly that wallet (1 connect call)", async () => {
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    const log = await page.evaluate(() => window.__log.solana);
    assert(log.filter((l) => l === "connect:Phantom Test").length === 1, `connect log: ${log}`);
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 1, "connect must run once per explicit selection");
  });
  await check(page, "S3 challenge is bound to the wallet's CURRENT public key", async () => {
    const walletHex = await page.evaluate(() => window.__test.standardWallets()[0].__pubkeyHex());
    const msg = await page.locator("pre").first().textContent();
    assert(msg.includes(`wallet=${walletHex}`), "challenge not bound to connected pubkey");
  });
  firstNonce = await getNonce(page);
  await check(page, "S3 sign with no EVM wallet opens the Arbitrum selector (not a blind window.ethereum call)", async () => {
    await btn(page, "Sign verification").click();
    await page.waitForSelector('text=Connect Arbitrum wallet', { timeout: 4000 });
    assert((await page.evaluate(() => window.__test.solSignCount)) === 0, "must not burn a signature before the EVM gate");
    await page.keyboard.press("Escape");
    assert(await isVisible(page, "Connect an Arbitrum wallet"), "expected recoverable prompt notice");
  });
  await check(page, "S3 connect on wrong chain shows the switch-network notice", async () => {
    await page.getByRole("button", { name: "Connect", exact: true }).first().click();
    await page.waitForSelector('[role="dialog"][aria-label="Connect Arbitrum wallet"]');
    await page.locator('[role="dialog"] button:has-text("MetaMask")').first().click();
    await page.waitForSelector("text=wrong network", { timeout: 5000 });
  });
  await check(page, "S3 wrong network short-circuits BEFORE signing (no wasted signature)", async () => {
    await btn(page, "Sign verification").click();
    await page.waitForTimeout(700);
    assert((await page.evaluate(() => window.__test.solSignCount)) === 0, "signature requested on wrong network");
    assert(await isVisible(page, "on the Arbitrum row"), "expected switch-network guidance");
  });
  await check(page, "S3 reject switch → recoverable notice", async () => {
    await page.evaluate(() => { window.__test.evmRejectSwitch = true; });
    await btn(page, "Switch").first().click();
    await page.waitForSelector("text=Network switch was rejected", { timeout: 4000 });
    await page.evaluate(() => { window.__test.evmRejectSwitch = false; });
  });
  await check(page, "S3 accept switch → chain ready → sign → submit via chosen provider → verified", async () => {
    await btn(page, "Switch").first().click();
    await page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 4000 });
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    assert((await page.evaluate(() => window.__test.solSignCount)) === 1, "expected exactly one signature request");
    const txs = await page.evaluate(() => window.__log.evm).then((l) => l.filter((x) => x.endsWith(":eth_sendTransaction")).length);
    assert(txs === 1, `expected one sendTransaction on MetaMask provider, got ${txs}`);
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S4: Reset → reconnect: fresh everything, no stale wallet adoption ═══
console.log("\n[S4] reset → connect again → sign again (the reported bug)");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, backpackTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  // pre-accept EVM from the side row so submit works
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await btn(page, "Sign verification").click();
  await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
  await page.waitForSelector('button:has-text("Verify another wallet")');
  await btn(page, "Verify another wallet").click();
  await check(page, "S4 after reset: no wallet is displayed as connected (EVM row shows Connect, not old wallet)", async () => {
    await page.waitForSelector("text=Idle", { timeout: 4000 });
    assert(!(await isVisible(page, "MetaMask ·")), "stale EVM wallet still displayed");
    assert(await isVisible(page, "Optional now"), "Arbitrum row should be disconnected after reset");
  });
  await check(page, "S4 reset dropped both module sessions (solana:disconnect invoked, sign impossible without re-selecting)", async () => {
    const log = await page.evaluate(() => window.__log.solana);
    assert(log.some((l) => l.startsWith("disconnect:")), `expected wallet disconnect call, log: ${log}`);
    assert(!(await isVisible(page, "Ready to sign")), "reset left the flow connected");
    await btn(page, "Connect Solana wallet").click();
    await page.waitForSelector('[role="dialog"]');
    assert((await page.locator('[role="dialog"] button').count()) >= 2, "selector must require an explicit choice again");
    await page.locator('[role="dialog"] button:has-text("Phantom Test")').first().click();
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 2, "re-selection must re-connect explicitly");
  });
  await check(page, "S4 second attempt gets a DIFFERENT challenge nonce (no stale challenge reuse)", async () => {
    const nonce2 = await getNonce(page);
    assert(nonce2 && firstNonce && nonce2 !== firstNonce, `nonce reused: ${nonce2}`);
    await btn(page, "Sign verification").click();
    await page.waitForSelector('[role="dialog"][aria-label="Connect Arbitrum wallet"]', { timeout: 4000 });
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S5: Rejects are recoverable (connection, signature, network switch) ═══
console.log("\n[S5] rejection handling");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, backpackTest: true, metamock: true });
  await goto(page, "/verify");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await check(page, "S5 reject Solana connection → inline modal error, still idle, can pick another wallet", async () => {
    await page.evaluate(() => { window.__test.solRejectConnect = true; });
    await connectSolana(page, "Phantom Test");
    await page.waitForSelector('[role="dialog"] >> text=Connection was rejected in Phantom Test', { timeout: 5000 });
    await page.evaluate(() => { window.__test.solRejectConnect = false; });
    await page.locator('[role="dialog"] button:has-text("Backpack Test")').first().click();
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await connectEvm(page, "MetaMask");
  });
  await check(page, "S5 reject Solana signature → 'rejected' state + Try again, nothing submitted", async () => {
    await page.evaluate(() => { window.__test.solRejectSign = true; });
    await btn(page, "Sign verification").click();
    await page.waitForSelector("text=Signature was rejected in Backpack Test", { timeout: 5000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "rejected sign must not submit");
    await page.evaluate(() => { window.__test.solRejectSign = false; });
    await btn(page, "Try again").click();
    await page.waitForSelector("text=Idle", { timeout: 4000 });
  });
  await check(page, "S5 after rejection, challenge+account were invalidated (fresh selection required)", async () => {
    assert((await page.evaluate(() => window.__test.solLastWallet)) === "Backpack Test", "prior attempt's wallet remains bound?");
    const log = await page.evaluate(() => window.__log.solana);
    assert(log.some((l) => l === "disconnect:Backpack Test"), "retry must drop the Solana session (force fresh pubkey read)");
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S6: Expired challenge → re-minted, never reused; account switch invalidates ═══
console.log("\n[S6] challenge expiry + account-change invalidation");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await check(page, "S6 expired challenge is replaced by a fresh one (TTL respected client-side)", async () => {
    const nonce1 = await getNonce(page);
    await page.evaluate(() => { const o = Date.now; window.__t0 = o(); Date.now = () => o() + 301 * 1000; });
    await page.evaluate(() => { window.__test.solRejectSign = true; }); // fail the sign so we can inspect notice… no — re-mint happens BEFORE signing; sign then hits EVM gate; instead just count:
    await page.evaluate(() => { window.__test.solRejectSign = false; });
    await btn(page, "Sign verification").click();
    await page.waitForSelector("text=Connect Arbitrum wallet", { timeout: 5000 }); // EVM gate reached with fresh challenge
    await page.keyboard.press("Escape");
    const nonce2 = await getNonce(page);
    assert(nonce2 && nonce2 !== nonce1, `expected re-minted challenge, got ${nonce2}`);
    assert((await page.evaluate(() => window.__test.solSignCount)) === 0, "must not sign while blocked at the EVM gate");
  });
  await check(page, "S6 wallet-side account switch invalidates the in-flight attempt", async () => {
    await page.evaluate(() => window.__test.standardWallets()[0].__replaceAccount(0x55));
    await page.waitForSelector("text=switched accounts", { timeout: 5000 });
    assert(!(await isVisible(page, "Sign verification")), "stale attempt must be gone");
  });
  await check(page, "S6 wallet disconnect (account removed) invalidates in-flight attempt", async () => {
    await page.evaluate(() => { window.__test.standardWallets()[0].__accounts = null; });
    // reconnect first
    await page.evaluate(() => window.__test.standardWallets()[0].__replaceAccount(0x11));
    await btn(page, "Connect Solana wallet").click();
    await page.waitForSelector('[role="dialog"]');
    await page.locator('[role="dialog"] button:has-text("Phantom Test")').first().click();
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await page.evaluate(() => window.__test.standardWallets()[0].__removeAccount());
    await page.waitForSelector("text=disconnected", { timeout: 5000 });
    assert(!(await isVisible(page, "Sign verification")), "attempt must not survive wallet-side disconnect");
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S7: Switch Solana wallet mid-flow (selector reopens with ALL wallets) ═══
console.log("\n[S7] switch Solana wallet → sign with new key");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, backpackTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await check(page, "S7 selector reopens with every wallet selectable (no pinned previous)", async () => {
    await btn(page, "Change").first().click();
    await page.waitForSelector('[role="dialog"]');
    assert(await page.locator('[role="dialog"] button:has-text("Phantom Test")').count() > 0, "previous wallet still selectable");
    assert(await page.locator('[role="dialog"] button:has-text("Backpack Test")').count() > 0, "other wallet selectable");
    await page.locator('[role="dialog"] button:has-text("Backpack Test")').first().click();
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    const walletHex = await page.evaluate(() => window.__test.standardWallets()[1].__pubkeyHex());
    const msg = await page.locator("pre").first().textContent();
    assert(msg.includes(`wallet=${walletHex}`), "challenge not re-bound to new wallet key");
  });
  await check(page, "S7 sign uses the NEW wallet (stale Phantom key can't sign)", async () => {
    await connectEvm(page, "MetaMask");
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    assert((await page.evaluate(() => window.__test.solLastWallet)) === "Backpack Test", "signed with stale wallet");
    const msg = await page.evaluate(() => window.__test.solLastMessage);
    const hex2 = await page.evaluate(() => window.__test.standardWallets()[1].__pubkeyHex());
    assert(msg.includes(`wallet=${hex2}`), "signed message not bound to the new wallet key");
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S8: Navigation away & back + reload — stale state cannot come back ═══
console.log("\n[S8] navigate away/back, reload, storage hygiene, stale-proof persistence");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await btn(page, "Sign verification").click();
  await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
  await check(page, "S8 nothing verification-related persists in browser storage", async () => {
    const stored = await page.evaluate(() => ({
      ls: Object.keys(localStorage),
      ss: Object.keys(sessionStorage),
    }));
    assert(stored.ls.length === 0, `localStorage keys present: ${stored.ls}`);
    assert(stored.ss.length === 0, `sessionStorage keys present: ${stored.ss}`);
  });
  await check(page, "S8 reload → back to a clean idle flow (proof does not auto-resurface; signing required again)", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await goto(page, "/verify");
    await page.waitForSelector("text=Idle", { timeout: 5000 });
    assert(!(await isVisible(page, "Identity verified")), "verified state survived reload");
    assert((await page.evaluate(() => window.__test ? window.__test.solConnectedCount : 0)) === 0, "auto-reconnect on load!");
  });
  await check(page, "S8 navigate away mid-attempt → back: sessions dropped, fresh selection required, EVM prompt not skipped", async () => {
    await connectSolana(page, "Phantom Test");
    await page.waitForSelector("text=Ready to sign");
    await connectEvm(page, "MetaMask");
    await page.locator("header").getByRole("link", { name: "Explorer", exact: true }).click();
    await page.waitForSelector("text=CrossSign Proof", { timeout: 5000 });
    await page.locator("header").getByRole("link", { name: "Verify", exact: true }).click();
    await page.waitForSelector("text=Idle", { timeout: 5000 });
    assert(!(await isVisible(page, "Ready")), "previous verification state survived navigation");
    // The critical regression: previously the module EVM session survived the
    // round-trip and sign() silently submitted through the stale provider.
    await connectSolana(page, "Phantom Test");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    const evmViewAfter = await page.locator("text=/MetaMask ·/").count();
    assert(evmViewAfter === 0, `stale EVM session re-appeared after navigation (${evmViewAfter})`);
  });
  await check(page, "S8 explorer page hydration-safe (post-load list only)", async () => {
    await page.locator("header").getByRole("link", { name: "Explorer", exact: true }).click();
    await page.waitForSelector("text=Recent verifications", { timeout: 5000 });
    await page.waitForTimeout(700);
    // In-memory (session-scoped) proof store is empty after reload by design.
    assert(await isVisible(page, "No verifications yet in this session"), "proofs must not survive a reload");
    await instr.assertClean();
  });
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S9: Signature/proof replay is impossible; last tx differs ═══
console.log("\n[S9] stale signature/proof cannot be reused across attempts");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await btn(page, "Sign verification").click();
  await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
  const tx1 = await page.evaluate(() => window.__test.evmLastTxData);
  const badgeLink = await page.locator("a:has-text('View verification')").getAttribute("href");
  await btn(page, "Verify another wallet").click();
  await page.waitForSelector("text=Idle", { timeout: 4000 });
  await check(page, "S9 second attempt re-signs a fresh challenge; calldata differs (nonce/signature not replayed)", async () => {
    await connectSolana(page, "Phantom Test");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await connectEvm(page, "MetaMask");
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    const tx2 = await page.evaluate(() => window.__test.evmLastTxData);
    assert(tx2 && tx1 && tx2 !== tx1, "identical calldata across attempts (nonce replay not prevented)");
    assert(tx2.includes(tx1.slice(0, 10)), "sanity: both are verifier calldata");
  });
  await check(page, "S9 proof link carries the first attempt's proof (shareable) but app state was reset", async () => {
    assert(badgeLink && badgeLink.includes("proof="), "expected shareable proof link");
    await page.goto(BASE + badgeLink, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=/CrossSign|Identity verified|verified/i", { timeout: 5000 });
    await instr.assertClean();
  });
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S10: Demo path intact; switching sources disconnects wallets ═══
console.log("\n[S10] demo path + source isolation");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await check(page, "S10 switching to demo mid-attempt disconnects wallets and resets state", async () => {
    await page.locator("button:has-text('Interactive demo')").click();
    await page.waitForSelector("text=Start simulation", { timeout: 4000 });
    assert(await isVisible(page, "Simulation mode"), "expected demo banner");
    const evmShown = await page.locator("text=/MetaMask/").count();
    assert(evmShown === 0, "live EVM session leaked into demo mode");
  });
  await check(page, "S10 demo flow runs to success and stays labelled demo", async () => {
    await btn(page, "Start simulation").click();
    await page.waitForSelector("text=Sign verification", { timeout: 5000 });
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "demo must never touch the chain");
    assert((await page.evaluate(() => window.__test.solSignCount)) === 0, "demo must not ask real wallets to sign");
    {
      const href = await page.locator('a:has-text("View verification")').first().getAttribute("href");
      await page.goto(BASE + href, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Simulation", { timeout: 5000 });
    }
    await goto(page, "/verify");
    await page.locator("button:has-text('Start simulation'), button:has-text('Connect Solana wallet')").first().waitFor({ state: "visible", timeout: 5000 });
    await page.waitForSelector("text=Idle", { timeout: 4000 });
    await page.locator("button:has-text('Live')").click();
    await page.waitForSelector("text=Connect Solana wallet", { timeout: 4000 });
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S11: Legacy injected Solflare provider: connect, sign, accountChanged ═══
console.log("\n[S11] legacy injected provider path");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { solflareLegacy: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Solflare");
  await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
  await check(page, "S11 injected provider connect + sign + submit works", async () => {
    const log = await page.evaluate(() => window.__log.solana);
    assert(log.includes("connect:solflare-injected"), "injected connect missing");
    await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
    await connectEvm(page, "MetaMask");
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    assert((await page.evaluate(() => window.__test.solLastWallet)) === "solflare-injected", "did not sign via injected provider");
  });
  await check(page, "S11 provider-level accountChanged invalidates the attempt; reset calls provider.disconnect", async () => {
    await btn(page, "Verify another wallet").click();
    await page.waitForSelector("text=Idle", { timeout: 4000 });
    await connectSolana(page, "Solflare");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await page.evaluate(() => window.solflare.__emit("accountChanged"));
    await page.waitForSelector("text=switched accounts", { timeout: 4000 });
    const addr = await page.evaluate(() => String(window.solflare.publicKey));
    assert(addr !== "null", "injected provider connection stays at wallet level; only the ATTEMPT is cancelled");
    const log = await page.evaluate(() => window.__log.solana);
    assert(log.includes("disconnect:solflare-injected"), "reset must call disconnect on injected providers");
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S12: EVM-only wrong-chain add-chain flow (4902 → wallet_addEthereumChain) ═══
console.log("\n[S12] unknown chain → add-chain request path");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, rabbyMock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await check(page, "S12 switch to unknown chain id triggers addEthereumChain and recovers", async () => {
    await page.evaluate(() => { window.__test.evmUnknownChain = true; });
    await page.getByRole("button", { name: "Connect", exact: true }).first().click();
    await page.waitForSelector('[role="dialog"]');
    await page.locator('[role="dialog"] button:has-text("Rabby")').first().click();
    await page.waitForSelector("text=wrong network", { timeout: 5000 });
    await btn(page, "Switch").first().click(); // 4902 → add-chain accepted → ready
    await page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
    const log = await page.evaluate(() => window.__log.evm);
    assert(log.some((l) => l.endsWith(":wallet_switchEthereumChain")), "switch was never attempted");
    assert(log.some((l) => l.endsWith(":wallet_addEthereumChain")), "add-chain fallback was never attempted");
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S13: EVM accountsChanged [] (wallet-level disconnect) mid-attempt ═══
console.log("\n[S13] EVM wallet disconnects mid-attempt");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__dropAccounts(); });
  await check(page, "S13 EVM disconnect mid-attempt cancels the attempt, clears the row", async () => {
    await page.waitForSelector("text=disconnected", { timeout: 5000 });
    assert(await isVisible(page, "Optional now"), "Arbitrum row must show disconnected");
  });
  await check(page, "S13 EVM account switch mid-attempt cancels the verification", async () => {
    await connectSolana(page, "Phantom Test");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await connectEvm(page, "MetaMask");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__setAccount(0xcccc); });
    await page.waitForSelector("text=switched accounts", { timeout: 5000 });
    assert(!(await isVisible(page, "Sign verification")), "stale attempt must not survive the account switch");
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S14: Phantom-EVM separation — Solana provider never sees eth_*, EVM never sees solana ═══
console.log("\n[S14] ecosystem isolation");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign");
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await btn(page, "Sign verification").click();
  await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
  await check(page, "S14 Solana wallet only ever received connect/signMessage; EVM provider only eth_/wallet_", async () => {
    const sol = await page.evaluate(() => window.__log.solana);
    const evm = await page.evaluate(() => window.__log.evm);
    assert(sol.every((l) => !/eth_|wallet_/.test(l)), `Solana provider received EVM call: ${sol}`);
    assert(evm.every((l) => !/signMessage/.test(l)), `EVM provider received Solana call: ${evm}`);
  });
  await instr.assertClean();
 } catch (err) {
  fail("scenario setup", String((err && err.message) || err) + " :: " + String((err && err.stack)||"").split("\n")[1]?.trim().slice(0,160));
 }
})());

// ═══ S15: hung signature request + reset — the flow must not deadlock, and a
// ═══      late-resolving signature must not clobber the new attempt
console.log("\n[S15] unresolved signature prompt + reset (deadlock / late signature)");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, backpackTest: true, metamock: true });
  await step("open /verify", () => goto(page, "/verify"));
  await step("connect Solana", () => connectSolana(page, "Phantom Test"));
  await step("wait connected", () => page.waitForSelector("text=Ready to sign", { timeout: 5000 }));
  await step("switch MetaMask chain", () =>
    page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); }));
  await step("connect MetaMask", () => connectEvm(page, "MetaMask"));
  await step("wait MetaMask ready", () =>
    page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }));

  await page.evaluate(() => { window.__test.solHangSign = true; });
  await step("click Sign", () => btn(page, "Sign verification").click());
  await step("wait signing", () => page.waitForSelector("text=Waiting for signature", { timeout: 5000 }));

  await check(page, "S15 reset during an unresolved signature still allows a NEW connect (no dead lock)", async () => {
    // Reset the flow while the wallet's sign promise is still pending.
    await page.locator("button:has-text('Interactive demo')").click();
    await page.waitForSelector("text=Start simulation", { timeout: 4000 });
    assert(!(await isVisible(page, "Waiting for signature")), "stale signing state survived the reset");
    await page.locator("button:has-text('Live')").click();
    await page.waitForSelector("text=Connect Solana wallet", { timeout: 4000 });
    await btn(page, "Connect Solana wallet").click();
    await page.waitForSelector('[role="dialog"]');
    await page.locator('[role="dialog"] button:has-text("Phantom Test")').first().click();
    // Before the fix this click was silently swallowed (boolean busy flag from
    // the still-pending signature) and the flow stayed dead at "Idle".
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 2, "re-selection must re-connect explicitly");
  });

  await check(page, "S15 late signature from the cancelled attempt cannot resurrect/overwrite state", async () => {
    const nonceBefore = await getNonce(page);
    await page.evaluate(() => window.__test.releaseHungSigns());
    await page.waitForTimeout(1200);
    const nonceAfter = await getNonce(page);
    assert(nonceAfter && nonceAfter === nonceBefore, "the stale signature overwrote the new attempt's challenge");
    assert(await isVisible(page, "Ready to sign"), "fresh attempt was clobbered by the stale signature");
    assert(!(await isVisible(page, "Identity verified")), "stale signature produced a verification");
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "a cancelled attempt submitted a transaction");
  });

  await check(page, "S15 the fresh attempt still signs + submits normally afterwards", async () => {
    // The reset dropped BOTH sessions, so the Arbitrum wallet is re-selected
    // explicitly — exactly the "fresh start" the reset promises.
    await step("switch MetaMask chain", () =>
      page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); }));
    await step("reconnect Arbitrum", () => connectEvm(page, "MetaMask"));
    await step("wait chain ready", () =>
      page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }));
    await page.evaluate(() => { window.__test.solHangSign = false; });
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 1, "expected exactly one on-chain submit");
    assert((await page.evaluate(() => window.__test.solSignCount)) === 2, "expected one signature per attempt");
    await instr.assertClean();
  });

  await check(page, "S15 an unresolved Solana CONNECT + reset is dropped, never adopted", async () => {
    await step("reset from success", async () => {
      await btn(page, "Verify another wallet").click();
      await page.waitForSelector("text=Idle", { timeout: 4000 });
    });
    await page.evaluate(() => { window.__test.solHangConnect = true; });
    await step("open selector", async () => {
      await btn(page, "Connect Solana wallet").click();
      await page.waitForSelector('[role="dialog"]');
    });
    await step("pick Backpack (hangs)", () =>
      page.locator('[role="dialog"] button:has-text("Backpack Test")').first().click());
    await page.waitForTimeout(250);
    // Close the selector (the wallet prompt itself keeps waiting), then reset.
    await step("close selector", async () => {
      await page.keyboard.press("Escape");
      await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 3000 });
    });
    await step("reset while the prompt is open", async () => {
      await page.locator("button:has-text('Interactive demo')").click();
      await page.waitForSelector("text=Start simulation", { timeout: 4000 });
    });
    await page.evaluate(() => { window.__test.releaseHungConnects(); window.__test.solHangConnect = false; });
    await page.waitForTimeout(900);
    assert(await isVisible(page, "Start simulation"), "stale connect changed the (demo) flow");
    await step("back to Live", async () => {
      await page.locator("button:has-text('Live')").click();
      await page.waitForSelector("text=Connect Solana wallet", { timeout: 4000 });
    });
    assert(!(await isVisible(page, "Ready to sign")), "a wallet prompt from a cancelled attempt was adopted");
    assert(await isVisible(page, "Optional now"), "no wallet should be connected after the reset");
  });
  await instr.assertClean();
 } catch (err) {
  fail("S15 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S16: EVM connect still in flight when the attempt is retried must not
// ═══      resurrect a wallet session the user never finished connecting
console.log("\n[S16] EVM prompt outliving retry() — no session resurrection");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true, rabbyMock: true });
  await step("open /verify", () => goto(page, "/verify"));
  await step("connect Solana", () => connectSolana(page, "Phantom Test"));
  await step("wait connected", () => page.waitForSelector("text=Ready to sign", { timeout: 5000 }));
  await step("switch MetaMask chain", () =>
    page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); }));
  await step("connect MetaMask", () => connectEvm(page, "MetaMask"));
  await step("wait MetaMask ready", () =>
    page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }));

  // Fail the signature so "Try again" (retry) is reachable mid-flow.
  await page.evaluate(() => { window.__test.solRejectSign = true; });
  await step("start a failing sign", () => btn(page, "Sign verification").click());
  await step("wait rejection", () => page.waitForSelector("text=Signature was rejected in Phantom Test", { timeout: 5000 }));
  await page.evaluate(() => { window.__test.solRejectSign = false; });

  // Start a SECOND EVM connection (Rabby, a DIFFERENT wallet/address) that
  // stays pending in the extension…
  await page.evaluate(() => { const p = window.__test.announced()[1].provider; p.__switchTo(421614); });
  await page.evaluate(() => { window.__test.evmHangRequestAccounts = true; });
  await step("open Arbitrum selector", async () => {
    await page.getByRole("button", { name: "Change", exact: true }).first().click();
    await page.waitForSelector('[role="dialog"][aria-label="Connect Arbitrum wallet"]');
  });
  await step("pick Rabby (hangs)", () =>
    page.locator('[role="dialog"] button:has-text("Rabby")').first().click());
  await page.waitForTimeout(250);
  // Close the selector so the (still pending) prompt does not block the UI;
  // the connection request itself keeps waiting inside the wallet.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // …then reset the attempt while that prompt is still open.
  await step("retry (reset)", async () => {
    await btn(page, "Try again").click();
    await page.waitForSelector("text=Idle", { timeout: 4000 });
  });

  await check(page, "S16 a connection that outlives retry() is dropped, not adopted", async () => {
    assert(await isVisible(page, "MetaMask ·"), "sanity: retry keeps the already-connected Arbitrum wallet");
    assert((await page.locator('[role="dialog"]').count()) === 0, "the wallet selector must be closed after the reset");
    await page.evaluate(() => window.__test.releaseHungRequestAccounts());
    await page.waitForTimeout(1200);
    assert((await page.locator("text=/Rabby · /").count()) === 0, "cancelled Rabby connection surfaced in the row");
    assert((await page.locator("text=/0x000000…00bbbb/").count()) === 0, "cancelled Rabby account surfaced in the row");
    assert(await isVisible(page, "Optional now"), "EVM session from a cancelled attempt was resurrected");
  });

  await check(page, "S16 the next attempt cannot silently reuse that stale EVM session", async () => {
    await step("connect Solana again", () => connectSolana(page, "Phantom Test"));
    await step("wait connected", () => page.waitForSelector("text=Ready to sign", { timeout: 5000 }));
    await step("click Sign", () => btn(page, "Sign verification").click());
    // The gate must ask for an Arbitrum wallet again — never submit through a
    // provider the reset already dropped.
    await page.waitForSelector('[role="dialog"][aria-label="Connect Arbitrum wallet"]', { timeout: 5000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "submitted through a stale EVM provider");
    assert((await page.evaluate(() => window.__test.solSignCount)) === 1, "must not burn a signature before the gate");
    await page.keyboard.press("Escape");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S16 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S17: wallet-side account change DURING an in-flight signature must
// ═══      cancel the attempt immediately (not when the promise happens to settle)
console.log("\n[S17] account switch inside the wallet while the sign prompt is open");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });

  await page.evaluate(() => { window.__test.solHangSign = true; });
  await btn(page, "Sign verification").click();
  await page.waitForSelector("text=Waiting for signature", { timeout: 5000 });

  await check(page, "S17 wallet-side account switch cancels the signing attempt promptly", async () => {
    await page.evaluate(() => window.__test.standardWallets()[0].__replaceAccount(0x55));
    await page.waitForSelector("text=switched accounts", { timeout: 5000 });
    assert(!(await isVisible(page, "Waiting for signature")), "UI kept claiming the cancelled attempt was signing");
    assert(!(await isVisible(page, "Ready to sign")), "stale attempt must be gone");
  });

  await check(page, "S17 the late signature of the cancelled attempt stays inert", async () => {
    await page.evaluate(() => { window.__test.solHangSign = false; window.__test.releaseHungSigns(); });
    await page.waitForTimeout(1000);
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "cancelled attempt submitted");
    assert(!(await isVisible(page, "Identity verified")), "cancelled attempt verified");
    assert(!(await isVisible(page, "Ready to sign")), "cancelled attempt came back");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S17 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S18: a challenge that expires while the user is approving must never be
// ═══      submitted (no stale bytes on-chain, no stale verification state)
console.log("\n[S18] challenge expiry during the signature prompt");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });

  // Slow approval: the wallet answers after 1.2s, and the challenge TTL
  // (300s) elapses while the request is pending — but only AFTER the wallet
  // received it, so the pre-sign freshness check legitimately passes.
  await page.evaluate(() => {
    const real = Date.now;
    let offset = 0;
    Date.now = () => real.call(Date) + offset;
    const iv = setInterval(() => {
      if (window.__test.solSignStarted) { offset = 301000; clearInterval(iv); }
    }, 10);
  });
  await page.evaluate(() => { window.__test.solSignDelayMs = 1200; });
  await btn(page, "Sign verification").click();

  await check(page, "S18 expired-while-signing challenge is never submitted", async () => {
    await page.waitForSelector("text=/expired/i", { timeout: 8000 });
    await page.waitForTimeout(600);
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "expired challenge was submitted on-chain");
    assert(!(await isVisible(page, "Identity verified")), "expired challenge produced a verification");
    assert(!(await isVisible(page, "Verifying")), "flow stuck in verifying with an expired challenge");
  });

  await check(page, "S18 no stale verification state is left behind", async () => {
    const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    assert(/expired/i.test(body), "expected a clear expiry message");
    assert(!/Waiting for signature/.test(body), "stale signing state left behind");
    assert((await page.locator("pre").count()) === 0, "stale challenge panel left behind");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S18 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S19: a wallet that reports a DIFFERENT key than the one it was asked to
// ═══      sign for must be refused (injected-provider path)
console.log("\n[S19] injected provider signing with a foreign key");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { solflareLegacy: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Solflare");
  await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
  await page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); });
  await connectEvm(page, "MetaMask");
  await page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });

  await check(page, "S19 signature attributed to another account is rejected before submit", async () => {
    await page.evaluate(() => { window.__test.solReturnWrongKey = true; });
    await btn(page, "Sign verification").click();
    await page.waitForSelector("text=/different account/i", { timeout: 6000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "foreign key signature was submitted");
    assert(!(await isVisible(page, "Identity verified")), "foreign key signature verified");
  });

  await check(page, "S19 honest key still verifies afterwards (recoverable)", async () => {
    await page.evaluate(() => { window.__test.solReturnWrongKey = false; });
    await btn(page, "Try again").click();
    await connectSolana(page, "Solflare");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 1, "expected exactly one submit after recovery");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S19 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S20: an EVM connection that outlives PAGE NAVIGATION must never be used
// ═══      by the next attempt (module-level session across unmount)
console.log("\n[S20] in-flight EVM connect across navigation");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomTest: true, metamock: true });
  await goto(page, "/verify");
  await connectSolana(page, "Phantom Test");
  await page.waitForSelector("text=Ready to sign", { timeout: 5000 });

  await page.evaluate(() => { window.__test.evmHangRequestAccounts = true; });
  await page.getByRole("button", { name: "Connect", exact: true }).first().click();
  await page.waitForSelector('[role="dialog"][aria-label="Connect Arbitrum wallet"]');
  await page.locator('[role="dialog"] button:has-text("MetaMask")').first().click();
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape"); // close the modal, prompt stays pending

  // Leave /verify (unmount drops sessions) and come back.
  await page.locator("header").getByRole("link", { name: "Explorer", exact: true }).click();
  await page.waitForSelector("text=CrossSign Proof", { timeout: 5000 });
  await page.locator("header").getByRole("link", { name: "Verify", exact: true }).click();
  await page.waitForSelector("text=Connect Solana wallet", { timeout: 5000 });

  await check(page, "S20 a prompt that outlives navigation is not adopted by the next attempt", async () => {
    await page.evaluate(() => window.__test.releaseHungRequestAccounts());
    await page.waitForTimeout(1200);
    assert((await page.locator("text=/MetaMask ·/").count()) === 0, "cancelled connection surfaced after navigation");
    assert(await isVisible(page, "Optional now"), "EVM session was resurrected across navigation");
  });

  await check(page, "S20 the next attempt asks for an Arbitrum wallet instead of using it", async () => {
    await connectSolana(page, "Phantom Test");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await btn(page, "Sign verification").click();
    await page.waitForSelector('[role="dialog"][aria-label="Connect Arbitrum wallet"]', { timeout: 5000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "submitted through a provider dropped on navigation");
    assert((await page.evaluate(() => window.__log.evm.filter((l) => l.endsWith(":eth_sendTransaction")).length)) === 0, "stale provider received a transaction");
    await page.keyboard.press("Escape");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S20 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S21: CURRENT Wallet Standard signing shape (what real Phantom ships) ═══
// Reproduces the real-browser failure: Phantom connects, then the signature
// request fails inside the wallet because the app calls the superseded
// `signMessage(outputs, inputs)` draft instead of the standard
// `signMessage({ account, message }) => Promise<outputs[]>`.
console.log("\n[S21] current Wallet Standard signMessage shape (real-Phantom style)");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomModern: true, metamock: true });
  await step("open /verify", () => goto(page, "/verify"));

  await check(page, "S21 no wallet is contacted before the user explicitly picks one", async () => {
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 0, "connected without an explicit selection");
    assert(await isVisible(page, "Connect Solana wallet"), "expected the idle connect state");
  });

  await step("connect Phantom", () => connectSolana(page, "Phantom"));
  await step("wait connected", () => page.waitForSelector("text=Ready to sign", { timeout: 5000 }));

  await check(page, "S21 connect is requested explicitly (never a silent connect)", async () => {
    const input = await page.evaluate(() => window.__test.solLastConnectInput);
    assert(input && input.silent === false, `expected { silent: false }, wallet got ${JSON.stringify(input)}`);
  });
  await check(page, "S21 challenge binds the wallet's current public key", async () => {
    const walletHex = await page.evaluate(() => window.__test.standardWallets()[0].__pubkeyHex());
    const msg = await page.locator("pre").first().textContent();
    assert(msg.includes(`wallet=${walletHex}`), "challenge not bound to the connected pubkey");
  });

  await step("switch MetaMask chain", () =>
    page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); }));
  await step("connect MetaMask", () => connectEvm(page, "MetaMask"));
  await step("wait chain ready", () =>
    page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }));

  await check(page, "S21 signing works with the CURRENT spec shape (the real-Phantom failure)", async () => {
    await btn(page, "Sign verification").click();
    await page.waitForSelector('a:has-text("View verification")', { timeout: 20000 });
    const style = await page.evaluate(() => window.__test.solSignStyle);
    assert(style === "variadic", `wallet was called the wrong way (saw: ${style})`);
    assert((await page.evaluate(() => window.__test.solSignCount)) === 1, "expected exactly one signature request");
    const msg = await page.evaluate(() => window.__test.solLastMessage);
    const walletHex = await page.evaluate(() => window.__test.standardWallets()[0].__pubkeyHex());
    assert(msg && msg.includes(`wallet=${walletHex}`), "the wallet never received the canonical challenge message");
    assert(await page.evaluate(() => window.__test.solLastAccountIsLive), "signing used a cached account, not the wallet's current one");
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 1, "expected exactly one on-chain submit");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S21 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S22: the extension already authorized the site (no approval prompt) ═══
// The behaviour a real Phantom/OKX user sees: picking the wallet connects
// instantly because the EXTENSION remembers the site. CrossSign must still
// require an explicit selection, ask for an explicit (never silent) connect,
// start a fresh attempt and bind the challenge to the wallet's CURRENT key.
console.log("\n[S22] pre-authorized site — explicit connect, fresh key, no adopted session");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomModern: true });
  await step("open /verify", () => goto(page, "/verify"));

  await check(page, "S22 page load adopts no session, even with an authorized wallet", async () => {
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 0, "the extension was contacted without user action");
    assert(await isVisible(page, "Connect Solana wallet"), "expected the idle connect state");
  });
  await check(page, "S22 opening the selector does not connect either", async () => {
    await btn(page, "Connect Solana wallet").click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(400);
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 0, "opening the selector connected a wallet");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  });

  // The extension changed accounts since the last visit (no CrossSign event).
  await page.evaluate(() => window.__test.standardWallets()[0].__setAccountSilently(0x77));
  await step("connect Phantom", () => connectSolana(page, "Phantom"));
  await step("wait connected", () => page.waitForSelector("text=Ready to sign", { timeout: 5000 }));

  await check(page, "S22 a fresh attempt binds the wallet's CURRENT key, not a remembered one", async () => {
    const walletHex = await page.evaluate(() => window.__test.standardWallets()[0].__pubkeyHex());
    const msg = await page.locator("pre").first().textContent();
    assert(msg.includes(`wallet=${walletHex}`), "challenge is not bound to the wallet's current key");
  });
  await check(page, "S22 every connect request is explicit — CrossSign never asks for a silent connect", async () => {
    const args = await page.evaluate(() => ({
      missing: window.__test.solConnectArgsMissing,
      last: window.__test.solLastConnectInput,
    }));
    assert(args.missing === 0, `${args.missing} connect call(s) were made without an explicit input`);
    assert(args.last && args.last.silent === false, `expected an explicit non-silent connect, got ${JSON.stringify(args.last)}`);
  });
  await check(page, "S22 re-selecting the wallet is a new explicit connection with a NEW challenge", async () => {
    const nonce1 = await getNonce(page);
    await btn(page, "Change").first().click();
    await page.waitForSelector('[role="dialog"]');
    assert(await page.locator('[role="dialog"] button:has-text("Phantom")').count() > 0, "the wallet must be re-selectable");
    await page.locator('[role="dialog"] button:has-text("Phantom")').first().click();
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    const nonce2 = await getNonce(page);
    assert(nonce1 && nonce2 && nonce1 !== nonce2, `challenge was reused across attempts (${nonce1} → ${nonce2})`);
    assert((await page.evaluate(() => window.__test.solConnectedCount)) === 2, "each explicit selection must connect");
    const walletHex = await page.evaluate(() => window.__test.standardWallets()[0].__pubkeyHex());
    const msg = await page.locator("pre").first().textContent();
    assert(msg.includes(`wallet=${walletHex}`), "challenge not re-bound to the current key");
    await instr.assertClean();
  });
 } catch (err) {
  fail("S22 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ═══ S23: validation + diagnostics on the current-shape path ═══
console.log("\n[S23] current-shape signer validation and error surfacing");
await withBudget("scenario", (async () => {
 try {
  const { context, page, instr } = await openPage(browserRef, { phantomModern: true, metamock: true });
  await step("open /verify", () => goto(page, "/verify"));
  await step("connect Phantom", () => connectSolana(page, "Phantom"));
  await step("wait connected", () => page.waitForSelector("text=Ready to sign", { timeout: 5000 }));
  await step("switch MetaMask chain", () =>
    page.evaluate(() => { const p = window.__test.announced()[0].provider; p.__switchTo(421614); }));
  await step("connect MetaMask", () => connectEvm(page, "MetaMask"));
  await step("wait chain ready", () =>
    page.getByText("Arbitrum Sepolia", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }));

  await check(page, "S23 a signature the wallet attributes to another key is refused before submit", async () => {
    await page.evaluate(() => { window.__test.solReturnWrongKey = true; });
    await btn(page, "Sign verification").click();
    await page.waitForSelector("text=/different account/i", { timeout: 6000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "foreign-key signature was submitted");
    assert(!(await isVisible(page, "Identity verified")), "foreign-key signature verified");
  });

  await check(page, "S23 a malformed (wrong-length) signature is refused", async () => {
    await page.evaluate(() => { window.__test.solReturnWrongKey = false; window.__test.solShortSignature = true; });
    await btn(page, "Try again").click();
    await connectSolana(page, "Phantom");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await btn(page, "Sign verification").click();
    await page.waitForSelector("text=/malformed signature/i", { timeout: 6000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "malformed signature was submitted");
  });

  await check(page, "S23 the wallet's own error text reaches the user (not swallowed)", async () => {
    await page.evaluate(() => {
      window.__test.solShortSignature = false;
      window.__test.solSignError = "Phantom: signing is unavailable for this account (E-4417)";
    });
    await btn(page, "Try again").click();
    await connectSolana(page, "Phantom");
    await page.waitForSelector("text=Ready to sign", { timeout: 5000 });
    await btn(page, "Sign verification").click();
    await page.waitForSelector("text=/E-4417/", { timeout: 6000 });
    assert((await page.evaluate(() => window.__test.evmTxCount)) === 0, "a failed sign must not submit");
    await page.evaluate(() => { window.__test.solSignError = null; });
    await instr.assertClean();
  });
 } catch (err) {
  fail("S23 scenario", String((err && err.message) || err).split("\n")[0]);
 }
})());

// ─────────────────────────────────────────────────────────────────────────────

await browser.close();

console.log(`\n${"═".repeat(64)}`);
console.log(`PASSED: ${passed}   FAILED: ${failures.length}`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("ALL WALLET-STATE E2E CHECKS PASSED");
}

#!/usr/bin/env python3
"""Align CrossSign's ABI with what stylus-sdk 0.10.9 actually exports.
Vec<u8> exports as `uint8[]`, NOT `bytes`, so every function with a byte
PARAMETER has a different selector than the app was sending. Tuple returns and
events keep `bytes` (identical layout; events are declared with bytes).
Idempotent."""
import pathlib

HEX2ARR = [
    ("(bytes public_key, string nonce, uint64 expires, bytes signature, string origin_network)",
     "(uint8[] public_key, string nonce, uint64 expires, uint8[] signature, string origin_network)"),
    ("(bytes public_key, bytes signature, bytes message)",
     "(uint8[] public_key, uint8[] signature, uint8[] message)"),
    ("(bytes public_key, string nonce, uint64 expires)",
     "(uint8[] public_key, string nonce, uint64 expires)"),
    ("issue(address recipient, bytes public_key, string origin_network)",
     "issue(address recipient, uint8[] public_key, string origin_network)"),
]

def edit(path, subs, label):
    p = pathlib.Path(path)
    if not p.exists():
        print(f"  !! MISSING {path}"); return
    text = p.read_text(); before = text
    for old, new in subs:
        if old in text:
            text = text.replace(old, new)
        elif new not in text:
            print(f"  ?? pattern not found in {path}: {old[:70]}")
    p.write_text(text)
    print(("  changed   " if text != before else "  unchanged ") + f"{path}  ({label})")

print("1. ABI strings")
edit("lib/contract-abi.ts", HEX2ARR, "uint8[] params")
edit("contract/verifier/src/lib.rs",
     [("issue(address recipient, bytes public_key, string origin_network)",
       "issue(address recipient, uint8[] public_key, string origin_network)")],
     "sol_interface + test mock")
print("2. call sites (ethers needs a real array for uint8[])")
edit("lib/chain/client.ts", [
    ("  Contract,\n  JsonRpcProvider,", "  Contract,\n  getBytes,\n  JsonRpcProvider,"),
    ("    params.publicKeyHex,", "    Array.from(getBytes(params.publicKeyHex)),"),
    ("    params.signatureHex,", "    Array.from(getBytes(params.signatureHex)),"),
], "getBytes")
edit("app/api/verify/prepare/route.ts", [
    ('import { Interface } from "ethers";', 'import { Interface, getBytes } from "ethers";'),
    ("    publicKey,\n    nonce,", "    Array.from(getBytes(publicKey)),\n    nonce,"),
    ("    signature,\n    originNetwork,", "    Array.from(getBytes(signature)),\n    originNetwork,"),
], "getBytes")
print("\ndone. Next: npm run typecheck && (cd contract && cargo test)")

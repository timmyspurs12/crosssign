/**
 * Base58 (Bitcoin alphabet) encode/decode — used to convert Solana public
 * keys between their on-chain 32-byte form and the base58 form Phantom shows.
 *
 * No external dependency: this is the same alphabet Phantom/Solana use.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58encode(bytes: Uint8Array): string {
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) str += "1";
  for (let q = digits.length - 1; q >= 0; q--) str += ALPHABET[digits[q]];
  return str;
}

export function b58decode(str: string): Uint8Array {
  if (!str || typeof str !== "string") {
    throw new Error("invalid base58 string");
  }
  const bytes: number[] = [0];
  for (let i = 0; i < str.length; i++) {
    const value = ALPHABET.indexOf(str[i]);
    if (value < 0) throw new Error(`invalid base58 character: ${str[i]}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leading = 0;
  while (leading < str.length && str[leading] === "1") leading++;
  const out = new Uint8Array(leading + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[leading + i] = bytes[bytes.length - 1 - i];
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const s = hex.replace(/^0x/i, "");
  if (s.length % 2 !== 0) throw new Error("invalid hex string");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Base58 (Solana) → 0x-hex (32 bytes) — the wallet field of the challenge. */
export function solanaPubkeyToHex(base58: string): string {
  const bytes = b58decode(base58);
  if (bytes.length !== 32) {
    throw new Error("expected a 32-byte Ed25519 public key");
  }
  return `0x${bytesToHex(bytes)}`;
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Truncate a long address/key for display: 8xKf1…q9Zt */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** "0x1a2b…3c4d" style, used for tx hashes / contract addresses. */
export function formatHash(value: string, head = 8, tail = 6): string {
  return truncateMiddle(value, head, tail);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Deterministic pseudo-random from a string — used by the demo adapter only. */
export function seededHex(seed: string, length = 64): string {
  let h = 2166136261;
  const str = `${seed}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = "";
  let x = h >>> 0;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x = x >>> 0;
    out += (x >>> 0).toString(16).padStart(8, "0");
  }
  return `0x${out.slice(0, length)}`;
}

"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The CrossSign identity seal.
 * Concentric rings + an accent check — assembles on mount, with the dashed
 * ring rotating very slowly. Restrained: no glow, no particle noise.
 */
export function IdentityBadge({
  size = 160,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <motion.svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cn("overflow-visible", className)}
      initial="hidden"
      animate="visible"
      aria-hidden
    >
      {/* outer ring */}
      <motion.circle
        cx="60"
        cy="60"
        r="57"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.16"
        strokeWidth="1.5"
        variants={{
          hidden: { opacity: 0, scale: 0.94 },
          visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
        }}
      />
      {/* rotating dashed ring */}
      <motion.circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke="#00B3A4"
        strokeOpacity="0.55"
        strokeWidth="1.2"
        strokeDasharray="3 6"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { delay: 0.2, duration: 0.4 } },
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 48, ease: "linear" }}
        style={{ transformOrigin: "50% 50%", transformBox: "fill-box" }}
      />
      {/* inner disc */}
      <motion.circle
        cx="60"
        cy="60"
        r="41"
        fill="#FCFCFA"
        stroke="currentColor"
        strokeOpacity="0.12"
        strokeWidth="1"
        variants={{
          hidden: { opacity: 0, scale: 0.85 },
          visible: {
            opacity: 1,
            scale: 1,
            transition: { delay: 0.3, duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          },
        }}
      />
      {/* monogram */}
      <motion.text
        x="60"
        y="52"
        textAnchor="middle"
        fill="currentColor"
        className="font-mono"
        style={{ fontSize: 17, fontWeight: 600, letterSpacing: "0.18em" }}
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 0.85, transition: { delay: 0.55, duration: 0.4 } },
        }}
      >
        CS
      </motion.text>
      {/* check */}
      <motion.path
        d="M50 62l7 7 14-15"
        fill="none"
        stroke="#00B3A4"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: {
            pathLength: 1,
            opacity: 1,
            transition: { delay: 0.7, duration: 0.45, ease: "easeOut" },
          },
        }}
      />
    </motion.svg>
  );
}

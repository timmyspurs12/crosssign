import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F6F5F1",
        surface: "#FCFCFA",
        ink: {
          DEFAULT: "#16171C",
          soft: "#3E434C",
          muted: "#7A7F89",
          faint: "#A7ABB3",
        },
        line: {
          DEFAULT: "#E7E5DE",
          strong: "#D5D2C8",
        },
        accent: {
          DEFAULT: "#00B3A4",
          strong: "#00857B",
          soft: "#E7F6F4",
          faint: "#F1FAF9",
        },
        good: {
          DEFAULT: "#14975A",
          soft: "#E8F6EE",
        },
        warn: {
          DEFAULT: "#B97A14",
          soft: "#FBF2E0",
        },
        danger: {
          DEFAULT: "#CE4B4B",
          soft: "#FBEAEA",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,21,26,0.04), 0 8px 24px rgba(20,21,26,0.05)",
        pop: "0 1px 2px rgba(20,21,26,0.06), 0 16px 40px rgba(20,21,26,0.10)",
        hairline: "inset 0 0 0 1px rgba(20,21,26,0.06)",
      },
      letterSpacing: {
        caps: "0.14em",
        capsWide: "0.22em",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

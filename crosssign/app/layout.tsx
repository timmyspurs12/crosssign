import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "CrossSign — Identity across chains",
    template: "%s · CrossSign",
  },
  description:
    "Prove ownership of a wallet from another ecosystem without bridging your assets. Ed25519 verification on Arbitrum, via Stylus.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={GeistSans.variable}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}

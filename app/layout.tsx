import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { SITE } from "@/lib/config";
import "./globals.css";

const SITE_URL = SITE.url;

const TITLE = "CrossSign — Identity across chains";
const DESCRIPTION =
  "Prove ownership of a wallet from another ecosystem without bridging your assets. Ed25519 verification on Arbitrum, via Stylus.";

export const metadata: Metadata = {
  // Absolute base for OG/Twitter URLs (icons + social images are picked up
  // from the app/ file conventions: icon.png, apple-icon.png,
  // opengraph-image.png, twitter-image.png, favicon.ico).
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · CrossSign",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "CrossSign",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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

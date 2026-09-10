import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Hero } from "@/components/home/Hero";
import { Benefits } from "@/components/home/Benefits";
import { HowItWorks } from "@/components/home/HowItWorks";
import { TechnicalSection } from "@/components/home/TechnicalSection";
import { BuildathonStrip } from "@/components/home/BuildathonStrip";
import { FinalCta } from "@/components/home/FinalCta";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Benefits />
        <HowItWorks />
        <TechnicalSection />
        <BuildathonStrip />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

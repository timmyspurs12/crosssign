import { Suspense } from "react";
import { BadgePage } from "@/components/badge/BadgePage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BadgePage />
    </Suspense>
  );
}

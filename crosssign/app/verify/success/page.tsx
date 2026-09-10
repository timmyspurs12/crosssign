import { Suspense } from "react";
import { SuccessPage } from "@/components/verification/SuccessPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SuccessPage />
    </Suspense>
  );
}

import { Suspense } from "react";
import { ExplorerPage } from "@/components/explorer/ExplorerPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExplorerPage />
    </Suspense>
  );
}

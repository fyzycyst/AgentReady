import { Suspense } from "react";
import { ReportView } from "@/components/report/report-view";

export const metadata = { title: "Report — AgentReady" };

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-6 py-24 text-muted">Loading…</div>}>
      <ReportView />
    </Suspense>
  );
}

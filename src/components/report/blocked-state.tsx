import { SafeUrlChips } from "@/components/landing/safe-url-chips";
import { PanelRail } from "./panel-rail";

export function BlockedState({
  title,
  message,
  requestedUrl,
  status,
  evidence,
  code,
  fetchedAt,
}: {
  title: string;
  message: string;
  requestedUrl: string;
  status?: number;
  evidence?: string;
  code?: string;
  /** Absent for client-side failures, where no audit ever ran and there is no server timestamp to show. */
  fetchedAt?: string;
}) {
  const isSiteSide = code === "http-error" || code === "robots-disallow";
  return (
    <section className="panel p-8 md:p-12 rise">
      <PanelRail fetchedAt={fetchedAt} />
      <p className="eyebrow">{isSiteSide ? "No score · site declined" : "No score"}</p>
      <h1 className="display mt-3 text-3xl md:text-5xl font-semibold max-w-3xl wrap-anywhere">{title}</h1>
      <p className="mt-4 max-w-2xl text-muted">{message}</p>
      <p className="mt-4 font-mono text-xs text-faint wrap-anywhere">
        {requestedUrl}
        {status ? ` · HTTP ${status}` : ""}
      </p>
      {evidence && <pre className="snippet mt-4 max-w-2xl whitespace-pre-wrap">{evidence}</pre>}
      <div className="mt-8">
        <p className="text-sm text-faint mb-2">Try one that works:</p>
        <SafeUrlChips />
      </div>
    </section>
  );
}

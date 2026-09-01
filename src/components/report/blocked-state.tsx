import Link from "next/link";
import { SAFE_URLS } from "@/lib/safe-urls";
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
      <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-faint">Try one that works:</span>
        {SAFE_URLS.map((u) => (
          <Link key={u.url} href={`/report?url=${encodeURIComponent(u.url)}`} className="rounded-full border border-line px-3 py-1 text-muted hover:border-line-strong hover:text-text">
            {u.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

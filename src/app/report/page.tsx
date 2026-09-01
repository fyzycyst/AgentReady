/**
 * `/report` runs the audit on the server and ships a finished report.
 *
 * This is what makes the landing form's `GET /report?url=…` a real no-JavaScript
 * path: the response body already contains the score, the findings and the
 * remediation snippets, and the interactive parts of the report degrade to
 * native HTML (`<details>`/`<summary>`). With JavaScript the same markup
 * hydrates; only the gauge animation is lost without it.
 *
 * Deliberately NOT wrapped in a Suspense/`loading.tsx` boundary: React reveals
 * streamed Suspense content with an inline script, so a no-JS client would be
 * left looking at the fallback forever — exactly the bug this replaces. The
 * audit blocks the response instead.
 *
 * `POST /api/audit` is unchanged and stays the programmatic entry point; this
 * page applies the same `rateLimit` + `normaliseAuditUrl` boundary so a page
 * load cannot buy an audit the API would have refused.
 */
import { headers } from "next/headers";
import { ReportView, type InitialOutcome } from "@/components/report/report-view";
import { runAudit } from "@/lib/audit/orchestrator";
import { normaliseAuditUrl } from "@/lib/validation/audit-request";
import { rateLimit } from "@/lib/validation/rate-limit";

export const metadata = { title: "Report — AgentReady" };
/** An audit is a live observation; it is never served from a cache. */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function firstParam(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? (value[0] ?? "") : "";
}

/** Same envelope wording as `/api/audit`: user-facing text, no server detail. */
async function auditForPage(rawUrl: string): Promise<InitialOutcome> {
  const forwardedFor = (await headers()).get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "anon";
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return {
      kind: "error",
      title: "Slow down",
      message: `Too many audits from this address. Try again in ${limit.retryAfterSec} seconds.`,
    };
  }

  const validation = normaliseAuditUrl(rawUrl);
  if (!validation.ok) {
    return { kind: "error", title: "That doesn't look like a public web address", message: validation.message };
  }

  try {
    return { kind: "done", report: await runAudit(validation.url) };
  } catch (err) {
    // Redacted envelope (invariant 8); details stay server-side.
    console.error("report audit failed", err instanceof Error ? err.name : "unknown");
    return {
      kind: "error",
      title: "The audit couldn't be completed",
      message: "Something went wrong on our side. Try again in a moment.",
    };
  }
}

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const url = firstParam((await searchParams).url);
  if (!url) return <ReportView />;
  return <ReportView url={url} initial={await auditForPage(url)} />;
}

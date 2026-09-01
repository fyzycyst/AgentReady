import { createElement, type CSSProperties, type ReactNode } from "react";
import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { LAMP, stepState } from "@/components/report/agent-path";
import { runAudit, type Report } from "@/lib/audit/orchestrator";
import type { ScoreSummary } from "@/lib/audit/scoring";
import { normaliseAuditUrl } from "@/lib/validation/audit-request";
import { rateLimit } from "@/lib/validation/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE = { "cache-control": "no-store" };
const COLORS = { bg: "#0e1116", surface: "#161b23", line: "#364050", text: "#e8e6e1", muted: "#8b93a1", faint: "#5c6573", amber: "#f2b33d", mint: "#5dd39e", coral: "#f0665e" };

function node(type: string, style: CSSProperties, children?: ReactNode, key?: string) {
  return createElement(type, { style, key }, children);
}

function hostname(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.length > 60 ? `${host.slice(0, 59)}…` : host;
  } catch {
    return "audited site";
  }
}

function scoreColor(score: number | null): string {
  if (score === null) return COLORS.faint;
  return score >= 75 ? COLORS.mint : score >= 40 ? COLORS.amber : COLORS.coral;
}

export function opportunityLabel(overall: number | null, opportunity: number | null): string | null {
  if (overall === null || opportunity === null || opportunity <= overall) return null;
  return `+${opportunity - overall} WITH WEBMCP → ${opportunity}`;
}

function lamp(label: string, score: ScoreSummary, step: "find" | "understand" | "act") {
  const state = LAMP[stepState(score.categories.filter((category) => category.step === step))];
  const color = state.word === "clear" ? COLORS.mint : state.word === "friction" ? COLORS.amber : state.word === "blocked" ? COLORS.coral : COLORS.faint;
  return node(
    "div",
    { display: "flex", flexDirection: "column", gap: 10, width: 180 },
    [
      node("div", { display: "flex", alignItems: "center", gap: 10 }, [node("div", { width: 12, height: 12, borderRadius: 999, backgroundColor: color }), node("span", { color: COLORS.text, fontSize: 21, fontWeight: 600 }, label)]),
      node("span", { color, fontSize: 16, fontFamily: "monospace" }, state.word),
    ],
  );
}

function scoredCard(report: Extract<Report, { ok: true }>) {
  const { score } = report;
  const overall = score.overall;
  const opportunity = score.opportunity;
  const opportunityText = opportunityLabel(overall, opportunity);
  return node(
    "div",
    { width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 64px", backgroundColor: COLORS.bg, color: COLORS.text },
    [
      node("div", { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 24, borderBottom: `1px solid ${COLORS.line}` }, [
        node("span", { color: COLORS.text, fontSize: 25, fontWeight: 700, letterSpacing: -1 }, ["agent", node("span", { color: COLORS.amber }, "ready")]),
        node("span", { color: COLORS.muted, fontSize: 18, fontFamily: "monospace" }, `audited ${report.fetchedAt.slice(0, 10)}`),
      ]),
      node("div", { display: "flex", flex: 1, alignItems: "center", gap: 64 }, [
        node("div", { display: "flex", flexDirection: "column", width: 260, gap: 4 }, [
          node("span", { color: scoreColor(overall), fontSize: 148, lineHeight: 0.85, fontWeight: 700, letterSpacing: -8 }, overall === null ? "–" : String(overall)),
          node("span", { color: overall === null ? COLORS.faint : scoreColor(overall), fontSize: 30, fontFamily: "monospace" }, overall === null ? "NO SCORE" : `GRADE ${score.grade}`),
        ]),
        node("div", { display: "flex", flexDirection: "column", flex: 1, gap: 38 }, [
          node("div", { display: "flex", flexDirection: "column", gap: 8 }, [node("span", { color: COLORS.muted, fontSize: 16, fontFamily: "monospace", letterSpacing: 2 }, "REPORT FOR"), node("span", { color: COLORS.text, fontSize: 42, fontWeight: 650, letterSpacing: -1.5 }, hostname(report.finalUrl))]),
          node("div", { display: "flex", gap: 34 }, [lamp("Find", score, "find"), lamp("Understand", score, "understand"), lamp("Act", score, "act")]),
        ]),
      ]),
      node("div", { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 22, borderTop: `1px solid ${COLORS.line}` }, [
        node("span", { color: COLORS.muted, fontSize: 18, fontFamily: "monospace" }, `COVERAGE ${Math.round(score.coverage * 100)}%`),
        opportunityText
          ? node("span", { color: COLORS.amber, fontSize: 20, fontFamily: "monospace" }, opportunityText)
          : overall === null
            ? node("span", { color: COLORS.faint, fontSize: 18, fontFamily: "monospace" }, "AGENT-READINESS REPORT")
            : null,
      ]),
    ],
  );
}

function blockedCard(report: Extract<Report, { ok: false }>) {
  return node(
    "div",
    { width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 64px", backgroundColor: COLORS.bg, color: COLORS.text },
    [
      node("div", { display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 24, borderBottom: `1px solid ${COLORS.line}` }, [node("span", { color: COLORS.text, fontSize: 25, fontWeight: 700, letterSpacing: -1 }, ["agent", node("span", { color: COLORS.amber }, "ready")]), node("span", { color: COLORS.muted, fontSize: 18, fontFamily: "monospace" }, `audited ${report.fetchedAt.slice(0, 10)}`)]),
      node("div", { display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 22 }, [node("span", { color: COLORS.faint, fontSize: 30, fontFamily: "monospace", letterSpacing: 3 }, "NO SCORE"), node("span", { color: COLORS.text, fontSize: 58, fontWeight: 650, letterSpacing: -2 }, report.title)]),
      node("div", { display: "flex", paddingTop: 22, borderTop: `1px solid ${COLORS.line}` }, node("span", { color: COLORS.muted, fontSize: 18, fontFamily: "monospace" }, hostname(report.requestedUrl))),
    ],
  );
}

async function handle(rawUrl: unknown, req: NextRequest): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json({ ok: false, code: "rate-limited", title: "Slow down", message: "Too many audits from this address. Try again in a minute." }, { status: 429, headers: { ...NO_STORE, "retry-after": String(limit.retryAfterSec) } });
  }
  const validation = normaliseAuditUrl(rawUrl);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, code: "invalid-url", title: "That doesn't look like a public web address", message: validation.message }, { status: 400, headers: NO_STORE });
  }
  try {
    const report = await runAudit(validation.url);
    return new ImageResponse(report.ok ? scoredCard(report) : blockedCard(report), { width: 1200, height: 630, headers: NO_STORE });
  } catch (err) {
    console.error("card audit failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ ok: false, code: "internal", title: "The card couldn't be completed", message: "Something went wrong on our side. Try again in a moment." }, { status: 500, headers: NO_STORE });
  }
}

export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get("url"), req);
}

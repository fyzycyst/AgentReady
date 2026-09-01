/**
 * `/openapi.json` — the machine entry point advertised from the landing page's
 * `<link rel="service-desc">`.
 *
 * Hand-written rather than generated: it is small, it is the contract two
 * public routes already honour, and an agent that reads it should be able to
 * call `/api/audit` correctly on the first try. Schemas are summarised — the
 * full `Report` shape lives in `src/lib/audit/contract.ts` — but every property
 * named here is one the routes actually return.
 *
 * Keep in sync with `src/app/api/audit/route.ts` and `src/app/api/card/route.ts`.
 */
import { NextResponse } from "next/server";
import { CATEGORIES } from "@/lib/audit/weights";
import { discoverySiteOrigin } from "@/lib/site-origin";
import { MAX_URL_LENGTH } from "@/lib/validation/audit-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** RFC 6838 media type for an OpenAPI document, as advertised by the link tag. */
const OPENAPI_MEDIA_TYPE = "application/vnd.oai.openapi+json";

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

const auditUrlSchema = {
  type: "string",
  maxLength: MAX_URL_LENGTH,
  description:
    "Public http(s) URL to audit. A bare hostname is accepted and normalised to https://. Private, loopback and link-local addresses are rejected.",
  examples: ["https://example.com/", "example.com"],
} as const;

const errorSchema = {
  type: "object",
  required: ["ok", "code", "title", "message"],
  properties: {
    ok: { type: "boolean", enum: [false] },
    code: { type: "string", enum: ["invalid-url", "rate-limited", "internal"] },
    title: { type: "string" },
    message: { type: "string" },
  },
  description: "Redacted error envelope. Server-side detail is never included.",
} as const;

function document() {
  const origin = discoverySiteOrigin();
  return {
    openapi: "3.1.0",
    info: {
      title: "AgentReady API",
      version: "0.1.0-phase1",
      summary: "Audit a public web page for agent-readiness.",
      description:
        "Fetches one page plus its same-origin discovery files, runs six checks (agent discovery, machine-readable structure, access and renderability, form semantics, actionability, WebMCP capability) and returns a 0–100 score with findings and remediation snippets. robots.txt is honoured before the page is fetched; nothing is stored.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: origin }],
    paths: {
      "/api/audit": {
        post: {
          operationId: "auditSite",
          summary: "Audit a URL and return the full report.",
          description:
            "Rate limiting is best-effort: roughly 12 requests/min per client address per warm instance, not a global guarantee. The response is never cached.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: { url: auditUrlSchema },
                },
              },
            },
          },
          responses: {
            "200": {
              description:
                "The audit ran. `ok: true` carries a score; `ok: false` means the page could not be audited (robots.txt disallow, HTTP error, non-HTML) and is a result, not a failure.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Report" } } },
            },
            "400": {
              description: "The URL is missing, malformed, or not publicly reachable.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            "429": {
              description: "Rate limited. Retry after the number of seconds in the `retry-after` header.",
              headers: { "retry-after": { schema: { type: "integer" }, description: "Seconds to wait." } },
              content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            "500": {
              description: "The audit could not be completed.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
          },
        },
        get: {
          operationId: "auditSiteByQuery",
          summary: "Same as POST, with the URL in the query string.",
          parameters: [{ name: "url", in: "query", required: true, schema: auditUrlSchema }],
          responses: {
            "200": {
              description: "The audit ran.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Report" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "429": { $ref: "#/components/responses/RateLimited" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/card": {
        get: {
          operationId: "auditCard",
          summary: "Audit a URL and render the result as a 1200×630 PNG share card.",
          description:
            "Runs the same audit as /api/audit and returns an image instead of JSON. A page that could not be audited renders a 'no score' card, still with HTTP 200.",
          parameters: [{ name: "url", in: "query", required: true, schema: auditUrlSchema }],
          responses: {
            "200": {
              description: "The share card.",
              content: { "image/png": { schema: { type: "string", format: "binary" } } },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "429": { $ref: "#/components/responses/RateLimited" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
    },
    components: {
      responses: {
        BadRequest: {
          description: "The URL is missing, malformed, or not publicly reachable.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        RateLimited: {
          description: "Rate limited. Retry after the number of seconds in the `retry-after` header.",
          headers: { "retry-after": { schema: { type: "integer" }, description: "Seconds to wait." } },
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ServerError: {
          description: "The audit could not be completed.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      schemas: {
        Error: errorSchema,
        Report: {
          oneOf: [{ $ref: "#/components/schemas/AuditReport" }, { $ref: "#/components/schemas/BlockedReport" }],
          discriminator: { propertyName: "ok" },
        },
        AuditReport: {
          type: "object",
          required: ["ok", "requestedUrl", "finalUrl", "fetchedAt", "status", "score", "results", "version"],
          properties: {
            ok: { type: "boolean", enum: [true] },
            requestedUrl: { type: "string" },
            finalUrl: { type: "string", description: "After redirects; every hop is robots-checked before it is followed." },
            fetchedAt: { type: "string", format: "date-time" },
            status: { type: "integer" },
            score: { $ref: "#/components/schemas/ScoreSummary" },
            results: { type: "array", items: { $ref: "#/components/schemas/CheckResult" } },
            durationMs: { type: "integer" },
            version: { type: "string" },
          },
        },
        BlockedReport: {
          type: "object",
          required: ["ok", "requestedUrl", "fetchedAt", "code", "title", "message"],
          properties: {
            ok: { type: "boolean", enum: [false] },
            requestedUrl: { type: "string" },
            fetchedAt: { type: "string", format: "date-time" },
            code: {
              type: "string",
              enum: [
                "invalid-url",
                "blocked-address",
                "dns-failure",
                "too-many-redirects",
                "redirect-downgrade",
                "redirect-invalid",
                "timeout",
                "network",
                "content-type",
                "robots-disallow",
                "http-error",
                "not-html",
              ],
            },
            title: { type: "string" },
            message: { type: "string" },
            status: { type: "integer" },
            evidence: { type: "string" },
          },
          description: "No score: the page could not be read. `robots-disallow` means we obeyed robots.txt and never fetched it.",
        },
        ScoreSummary: {
          type: "object",
          required: ["overall", "grade", "coverage", "categories"],
          properties: {
            overall: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            grade: { type: ["string", "null"], enum: ["A", "B", "C", "D", "F", null] },
            coverage: { type: "number", minimum: 0, maximum: 1, description: "Fraction of applicable weight actually observed." },
            survival: { type: ["integer", "null"], description: "Headline excluding the WebMCP layer." },
            superpower: { type: ["integer", "null"], description: "WebMCP capability score." },
            opportunity: { type: ["integer", "null"], description: "Headline recomputed with WebMCP at 100." },
            categories: { type: "array", items: { $ref: "#/components/schemas/CategoryScore" } },
          },
        },
        CategoryScore: {
          type: "object",
          required: ["id", "label", "weight", "score", "applicable"],
          properties: {
            id: { type: "string", enum: CATEGORY_IDS },
            label: { type: "string" },
            weight: { type: "integer", description: "Rubric weight; the six weights sum to 100." },
            effectiveWeight: { type: "number", description: "Weight after redistributing inapplicable categories." },
            score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
            applicable: { type: "boolean", description: "false when the category has no signals on this page." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            summary: { type: "string" },
            step: { type: "string", enum: ["find", "understand", "act"] },
            layer: { type: "string", enum: ["survival", "superpower"] },
          },
        },
        CheckResult: {
          type: "object",
          required: ["checkId", "category", "applicable", "score", "findings", "summary"],
          properties: {
            checkId: { type: "string" },
            category: { type: "string", enum: CATEGORY_IDS },
            applicable: { type: "boolean" },
            score: { type: ["integer", "null"], minimum: 0, maximum: 100, description: "null means not observed, never zero." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            summary: { type: "string" },
            findings: { type: "array", items: { $ref: "#/components/schemas/Finding" } },
          },
        },
        Finding: {
          type: "object",
          required: ["id", "severity", "title", "detail", "evidence"],
          properties: {
            id: { type: "string", description: "Stable identifier, e.g. structure.jsonld.missing." },
            severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"] },
            title: { type: "string" },
            detail: { type: "string" },
            positive: { type: "boolean", description: "true when the finding is something the page already does right." },
            evidence: {
              type: "array",
              items: {
                type: "object",
                required: ["source", "summary"],
                properties: {
                  source: {
                    type: "string",
                    enum: ["raw-html", "rendered-html", "response-header", "robots.txt", "sitemap.xml", "llms.txt", "well-known", "linked-resource"],
                  },
                  summary: { type: "string" },
                  path: { type: "string", description: "Element locator, e.g. form#contact > input[2]. Not executable." },
                  excerpt: { type: "string" },
                },
              },
            },
            remediation: {
              type: "object",
              required: ["summary", "rationale"],
              properties: {
                summary: { type: "string" },
                rationale: { type: "string" },
                snippet: { type: "string", description: "Paste-ready fix, generated from this page where possible." },
                language: { type: "string", enum: ["html", "ts", "json", "text"] },
                docsUrl: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
    },
  };
}

export function GET() {
  return NextResponse.json(document(), {
    headers: {
      "content-type": `${OPENAPI_MEDIA_TYPE}; charset=utf-8`,
      "cache-control": "public, max-age=3600",
    },
  });
}

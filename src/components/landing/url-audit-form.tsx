"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { AUDIT_SITE_TOOL } from "@/lib/webmcp/audit-site-tool";
import type { WebMcpControlProps, WebMcpFormProps } from "@/types/webmcp";

/**
 * The audit form is three things at once, and they must not drift apart:
 *   - a plain `GET /report?url=…` form, so it works with JavaScript off;
 *   - a declarative WebMCP tool (`toolname`/`tooldescription`), so an agent can
 *     call it without reverse-engineering the markup;
 *   - a client-routed form, so a normal visitor gets a soft navigation.
 *
 * The tool name and description are shared with the imperative `audit_site`
 * registration in `@/lib/webmcp/audit-site-tool` — one action, one name.
 */
export function UrlAuditForm({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  // `/report` audits on the server, so the navigation lasts as long as the
  // audit. Without this the button would look inert for several seconds.
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) {
      setError("Enter a web address to audit.");
      return;
    }
    if (/\s/.test(v)) {
      setError("Web addresses can't contain spaces.");
      return;
    }
    setError(null);
    startTransition(() => router.push(`/report?url=${encodeURIComponent(v)}`));
  }

  return (
    <form
      action="/report"
      method="get"
      onSubmit={submit}
      className="w-full"
      // Scheme-less input ("yourcompany.com") is normalised server-side, so the
      // browser must not reject it against type="url" before we get there.
      noValidate
      {...({
        toolname: AUDIT_SITE_TOOL.name,
        tooldescription: AUDIT_SITE_TOOL.description,
      } satisfies WebMcpFormProps)}
    >
      <div
        className={`flex items-stretch rounded-xl border border-line-strong bg-bg-elev shadow-[0_0_0_1px_rgba(242,179,61,0.0)] focus-within:shadow-[0_0_0_3px_rgba(242,179,61,0.18)] focus-within:border-signal transition-shadow ${
          compact ? "" : "text-lg"
        }`}
      >
        <label htmlFor="url" className="sr-only">
          Web address to audit
        </label>
        <span className={`hidden sm:flex items-center pl-4 font-mono text-faint ${compact ? "text-xs" : "text-sm"}`}>https://</span>
        <input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          required
          placeholder="yourcompany.com"
          {...({
            toolparamdescription: AUDIT_SITE_TOOL.inputSchema.properties.url.description,
          } satisfies WebMcpControlProps)}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`flex-1 min-w-0 bg-transparent px-3 sm:px-2 font-mono text-text placeholder:text-faint outline-none ${compact ? "py-2.5 text-sm" : "py-4"}`}
        />
        <button
          type="submit"
          // `undefined` rather than `false`: the served HTML must be identical
          // to the pre-transition markup an agent (and our own audit) reads.
          disabled={pending || undefined}
          aria-busy={pending || undefined}
          className={`m-1.5 rounded-lg bg-signal px-5 font-semibold text-[#1a1305] hover:bg-[#ffc44f] active:translate-y-px transition disabled:opacity-70 ${compact ? "text-sm" : ""}`}
        >
          {pending ? "Auditing…" : "Audit"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-fail">
          {error}
        </p>
      )}
    </form>
  );
}

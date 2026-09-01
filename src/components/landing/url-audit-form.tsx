"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function UrlAuditForm({ initial = "", compact = false }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

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
    router.push(`/report?url=${encodeURIComponent(v)}`);
  }

  return (
    <form onSubmit={submit} className="w-full" noValidate>
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
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="yourcompany.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`flex-1 min-w-0 bg-transparent px-3 sm:px-2 font-mono text-text placeholder:text-faint outline-none ${compact ? "py-2.5 text-sm" : "py-4"}`}
        />
        <button
          type="submit"
          className={`m-1.5 rounded-lg bg-signal px-5 font-semibold text-[#1a1305] hover:bg-[#ffc44f] active:translate-y-px transition ${compact ? "text-sm" : ""}`}
        >
          Audit
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

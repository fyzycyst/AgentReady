"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { SAFE_URLS } from "@/lib/safe-urls";

function auditHref(origin: string, url: string): string {
  const absolute = url.startsWith("/") ? `${origin}${url}` : url;
  return `/report?url=${encodeURIComponent(absolute)}`;
}

function useWindowOrigin(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null,
  );
}

function useIsLocalDevHost(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const host = window.location.hostname;
      return host === "localhost" || host === "127.0.0.1";
    },
    () => false,
  );
}

export function SafeUrlChips() {
  const origin = useWindowOrigin();
  const isLocal = useIsLocalDevHost();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-faint">Try one:</span>
        {SAFE_URLS.map((entry) => {
          const href =
            entry.url.startsWith("/") && !origin
              ? undefined
              : origin
                ? auditHref(origin, entry.url)
                : `/report?url=${encodeURIComponent(entry.url)}`;

          if (!href) {
            return (
              <span key={entry.url} className="rounded-full border border-line px-3 py-1 text-muted">
                {entry.label}
              </span>
            );
          }

          return (
            <Link
              key={entry.url}
              href={href}
              className="rounded-full border border-line px-3 py-1 text-muted hover:border-line-strong hover:text-text transition-colors"
            >
              {entry.label}
            </Link>
          );
        })}
      </div>
      {isLocal && (
        <p className="mt-2 text-xs text-faint">
          First-party demo chips audit via localhost and will show as blocked locally — deploy or use a tunnel to score them.
        </p>
      )}
    </>
  );
}

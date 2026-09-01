"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function DemoAuditPanel() {
  const router = useRouter();

  return (
    <aside className="card p-5 mt-8 border-signal/30 bg-surface-2/50">
      <p className="text-sm text-muted">
        This page declares <strong className="text-text font-medium">2 WebMCP tools</strong> — one declarative
        reservation form and one imperative availability check.
      </p>
      <Link
        href="/report"
        // `/report` audits on the server; prefetching it would run one from an
        // idle page. The real destination is built in onClick anyway.
        prefetch={false}
        className="mt-3 inline-flex text-sm text-signal hover:text-signal-dim transition-colors"
        onClick={(e) => {
          e.preventDefault();
          const url = `${window.location.origin}/demo`;
          router.push(`/report?url=${encodeURIComponent(url)}`);
        }}
      >
        Audit it →
      </Link>
    </aside>
  );
}

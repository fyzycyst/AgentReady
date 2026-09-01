"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-md border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted hover:text-text hover:border-signal transition-colors"
      aria-live="polite"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

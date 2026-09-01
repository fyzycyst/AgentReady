"use client";

import { useState } from "react";

/**
 * `text` may be a thunk so callers can copy something only known at click time
 * (the current URL), without an effect or a hydration mismatch.
 */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  text: string | (() => string);
  label?: string;
  copiedLabel?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className="rounded-md border border-line-strong bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted hover:text-text hover:border-signal transition-colors"
      aria-live="polite"
    >
      {done ? copiedLabel : label}
    </button>
  );
}

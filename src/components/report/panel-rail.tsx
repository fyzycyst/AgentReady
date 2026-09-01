/**
 * The nameplate at the top of a result panel: wordmark on the left, audit date
 * on the right. Its job is to make the panel self-identifying when it is
 * screenshotted on its own, so it lives inside the panel, not in the page chrome.
 *
 * The date is the UTC calendar day sliced straight off the server's ISO
 * timestamp — no locale formatting, so server and client render the same text.
 */
export function PanelRail({ fetchedAt }: { fetchedAt?: string }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 border-b border-line pb-3">
      <span className="font-mono text-sm tracking-wide text-text">
        agent<span className="text-signal">ready</span>
      </span>
      {fetchedAt && <span className="eyebrow shrink-0">audited {fetchedAt.slice(0, 10)}</span>}
    </div>
  );
}

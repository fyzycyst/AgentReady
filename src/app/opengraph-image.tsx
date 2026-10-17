import { ImageResponse } from "next/og";

/**
 * The link-preview image for the site (og:image; X falls back to it for
 * twitter:image). Static and generated at build time. It mirrors the landing
 * hero in the share card's palette, so a shared link looks like the page it
 * opens. Per-report previews stay with /api/card.
 */
export const alt = "AgentReady — Your site works for humans. Can an agent finish the job?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = { bg: "#0e1116", line: "#364050", text: "#e8e6e1", muted: "#8b93a1", amber: "#f2b33d", mint: "#5dd39e" };

const STEPS = ["Find", "Understand", "Act"];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          backgroundColor: COLORS.bg,
          color: COLORS.text,
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontFamily: "monospace", letterSpacing: 1 }}>
          <span>agent</span>
          <span style={{ color: COLORS.amber }}>ready</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>
            Your site works for humans.
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, color: COLORS.amber }}>
            Can an agent finish the job?
          </div>
          <div style={{ marginTop: 32, fontSize: 30, color: COLORS.muted }}>
            Paste any public URL: a 0–100 score, where agents get stuck, and the fix.
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, borderTop: `1px solid ${COLORS.line}`, paddingTop: 28 }}>
          {STEPS.map((step) => (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24 }}>
              <div style={{ width: 14, height: 14, borderRadius: 999, backgroundColor: COLORS.mint }} />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

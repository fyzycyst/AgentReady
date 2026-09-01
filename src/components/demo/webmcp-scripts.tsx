"use client";

import Script from "next/script";

/** @mcp-b/webmcp-polyfill@5.1.0 — sha384 from: curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A */
const POLYFILL_URL = "https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js";
const POLYFILL_INTEGRITY = "sha384-ZLqD1afbu2b2LJVDDqBf95wR/DGWh5FT1bx6E2S+4uMPdMOc8QGIIfw2gBWLKIB2";

async function registerAvailabilityTool() {
  const mc = document.modelContext;
  if (!mc?.registerTool) return;

  await mc.registerTool(
    {
      name: "check_availability",
      description: "Check whether Le Petit Bistro has open tables for a given date, time, and party size.",
      title: "Check table availability",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Reservation date (YYYY-MM-DD)" },
          time: { type: "string", description: "Preferred time (HH:MM, 24-hour)" },
          party_size: { type: "integer", description: "Number of guests", minimum: 1, maximum: 12 },
        },
        required: ["date", "time", "party_size"],
      },
      annotations: { readOnlyHint: true },
      execute: async (input: Record<string, unknown>) => {
        const date = String(input.date ?? "");
        const time = String(input.time ?? "");
        const size = Number(input.party_size ?? 0);
        if (!date || !time || size < 1) return "Please provide date, time, and party size.";
        const slots = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
        const open = slots.includes(time) && size <= 8;
        return open
          ? `Tables available for ${size} on ${date} at ${time}.`
          : `No tables for ${size} on ${date} at ${time}. Try 19:00 or 20:00.`;
      },
    },
    {},
  );
}

export function WebMcpScripts() {
  return (
    <>
      <Script
        src={POLYFILL_URL}
        integrity={POLYFILL_INTEGRITY}
        crossOrigin="anonymous"
        strategy="afterInteractive"
        onLoad={() => {
          void registerAvailabilityTool();
        }}
      />
    </>
  );
}

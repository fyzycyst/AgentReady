"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { registerAvailabilityTool } from "@/lib/demo/register-availability-tool";

/** @mcp-b/webmcp-polyfill@5.1.0 — sha384 from: curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A */
const POLYFILL_URL = "https://unpkg.com/@mcp-b/webmcp-polyfill@5.1.0/dist/index.iife.js";
const POLYFILL_INTEGRITY = "sha384-ZLqD1afbu2b2LJVDDqBf95wR/DGWh5FT1bx6E2S+4uMPdMOc8QGIIfw2gBWLKIB2";

export function WebMcpScripts() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    controllerRef.current = ac;

    const register = () => {
      void registerAvailabilityTool(ac.signal).catch((err: unknown) => {
        if (ac.signal.aborted) return;
        console.error("WebMCP check_availability registration failed", err);
      });
    };

    // Remount path: polyfill may already be on the page after client navigation back to /demo.
    if (document.modelContext?.registerTool) register();

    const onPageHide = () => ac.abort();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      ac.abort();
      controllerRef.current = null;
    };
  }, []);

  return (
    <Script
      src={POLYFILL_URL}
      integrity={POLYFILL_INTEGRITY}
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        const ac = controllerRef.current;
        if (!ac || ac.signal.aborted) return;
        void registerAvailabilityTool(ac.signal).catch((err: unknown) => {
          if (ac.signal.aborted) return;
          console.error("WebMCP check_availability registration failed", err);
        });
      }}
    />
  );
}

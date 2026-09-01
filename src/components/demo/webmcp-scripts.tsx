"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { registerAvailabilityTool } from "@/lib/demo/register-availability-tool";
import { POLYFILL_INTEGRITY, POLYFILL_URL } from "@/lib/webmcp/polyfill";

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

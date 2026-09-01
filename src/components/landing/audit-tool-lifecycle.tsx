"use client";

import { useEffect } from "react";
import { bindAuditToolLifecycle } from "@/lib/webmcp/audit-site-tool";

/**
 * Scopes the inline `audit_site` registration to the landing page.
 *
 * The inline script cannot see a client-side navigation — `router.push()` to
 * `/report` leaves the document intact, so `pagehide` never fires. This
 * component's unmount aborts the registration, and its mount re-registers when
 * the user comes back to `/`. Renders nothing.
 */
export function AuditToolLifecycle() {
  useEffect(bindAuditToolLifecycle, []);
  return null;
}

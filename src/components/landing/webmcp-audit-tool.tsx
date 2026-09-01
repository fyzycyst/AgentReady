import { AuditToolLifecycle } from "@/components/landing/audit-tool-lifecycle";
import { AUDIT_SITE_TOOL_SCRIPT } from "@/lib/webmcp/audit-site-tool-script";
import { POLYFILL_INTEGRITY, POLYFILL_SCRIPT_ID, POLYFILL_URL } from "@/lib/webmcp/polyfill";

/**
 * The `audit_site` WebMCP tool on the landing page: the SRI-pinned polyfill,
 * the inline registration from `@/lib/webmcp/audit-site-tool-script`, and the
 * client component that scopes it to this route.
 *
 * Both tags are plain elements rather than `next/script`, because both have to
 * be in the *served HTML*: `next/script`'s `afterInteractive` strategy injects
 * the tag from the client bundle, which is invisible to an agent (or to our own
 * auditor) reading the response. Renders nothing visible.
 */
export function WebMcpAuditTool() {
  return (
    <>
      <script
        id={POLYFILL_SCRIPT_ID}
        src={POLYFILL_URL}
        integrity={POLYFILL_INTEGRITY}
        crossOrigin="anonymous"
        async
      />
      <script dangerouslySetInnerHTML={{ __html: AUDIT_SITE_TOOL_SCRIPT }} />
      <AuditToolLifecycle />
    </>
  );
}

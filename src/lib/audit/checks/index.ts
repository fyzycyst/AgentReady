/**
 * Check registry. Order is presentation order within the report.
 * Phase 1: discovery + structure. Phase 2 adds access, forms, actionability.
 * Phase 3 adds webmcp.
 */
import type { AuditCheck } from "../contract";
import { agentDiscoveryCheck } from "./agent-discovery";
import { formSemanticsCheck } from "./form-semantics";
import { machineReadableStructureCheck } from "./machine-readable-structure";

export const CHECKS: readonly AuditCheck[] = [agentDiscoveryCheck, machineReadableStructureCheck, formSemanticsCheck];

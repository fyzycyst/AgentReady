/**
 * Check registry. Order is presentation order within the report and matches
 * weights.ts. Phase 1: discovery + structure. Phase 2: access, forms,
 * actionability. Phase 3 adds webmcp.
 */
import type { AuditCheck } from "../contract";
import { agentDiscoveryCheck } from "./agent-discovery";
import { machineReadableStructureCheck } from "./machine-readable-structure";
import { accessRenderabilityCheck } from "./access-renderability";
import { formSemanticsCheck } from "./form-semantics";
import { actionabilityCheck } from "./actionability";

export const CHECKS: readonly AuditCheck[] = [
  agentDiscoveryCheck,
  machineReadableStructureCheck,
  accessRenderabilityCheck,
  formSemanticsCheck,
  actionabilityCheck,
];

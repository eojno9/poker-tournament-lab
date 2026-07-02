import type {
  HrcCopiedDbRehearsalPlan,
  HrcCopiedDbRehearsalPlanStatus,
  HrcCopiedDbRehearsalPlanStep
} from "./hrcCopiedDbRehearsalPlanBuilder.js";

export interface HrcCopiedDbRehearsalReportCounts {
  previewRows: number;
  importPreviewAllowed: number;
  blockedCount: number;
  duplicateExistingDbCount: number;
  duplicateInBatchCount: number;
  missingCanonicalKeyCount: number;
}

export interface HrcCopiedDbRehearsalReportShaSummary {
  originalDbShaBefore: string;
  originalDbShaAfter: string;
  copiedDbShaBefore: string;
  copiedDbShaAfter?: string;
  rollbackDbSha?: string;
}

export interface HrcCopiedDbRehearsalReportSafetySummary {
  privacyScanPassed: boolean;
  rawZipAbsent: boolean;
  artifactReportsAbsent: boolean;
  productRouteDisconnected: boolean;
  apiUiRuntimeUnchanged: boolean;
}

export interface HrcCopiedDbRehearsalReportExecutionSummary {
  actualDbCopyPerformed: boolean;
  actualDbWritePerformed: boolean;
  reportJsonWritten: boolean;
}

export interface HrcCopiedDbRehearsalReportInput {
  rehearsalId: string;
  plan: Pick<
    HrcCopiedDbRehearsalPlan,
    | "status"
    | "dryRunOnly"
    | "copiedDbWriteRehearsalAllowed"
    | "productionDbWriteAllowed"
    | "reportFileWriteAllowed"
    | "steps"
    | "blockedReasons"
    | "warnings"
    | "requiredNextChecks"
  >;
  counts: HrcCopiedDbRehearsalReportCounts;
  shaSummary: HrcCopiedDbRehearsalReportShaSummary;
  safetySummary: HrcCopiedDbRehearsalReportSafetySummary;
  executionSummary: HrcCopiedDbRehearsalReportExecutionSummary;
}

export interface HrcCopiedDbRehearsalReportDecision {
  canDryRun: boolean;
  canCopiedDbWriteRehearsal: boolean;
  canProductionDbWrite: false;
  canWriteReportFile: false;
}

export type HrcCopiedDbRehearsalReportExitCode = 0 | 1 | 2 | 3 | 4;

export interface HrcCopiedDbRehearsalReport {
  reportVersion: "v3.1-copied-db-rehearsal-report-preview";
  rehearsalId: string;
  status: HrcCopiedDbRehearsalPlanStatus;
  decision: HrcCopiedDbRehearsalReportDecision;
  counts: HrcCopiedDbRehearsalReportCounts;
  shaSummary: HrcCopiedDbRehearsalReportShaSummary;
  safetySummary: HrcCopiedDbRehearsalReportSafetySummary;
  executionSummary: HrcCopiedDbRehearsalReportExecutionSummary;
  steps: HrcCopiedDbRehearsalPlanStep[];
  blockedReasons: string[];
  warnings: string[];
  requiredNextChecks: string[];
  exitCode: HrcCopiedDbRehearsalReportExitCode;
}

export function buildHrcCopiedDbRehearsalReport(
  input: HrcCopiedDbRehearsalReportInput
): HrcCopiedDbRehearsalReport {
  const blockedReasons = buildBlockedReasons(input).map(redactHrcCopiedDbRehearsalReportPrivateTokens);
  const warnings = buildWarnings(input).map(redactHrcCopiedDbRehearsalReportPrivateTokens);
  const status: HrcCopiedDbRehearsalPlanStatus = blockedReasons.length > 0 ? "BLOCKED" : input.plan.status;
  const exitCode = getExitCode(input, blockedReasons);

  return {
    reportVersion: "v3.1-copied-db-rehearsal-report-preview",
    rehearsalId: redactHrcCopiedDbRehearsalReportPrivateTokens(input.rehearsalId),
    status,
    decision: {
      canDryRun: status !== "BLOCKED" && (input.plan.dryRunOnly || input.plan.copiedDbWriteRehearsalAllowed),
      canCopiedDbWriteRehearsal: status === "READY_FOR_COPIED_DB_WRITE_REHEARSAL",
      canProductionDbWrite: false,
      canWriteReportFile: false
    },
    counts: sanitizeCounts(input.counts),
    shaSummary: sanitizeShaSummary(input.shaSummary),
    safetySummary: { ...input.safetySummary },
    executionSummary: { ...input.executionSummary },
    steps: [...input.plan.steps],
    blockedReasons,
    warnings,
    requiredNextChecks: buildRequiredNextChecks(input, status, blockedReasons).map(
      redactHrcCopiedDbRehearsalReportPrivateTokens
    ),
    exitCode
  };
}

export function summarizeHrcCopiedDbRehearsalReport(report: HrcCopiedDbRehearsalReport) {
  return {
    reportVersion: report.reportVersion,
    rehearsalId: report.rehearsalId,
    status: report.status,
    exitCode: report.exitCode,
    canDryRun: report.decision.canDryRun,
    canCopiedDbWriteRehearsal: report.decision.canCopiedDbWriteRehearsal,
    canProductionDbWrite: false,
    canWriteReportFile: false,
    previewRows: report.counts.previewRows,
    importPreviewAllowed: report.counts.importPreviewAllowed,
    blockedCount: report.counts.blockedCount,
    blockedReasonCount: report.blockedReasons.length,
    warningCount: report.warnings.length,
    requiredNextCheckCount: report.requiredNextChecks.length
  };
}

export function assertNoHrcCopiedDbRehearsalReportForbiddenExposure(
  report: HrcCopiedDbRehearsalReport
): boolean {
  return !containsHrcCopiedDbRehearsalReportForbiddenToken(JSON.stringify(report));
}

function buildBlockedReasons(input: HrcCopiedDbRehearsalReportInput): string[] {
  const blockedReasons = [...input.plan.blockedReasons];

  if (input.plan.status === "BLOCKED") {
    blockedReasons.push("plan status is BLOCKED");
  }
  if (input.plan.productionDbWriteAllowed) {
    blockedReasons.push("production DB write is forbidden");
  }
  if (input.plan.reportFileWriteAllowed) {
    blockedReasons.push("report file write is disabled for this planning step");
  }
  if (input.executionSummary.actualDbCopyPerformed) {
    blockedReasons.push("actual DB copy was performed but is forbidden in this report-shape step");
  }
  if (input.executionSummary.actualDbWritePerformed) {
    blockedReasons.push("actual DB write was performed but is forbidden");
  }
  if (input.executionSummary.reportJsonWritten) {
    blockedReasons.push("report JSON was written but file output is forbidden");
  }
  if (input.shaSummary.originalDbShaBefore.trim().length === 0 || input.shaSummary.originalDbShaAfter.trim().length === 0) {
    blockedReasons.push("original DB SHA before and after must be present");
  } else if (input.shaSummary.originalDbShaBefore !== input.shaSummary.originalDbShaAfter) {
    blockedReasons.push("original DB SHA before and after must match");
  }
  if (!input.safetySummary.privacyScanPassed) {
    blockedReasons.push("privacy/path scan failed");
  }
  if (!input.safetySummary.rawZipAbsent) {
    blockedReasons.push("raw zip absence check failed");
  }
  if (!input.safetySummary.artifactReportsAbsent) {
    blockedReasons.push("artifact report absence check failed");
  }
  if (!input.safetySummary.productRouteDisconnected) {
    blockedReasons.push("product import route must remain disconnected");
  }
  if (!input.safetySummary.apiUiRuntimeUnchanged) {
    blockedReasons.push("API/UI runtime must remain unchanged");
  }
  if (input.counts.blockedCount > 0) {
    blockedReasons.push("validation blocked count must be zero");
  }
  if (hasInvalidCount(input.counts)) {
    blockedReasons.push("report counts must be finite non-negative numbers");
  }

  return dedupe(blockedReasons);
}

function buildWarnings(input: HrcCopiedDbRehearsalReportInput): string[] {
  const warnings = [...input.plan.warnings];

  if (input.counts.importPreviewAllowed === 0) {
    warnings.push("import preview allowed count is zero");
  }
  if (typeof input.shaSummary.copiedDbShaAfter === "string" && input.shaSummary.copiedDbShaAfter !== input.shaSummary.copiedDbShaBefore) {
    warnings.push("copied DB SHA changed in report input");
  }
  if (typeof input.shaSummary.rollbackDbSha === "string" && input.shaSummary.rollbackDbSha !== input.shaSummary.copiedDbShaBefore) {
    warnings.push("rollback DB SHA does not match copied DB baseline");
  }

  return dedupe(warnings);
}

function buildRequiredNextChecks(
  input: HrcCopiedDbRehearsalReportInput,
  status: HrcCopiedDbRehearsalPlanStatus,
  blockedReasons: string[]
): string[] {
  if (blockedReasons.length > 0) {
    return ["resolve report blocked reasons before copied DB rehearsal", ...input.plan.requiredNextChecks];
  }

  if (status === "READY_FOR_COPIED_DB_WRITE_REHEARSAL") {
    return [
      ...input.plan.requiredNextChecks,
      "keep report output in memory unless file writing is separately approved",
      "verify rollback before any release decision"
    ];
  }

  if (status === "READY_FOR_DRY_RUN") {
    return [...input.plan.requiredNextChecks, "record dry-run summary without writing report JSON"];
  }

  return input.plan.requiredNextChecks;
}

function getExitCode(
  input: HrcCopiedDbRehearsalReportInput,
  blockedReasons: string[]
): HrcCopiedDbRehearsalReportExitCode {
  if (hasInvalidCount(input.counts)) {
    return 4;
  }
  if (!input.safetySummary.privacyScanPassed) {
    return 3;
  }
  if (
    input.executionSummary.actualDbCopyPerformed ||
    input.executionSummary.actualDbWritePerformed ||
    input.executionSummary.reportJsonWritten ||
    !input.safetySummary.rawZipAbsent ||
    !input.safetySummary.artifactReportsAbsent ||
    !input.safetySummary.productRouteDisconnected ||
    !input.safetySummary.apiUiRuntimeUnchanged ||
    input.shaSummary.originalDbShaBefore !== input.shaSummary.originalDbShaAfter
  ) {
    return 2;
  }
  if (blockedReasons.length > 0 || input.plan.status === "BLOCKED") {
    return 1;
  }

  return 0;
}

function sanitizeCounts(counts: HrcCopiedDbRehearsalReportCounts): HrcCopiedDbRehearsalReportCounts {
  return {
    previewRows: sanitizeCount(counts.previewRows),
    importPreviewAllowed: sanitizeCount(counts.importPreviewAllowed),
    blockedCount: sanitizeCount(counts.blockedCount),
    duplicateExistingDbCount: sanitizeCount(counts.duplicateExistingDbCount),
    duplicateInBatchCount: sanitizeCount(counts.duplicateInBatchCount),
    missingCanonicalKeyCount: sanitizeCount(counts.missingCanonicalKeyCount)
  };
}

function sanitizeCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function sanitizeShaSummary(
  shaSummary: HrcCopiedDbRehearsalReportShaSummary
): HrcCopiedDbRehearsalReportShaSummary {
  const sanitized: HrcCopiedDbRehearsalReportShaSummary = {
    originalDbShaBefore: redactHrcCopiedDbRehearsalReportPrivateTokens(shaSummary.originalDbShaBefore),
    originalDbShaAfter: redactHrcCopiedDbRehearsalReportPrivateTokens(shaSummary.originalDbShaAfter),
    copiedDbShaBefore: redactHrcCopiedDbRehearsalReportPrivateTokens(shaSummary.copiedDbShaBefore)
  };

  if (typeof shaSummary.copiedDbShaAfter === "string") {
    sanitized.copiedDbShaAfter = redactHrcCopiedDbRehearsalReportPrivateTokens(shaSummary.copiedDbShaAfter);
  }
  if (typeof shaSummary.rollbackDbSha === "string") {
    sanitized.rollbackDbSha = redactHrcCopiedDbRehearsalReportPrivateTokens(shaSummary.rollbackDbSha);
  }

  return sanitized;
}

function hasInvalidCount(counts: HrcCopiedDbRehearsalReportCounts): boolean {
  return Object.values(counts).some((value) => !Number.isFinite(value) || value < 0);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function redactHrcCopiedDbRehearsalReportPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

function containsHrcCopiedDbRehearsalReportForbiddenToken(value: string): boolean {
  return /C:\\Users|sample-user|sample-private-token|@privaterelay\.appleid\.com|sample-external-hrc-folder|raw hrc/i.test(
    value
  );
}

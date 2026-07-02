import type { HrcCopiedDbRehearsalDryRunResult } from "./hrcCopiedDbRehearsalDryRunOrchestrator.js";

export interface HrcCopiedDbRehearsalCommandOutputRenderInput {
  dryRunResult: HrcCopiedDbRehearsalDryRunResult;
  includeWarnings?: boolean;
  includeRequiredNextChecks?: boolean;
}

export interface HrcCopiedDbRehearsalCommandOutputRenderResult {
  lines: string[];
  text: string;
  lineCount: number;
  status: HrcCopiedDbRehearsalDryRunResult["report"]["status"];
  exitCode: HrcCopiedDbRehearsalDryRunResult["report"]["exitCode"];
  hasWarnings: boolean;
  forbiddenExposureDetected: boolean;
  warnings: string[];
}

export interface HrcCopiedDbRehearsalCommandOutputExposureAssertion {
  pass: boolean;
  warnings: string[];
}

export function renderHrcCopiedDbRehearsalCommandOutputLines(
  input: HrcCopiedDbRehearsalCommandOutputRenderInput
): string[] {
  return renderHrcCopiedDbRehearsalCommandOutput(input).lines;
}

export function renderHrcCopiedDbRehearsalCommandOutputText(
  input: HrcCopiedDbRehearsalCommandOutputRenderInput
): string {
  return renderHrcCopiedDbRehearsalCommandOutput(input).text;
}

export function renderHrcCopiedDbRehearsalCommandOutput(
  input: HrcCopiedDbRehearsalCommandOutputRenderInput
): HrcCopiedDbRehearsalCommandOutputRenderResult {
  const includeWarnings = input.includeWarnings ?? true;
  const includeRequiredNextChecks = input.includeRequiredNextChecks ?? true;
  const rawLines = buildRawLines({
    result: input.dryRunResult,
    includeWarnings,
    includeRequiredNextChecks
  });
  const rawText = rawLines.join("\n");
  const forbiddenExposureDetected = containsForbiddenOutputToken(rawText);
  const rendererWarnings = forbiddenExposureDetected
    ? ["forbidden exposure redacted from copied DB rehearsal command output"]
    : [];
  const lines = rawLines.map(redactPrivateTokens);
  const text = lines.join("\n");
  const reportWarnings = includeWarnings ? input.dryRunResult.report.warnings.length : 0;
  const planWarnings = includeWarnings ? input.dryRunResult.plan.warnings.length : 0;
  const guardWarnings = includeWarnings ? input.dryRunResult.guard.warnings.length : 0;

  return {
    lines,
    text,
    lineCount: lines.length,
    status: input.dryRunResult.report.status,
    exitCode: input.dryRunResult.report.exitCode,
    hasWarnings: reportWarnings + planWarnings + guardWarnings + rendererWarnings.length > 0,
    forbiddenExposureDetected,
    warnings: rendererWarnings
  };
}

export function assertNoHrcCopiedDbRehearsalCommandOutputForbiddenExposure(
  result: HrcCopiedDbRehearsalCommandOutputRenderResult
): HrcCopiedDbRehearsalCommandOutputExposureAssertion {
  const warnings = [...result.warnings];

  if (containsForbiddenOutputToken(result.text)) {
    warnings.push("forbidden exposure remains in rendered copied DB rehearsal output");
  }

  return {
    pass: warnings.length === 0,
    warnings
  };
}

function buildRawLines(input: {
  result: HrcCopiedDbRehearsalDryRunResult;
  includeWarnings: boolean;
  includeRequiredNextChecks: boolean;
}): string[] {
  const { result, includeWarnings, includeRequiredNextChecks } = input;
  const report = result.report;
  const plan = result.plan;
  const lines: string[] = [
    "HRC Copied DB Rehearsal Preview",
    `Rehearsal ID: ${result.rehearsalId}`,
    `Status: ${report.status}`,
    `Exit Code: ${report.exitCode}`,
    `Can Dry Run: ${report.decision.canDryRun}`,
    `Can Copied DB Write Rehearsal: ${report.decision.canCopiedDbWriteRehearsal}`,
    "Can Production DB Write: false",
    "Can Write Report File: false"
  ];

  lines.push("");
  lines.push("Target Summary:");
  lines.push(`* Target Kind: ${plan.targetSummary.targetKind}`);
  lines.push(`* Target Location: ${plan.targetSummary.targetLocationKind}`);
  lines.push(`* Target Path: ${plan.targetSummary.targetPathRedacted}`);

  lines.push("");
  lines.push("Counts:");
  lines.push(`* Preview Rows: ${formatNumber(report.counts.previewRows)}`);
  lines.push(`* Import Preview Allowed: ${formatNumber(report.counts.importPreviewAllowed)}`);
  lines.push(`* Blocked: ${formatNumber(report.counts.blockedCount)}`);
  lines.push(`* Duplicate Existing DB: ${formatNumber(report.counts.duplicateExistingDbCount)}`);
  lines.push(`* Duplicate In Batch: ${formatNumber(report.counts.duplicateInBatchCount)}`);
  lines.push(`* Missing Canonical Key: ${formatNumber(report.counts.missingCanonicalKeyCount)}`);

  lines.push("");
  lines.push("SHA Summary:");
  lines.push(`* Original DB SHA Before: ${report.shaSummary.originalDbShaBefore}`);
  lines.push(`* Original DB SHA After: ${report.shaSummary.originalDbShaAfter}`);
  lines.push(`* Copied DB SHA Before: ${report.shaSummary.copiedDbShaBefore}`);
  lines.push(`* Copied DB SHA After: ${report.shaSummary.copiedDbShaAfter ?? "not_provided"}`);
  lines.push(`* Rollback DB SHA: ${report.shaSummary.rollbackDbSha ?? "not_provided"}`);

  lines.push("");
  lines.push("Safety Summary:");
  lines.push(`* Privacy Scan Passed: ${report.safetySummary.privacyScanPassed}`);
  lines.push(`* Raw Zip Absent: ${report.safetySummary.rawZipAbsent}`);
  lines.push(`* Artifact Reports Absent: ${report.safetySummary.artifactReportsAbsent}`);
  lines.push(`* Product Route Disconnected: ${report.safetySummary.productRouteDisconnected}`);
  lines.push(`* API/UI Runtime Unchanged: ${report.safetySummary.apiUiRuntimeUnchanged}`);

  lines.push("");
  lines.push("Execution Summary:");
  lines.push(`* Actual DB Copy Performed: ${report.executionSummary.actualDbCopyPerformed}`);
  lines.push(`* Actual DB Write Performed: ${report.executionSummary.actualDbWritePerformed}`);
  lines.push(`* Report JSON Written: ${report.executionSummary.reportJsonWritten}`);

  if (report.blockedReasons.length > 0) {
    lines.push("");
    lines.push("Blocked Reasons:");
    for (const reason of report.blockedReasons) {
      lines.push(`* ${reason}`);
    }
  }

  if (includeWarnings && report.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of report.warnings) {
      lines.push(`* ${warning}`);
    }
  }

  if (includeRequiredNextChecks && report.requiredNextChecks.length > 0) {
    lines.push("");
    lines.push("Required Next Checks:");
    for (const check of report.requiredNextChecks) {
      lines.push(`* ${check}`);
    }
  }

  return lines;
}

function formatNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function containsForbiddenOutputToken(value: string): boolean {
  return /[A-Za-z]:[\\/]|C:\\Users|sample-user|sample-private-token|sample-external-hrc-folder|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|raw hrc/i.test(
    value
  );
}

function redactPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-token>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-source-folder>");
}

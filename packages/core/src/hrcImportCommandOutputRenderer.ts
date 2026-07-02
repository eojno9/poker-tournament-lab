import type {
  HrcImportCommandJsonValue,
  HrcImportCommandReport
} from "./hrcImportCommandReport.js";
import type { HrcImportNoWriteCliCommandPlan } from "./hrcImportNoWriteCliCommand.js";

export interface HrcImportCommandOutputRenderInput {
  commandReport: HrcImportCommandReport;
  commandPlan?: HrcImportNoWriteCliCommandPlan;
  includeWarnings?: boolean;
  includeNextAction?: boolean;
}

export interface HrcImportCommandOutputRenderResult {
  lines: string[];
  text: string;
  lineCount: number;
  hasWarnings: boolean;
  forbiddenExposureDetected: boolean;
  warnings: string[];
}

export interface HrcImportCommandOutputExposureAssertion {
  pass: boolean;
  warnings: string[];
}

export function renderHrcImportCommandReportLines(
  input: HrcImportCommandOutputRenderInput
): string[] {
  return renderHrcImportCommandReport(input).lines;
}

export function renderHrcImportCommandReportText(
  input: HrcImportCommandOutputRenderInput
): string {
  return renderHrcImportCommandReport(input).text;
}

export function renderHrcImportCommandReport(
  input: HrcImportCommandOutputRenderInput
): HrcImportCommandOutputRenderResult {
  const includeWarnings = input.includeWarnings ?? true;
  const includeNextAction = input.includeNextAction ?? true;
  const report = input.commandReport;
  const plan = input.commandPlan;
  const rawLines = buildRawLines({ report, plan, includeWarnings, includeNextAction });
  const rawText = rawLines.join("\n");
  const forbiddenExposureDetected = containsForbiddenOutputToken(rawText);
  const rendererWarnings = forbiddenExposureDetected ? ["forbidden exposure redacted from command output"] : [];
  const lines = rawLines.map(redactPrivateTokens);
  const text = lines.join("\n");
  const warningCount = report.warnings.length + (plan?.warnings.length ?? 0) + rendererWarnings.length;

  return {
    lines,
    text,
    lineCount: lines.length,
    hasWarnings: warningCount > 0,
    forbiddenExposureDetected,
    warnings: rendererWarnings
  };
}

export function assertNoHrcImportCommandOutputForbiddenExposure(
  result: HrcImportCommandOutputRenderResult
): HrcImportCommandOutputExposureAssertion {
  const warnings = [...result.warnings];
  if (containsForbiddenOutputToken(result.text)) {
    warnings.push("forbidden exposure remains in rendered command output");
  }

  return {
    pass: warnings.length === 0,
    warnings
  };
}

function buildRawLines(input: {
  report: HrcImportCommandReport;
  plan: HrcImportNoWriteCliCommandPlan | undefined;
  includeWarnings: boolean;
  includeNextAction: boolean;
}): string[] {
  const { report, plan, includeWarnings, includeNextAction } = input;
  const lines: string[] = [
    "HRC Import Preview",
    `Command: ${report.commandName}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Exit Code: ${report.exitCode}`,
    `Write Allowed: ${report.writeAllowed}`,
    `DB Write Allowed: ${report.dbWriteAllowed}`,
    `Report File Write Allowed: ${report.reportFileWriteAllowed}`
  ];

  if (plan) {
    lines.push(`Dry Run Only: ${plan.dryRunOnly}`);
    lines.push(`Force Allowed: ${plan.forceAllowed}`);
  }

  lines.push("");
  lines.push("Preview Summary:");
  lines.push(`* Total: ${readNumber(report.previewSummary, "total")}`);
  lines.push(
    `* Import Preview Allowed: ${readFirstNumber(report.previewSummary, [
      "importPreviewAllowedCount",
      "importAllowedCount",
      "readyForImportPreviewCount"
    ])}`
  );
  lines.push(
    `* Manual Review Required: ${readFirstNumber(report.previewSummary, [
      "manualReviewRequiredCount",
      "blockedByDecisionCount"
    ])}`
  );
  lines.push(`* Excluded: ${readNumber(report.previewSummary, "excludedCount")}`);

  lines.push("");
  lines.push("Validation Summary:");
  lines.push(`* Duplicate Existing DB: ${readNumber(report.validationSummary, "duplicateExistingDbCount")}`);
  lines.push(`* Duplicate In Batch: ${readNumber(report.validationSummary, "duplicateInBatchCount")}`);
  lines.push(`* Missing Canonical Key: ${readNumber(report.validationSummary, "missingCanonicalKeyCount")}`);
  lines.push(`* Privacy Blocked: ${readNumber(report.validationSummary, "privacyBlockedCount")}`);
  lines.push(`* Blocking Issues: ${readNumber(report.validationSummary, "blockingIssueCount")}`);

  lines.push("");
  lines.push("Safety Gates:");
  lines.push(`* DB SHA256 Unchanged: ${report.dbSha256Unchanged}`);
  lines.push(`* Product Import Route Disabled: ${report.productImportRouteDisabled}`);
  lines.push(`* DB Read/Write Performed: ${readDbReadWritePerformed(report.safetyGateSummary)}`);
  lines.push(`* Write Allowed: ${report.writeAllowed}`);
  lines.push(`* DB Write Allowed: ${report.dbWriteAllowed}`);
  lines.push(`* Report File Write Allowed: ${report.reportFileWriteAllowed}`);

  if (includeWarnings && (report.warnings.length > 0 || (plan?.warnings.length ?? 0) > 0)) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of [...report.warnings, ...(plan?.warnings ?? [])]) {
      lines.push(`* ${warning}`);
    }
  }

  if (includeNextAction) {
    lines.push("");
    lines.push("Next Action:");
    lines.push(`* ${report.nextAction}`);
  }

  return lines;
}

function readFirstNumber(value: HrcImportCommandJsonValue, keys: string[]): number {
  for (const key of keys) {
    const count = readNumber(value, key);
    if (count !== 0) {
      return count;
    }
  }

  return 0;
}

function readNumber(value: HrcImportCommandJsonValue, key: string): number {
  const objectValue = asJsonObject(value);
  const count = objectValue?.[key];
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function readBoolean(value: HrcImportCommandJsonValue, key: string): boolean | null {
  const objectValue = asJsonObject(value);
  const bool = objectValue?.[key];
  return typeof bool === "boolean" ? bool : null;
}

function readDbReadWritePerformed(value: HrcImportCommandJsonValue): boolean {
  const explicit = readBoolean(value, "dbReadWritePerformed");
  if (explicit !== null) {
    return explicit;
  }

  const notPerformed = readBoolean(value, "dbReadWriteNotPerformed");
  return notPerformed === null ? false : !notPerformed;
}

function asJsonObject(value: HrcImportCommandJsonValue): Record<string, HrcImportCommandJsonValue> | null {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  return value;
}

function containsForbiddenOutputToken(value: string): boolean {
  return /[A-Za-z]:[\\/]|C:\\Users|sample-user|sample-private-token|sample-external-hrc-folder|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
    value
  );
}

function redactPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

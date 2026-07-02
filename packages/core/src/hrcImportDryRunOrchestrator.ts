import {
  summarizeHrcImportPreviewRows,
  type HrcImportPreviewRow,
  type HrcImportPreviewSummary
} from "./hrcImportPreviewContract.js";
import {
  buildHrcExistingSolutionCanonicalKeySnapshot,
  type HrcExistingSolutionCanonicalKeySnapshot,
  type HrcExistingSolutionSnapshotInputRow
} from "./hrcExistingSolutionSnapshot.js";
import {
  summarizeHrcImportPreviewValidation,
  validateHrcImportPreviewRows,
  type HrcImportPreviewValidationSummary
} from "./hrcImportPreviewValidator.js";
import {
  buildHrcImportBackupManifest,
  summarizeHrcImportBackupManifest,
  type HrcImportBackupJsonValue,
  type HrcImportBackupManifest,
  type HrcImportBackupSafetyChecks
} from "./hrcImportBackupManifest.js";
import {
  buildHrcImportCommandReport,
  type HrcImportCommandExitCode,
  type HrcImportCommandReport,
  type HrcImportCommandStatus,
  type HrcImportCommandValidationSummary,
  type HrcImportDryRunCommandName
} from "./hrcImportCommandReport.js";

export type HrcImportDryRunOrchestrationVersion = "v3.0-dry-run-orchestration-preview";

export interface HrcImportDryRunOrchestrationSafetyChecks extends HrcImportBackupSafetyChecks {
  localPathExposureDetected: boolean;
  rawArtifactExposureDetected: boolean;
}

export interface HrcImportDryRunOrchestrationInput {
  commandName: HrcImportDryRunCommandName;
  timestampIso: string;
  branchName: string;
  commitHash: string;
  dbFileName: string;
  dbSha256Before: string;
  dbSha256After: string;
  previewRows: HrcImportPreviewRow[];
  existingSolutionRows: HrcExistingSolutionSnapshotInputRow[];
  classificationSummary: HrcImportBackupJsonValue;
  safetyChecks: HrcImportDryRunOrchestrationSafetyChecks;
}

export interface HrcImportDryRunOrchestrationValidationSummary {
  total: number;
  readyForImportPreviewCount: number;
  blockedByDecisionCount: number;
  missingCanonicalKeyCount: number;
  duplicateInBatchCount: number;
  duplicateExistingDbCount: number;
  privacyBlockedCount: number;
  excludedCount: number;
  importPreviewAllowedCount: number;
  dbWriteAllowedTrueCount: number;
  blockingIssueCount: number;
}

export interface HrcImportDryRunOrchestrationResult {
  version: HrcImportDryRunOrchestrationVersion;
  previewSummary: HrcImportPreviewSummary;
  existingSolutionSnapshot: HrcExistingSolutionCanonicalKeySnapshot;
  validationSummary: HrcImportDryRunOrchestrationValidationSummary;
  backupManifest: HrcImportBackupManifest;
  commandReport: HrcImportCommandReport;
  exitCode: HrcImportCommandExitCode;
  status: HrcImportCommandStatus;
  warnings: string[];
  nextAction: string;
  writeAllowed: false;
  dbWriteAllowed: false;
  reportFileWriteAllowed: false;
}

export function buildHrcImportDryRunOrchestration(
  input: HrcImportDryRunOrchestrationInput
): HrcImportDryRunOrchestrationResult {
  const inputPrivacyExposureDetected = containsPrivateToken(JSON.stringify(input));
  const previewSummary = summarizeHrcImportPreviewRows(input.previewRows);
  const rawExistingSolutionSnapshot = buildHrcExistingSolutionCanonicalKeySnapshot(input.existingSolutionRows);
  const existingSolutionSnapshot = sanitizeExistingSolutionSnapshot(rawExistingSolutionSnapshot);
  const validatedRows = validateHrcImportPreviewRows({
    rows: input.previewRows,
    existingCanonicalKeys: rawExistingSolutionSnapshot.canonicalKeys
  });
  const validationSummary = buildOrchestrationValidationSummary(
    summarizeHrcImportPreviewValidation(validatedRows)
  );
  const validationSummaryJson = validationSummaryToJson(validationSummary);
  const commandValidationSummary: HrcImportCommandValidationSummary = {
    ...validationSummaryJson,
    blockingIssueCount: validationSummary.blockingIssueCount,
    duplicateExistingDbCount: validationSummary.duplicateExistingDbCount,
    duplicateInBatchCount: validationSummary.duplicateInBatchCount,
    missingCanonicalKeyCount: validationSummary.missingCanonicalKeyCount,
    privacyBlockedCount: validationSummary.privacyBlockedCount,
    dbWriteAllowedTrueCount: validationSummary.dbWriteAllowedTrueCount
  };
  const backupSafetyChecks = toBackupSafetyChecks(input.safetyChecks);
  const backupManifest = buildHrcImportBackupManifest({
    backupId: buildBackupId(input.commitHash),
    timestampIso: input.timestampIso,
    branchName: input.branchName,
    commitHash: input.commitHash,
    dbFileName: input.dbFileName,
    dbSha256Before: input.dbSha256Before,
    importPreviewSummary: previewSummaryToJson(previewSummary),
    validationSummary: validationSummaryJson,
    classificationSummary: input.classificationSummary,
    safetyChecks: backupSafetyChecks,
    rollbackInstructions: [
      "No DB write is performed by this dry-run orchestration helper.",
      "No backup or restore action is executed by this helper.",
      "Future write-capable import work requires a separate approval gate and restore rehearsal."
    ]
  });
  const backupManifestSummary = summarizeHrcImportBackupManifest(backupManifest);
  const commandReport = buildHrcImportCommandReport({
    commandName: input.commandName,
    mode: "DRY_RUN",
    timestampIso: input.timestampIso,
    previewSummary: previewSummaryToJson(previewSummary),
    validationSummary: commandValidationSummary,
    backupManifestSummary: backupManifestSummaryToJson(backupManifestSummary),
    safetyGateSummary: buildSafetyGateSummary(input.safetyChecks),
    privacyScanPassed: input.safetyChecks.privacyScanPassed && !inputPrivacyExposureDetected,
    dbSha256Before: input.dbSha256Before,
    dbSha256After: input.dbSha256After,
    productImportRouteDisabled: input.safetyChecks.productImportRouteDisabled,
    dbReadWritePerformed: !input.safetyChecks.dbReadWriteNotPerformed,
    localPathExposureDetected: input.safetyChecks.localPathExposureDetected || inputPrivacyExposureDetected,
    rawArtifactExposureDetected: input.safetyChecks.rawArtifactExposureDetected,
    warnings: backupManifest.warnings
  });

  return {
    version: "v3.0-dry-run-orchestration-preview",
    previewSummary,
    existingSolutionSnapshot,
    validationSummary,
    backupManifest,
    commandReport,
    exitCode: commandReport.exitCode,
    status: commandReport.status,
    warnings: sanitizeStringArray([...backupManifest.warnings, ...commandReport.warnings]),
    nextAction: commandReport.nextAction,
    writeAllowed: false,
    dbWriteAllowed: false,
    reportFileWriteAllowed: false
  };
}

function buildOrchestrationValidationSummary(
  summary: HrcImportPreviewValidationSummary
): HrcImportDryRunOrchestrationValidationSummary {
  const blockingIssueCount =
    summary.missingCanonicalKeyCount +
    summary.duplicateInBatchCount +
    summary.duplicateExistingDbCount +
    summary.privacyBlockedCount +
    summary.dbWriteAllowedTrueCount;

  return {
    ...summary,
    blockingIssueCount
  };
}

function previewSummaryToJson(summary: HrcImportPreviewSummary): Record<string, number> {
  return {
    total: summary.total,
    readyForImportPreviewCount: summary.readyForImportPreviewCount,
    manualReviewRequiredCount: summary.manualReviewRequiredCount,
    holdCount: summary.holdCount,
    excludedCount: summary.excludedCount,
    lowRiskCount: summary.lowRiskCount,
    mediumRiskCount: summary.mediumRiskCount,
    highRiskCount: summary.highRiskCount,
    blockedRiskCount: summary.blockedRiskCount,
    dbWriteAllowedTrueCount: summary.dbWriteAllowedTrueCount,
    importAllowedCount: summary.importAllowedCount
  };
}

function validationSummaryToJson(
  summary: HrcImportDryRunOrchestrationValidationSummary
): Record<string, number> {
  return {
    total: summary.total,
    readyForImportPreviewCount: summary.readyForImportPreviewCount,
    blockedByDecisionCount: summary.blockedByDecisionCount,
    missingCanonicalKeyCount: summary.missingCanonicalKeyCount,
    duplicateInBatchCount: summary.duplicateInBatchCount,
    duplicateExistingDbCount: summary.duplicateExistingDbCount,
    privacyBlockedCount: summary.privacyBlockedCount,
    excludedCount: summary.excludedCount,
    importPreviewAllowedCount: summary.importPreviewAllowedCount,
    dbWriteAllowedTrueCount: summary.dbWriteAllowedTrueCount,
    blockingIssueCount: summary.blockingIssueCount
  };
}

function backupManifestSummaryToJson(
  summary: ReturnType<typeof summarizeHrcImportBackupManifest>
): Record<string, string | number | boolean | string[]> {
  return {
    version: summary.version,
    backupId: summary.backupId,
    branchName: summary.branchName,
    commitHash: summary.commitHash,
    dbFileName: summary.dbFileName,
    dbSha256BeforePresent: summary.dbSha256BeforePresent,
    allSafetyChecksPassed: summary.allSafetyChecksPassed,
    failedSafetyChecks: summary.failedSafetyChecks,
    warningCount: summary.warningCount,
    writeAllowed: summary.writeAllowed,
    restoreRehearsalRequired: summary.restoreRehearsalRequired
  };
}

function buildBackupId(commitHash: string): string {
  const normalized = sanitizeString(commitHash).trim();
  const suffix = normalized.length > 0 ? normalized.slice(0, 12) : "unknown";
  return `dry-run-preview-${suffix}`;
}

function toBackupSafetyChecks(
  safetyChecks: HrcImportDryRunOrchestrationSafetyChecks
): HrcImportBackupSafetyChecks {
  return {
    gitStatusClean: safetyChecks.gitStatusClean,
    testPassed: safetyChecks.testPassed,
    buildPassed: safetyChecks.buildPassed,
    smokePassed: safetyChecks.smokePassed,
    privacyScanPassed: safetyChecks.privacyScanPassed,
    rawZipAbsent: safetyChecks.rawZipAbsent,
    generatedArtifactJsonAbsent: safetyChecks.generatedArtifactJsonAbsent,
    hrcDryRunReportsAbsent: safetyChecks.hrcDryRunReportsAbsent,
    productImportRouteDisabled: safetyChecks.productImportRouteDisabled,
    dbReadWriteNotPerformed: safetyChecks.dbReadWriteNotPerformed
  };
}

function buildSafetyGateSummary(
  safetyChecks: HrcImportDryRunOrchestrationSafetyChecks
): Record<string, boolean> {
  return {
    gitStatusClean: safetyChecks.gitStatusClean,
    testPassed: safetyChecks.testPassed,
    buildPassed: safetyChecks.buildPassed,
    smokePassed: safetyChecks.smokePassed,
    privacyScanPassed: safetyChecks.privacyScanPassed,
    rawZipAbsent: safetyChecks.rawZipAbsent,
    generatedArtifactJsonAbsent: safetyChecks.generatedArtifactJsonAbsent,
    hrcDryRunReportsAbsent: safetyChecks.hrcDryRunReportsAbsent,
    productImportRouteDisabled: safetyChecks.productImportRouteDisabled,
    dbReadWriteNotPerformed: safetyChecks.dbReadWriteNotPerformed,
    localPathExposureDetected: safetyChecks.localPathExposureDetected,
    rawArtifactExposureDetected: safetyChecks.rawArtifactExposureDetected
  };
}

function sanitizeExistingSolutionSnapshot(
  snapshot: HrcExistingSolutionCanonicalKeySnapshot
): HrcExistingSolutionCanonicalKeySnapshot {
  return {
    totalRows: snapshot.totalRows,
    canonicalKeys: sanitizeStringArray(snapshot.canonicalKeys),
    entries: snapshot.entries.map((entry) => ({
      rowId: sanitizeString(entry.rowId),
      canonicalKey: entry.canonicalKey === null ? null : sanitizeString(entry.canonicalKey),
      normalizedCanonicalKey:
        entry.normalizedCanonicalKey === null ? null : sanitizeString(entry.normalizedCanonicalKey),
      source: sanitizeString(entry.source),
      sourceFile: entry.sourceFile === null ? null : sanitizeString(entry.sourceFile),
      isDuplicate: entry.isDuplicate,
      warnings: sanitizeStringArray(entry.warnings)
    })),
    missingCanonicalKeyCount: snapshot.missingCanonicalKeyCount,
    duplicateCanonicalKeyCount: snapshot.duplicateCanonicalKeyCount,
    uniqueCanonicalKeyCount: snapshot.uniqueCanonicalKeyCount,
    sourceBreakdown: Object.fromEntries(
      Object.entries(snapshot.sourceBreakdown).map(([key, value]) => [sanitizeString(key), value])
    ),
    warnings: sanitizeStringArray(snapshot.warnings)
  };
}

function sanitizeStringArray(values: string[]): string[] {
  return values.map((value) => sanitizeString(value));
}

function sanitizeString(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

function containsPrivateToken(value: string): boolean {
  return /[A-Za-z]:[\\/]|C:\\Users|sample-user|sample-private-token|sample-external-hrc-folder|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
    value
  );
}

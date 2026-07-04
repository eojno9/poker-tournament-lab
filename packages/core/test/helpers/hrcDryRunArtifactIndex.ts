import {
  HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
  HRC_DRY_RUN_ARTIFACT_SOURCE_KIND,
  sanitizeArtifactFileName,
  type HrcDryRunArtifactReport,
} from "./hrcDryRunArtifactReport.js";
import type { HrcRawZipDryRunStatus } from "./hrcRawZipDryRunReader.js";

export const HRC_DRY_RUN_ARTIFACT_INDEX_SOURCE_KIND =
  "HRC_RAW_ZIP_DRY_RUN_INDEX";
export const HRC_DRY_RUN_ARTIFACT_INDEX_SORT_POLICY =
  "zipFileNameSanitized ASC, generatedAt ASC, selectedNodeEntry ASC";

export type HrcDryRunStatusCounts = Record<HrcRawZipDryRunStatus, number>;

export type HrcDryRunArtifactIndexComparisonRow = {
  schemaVersion: typeof HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  sourceKind: typeof HRC_DRY_RUN_ARTIFACT_SOURCE_KIND;
  zipFileNameSanitized: string;
  status: HrcRawZipDryRunStatus;
  selectedNodeEntry: string | null;
  nodeEntryCount: number;
  actionCount: number;
  handCount: number;
  sequenceLength: number;
  validatorPass: boolean;
  mismatchCount: number;
  mismatchCategories: string[];
  privacySafe: boolean;
  amountUnit: "UNKNOWN";
  warningsCount: number;
  errorsCount: number;
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
};

export type HrcDryRunNodeEntryCountSummary = {
  min: number | null;
  max: number | null;
  valuesSample: number[];
};

export type HrcDryRunArtifactIndex = {
  schemaVersion: typeof HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  sourceKind: typeof HRC_DRY_RUN_ARTIFACT_INDEX_SOURCE_KIND;
  isProductImportCandidate: false;
  indexSortPolicy: typeof HRC_DRY_RUN_ARTIFACT_INDEX_SORT_POLICY;
  reportCount: number;
  statusCounts: HrcDryRunStatusCounts;
  validatorPassCount: number;
  validatorFailCount: number;
  privacySafeCount: number;
  privacyWarningCount: number;
  mismatchReportCount: number;
  mismatchCountTotal: number;
  mismatchCategories: string[];
  warningCountTotal: number;
  errorCountTotal: number;
  amountUnitCounts: Record<string, number>;
  nodeEntryCount: HrcDryRunNodeEntryCountSummary;
  selectedNodeEntriesSample: string[];
  zipFileNamesSample: string[];
  reports: HrcDryRunArtifactIndexComparisonRow[];
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
  apiUsed: false;
  uiUsed: false;
  multiNodeAggregationApplied: false;
};

export type BuildHrcDryRunArtifactIndexOptions = {
  generatedAt?: Date | string;
};

export type BuildHrcDryRunArtifactIndexFileNameOptions = {
  generatedAt?: Date | string;
  fileName?: string;
  prefix?: string;
};

export function buildHrcDryRunArtifactIndex(
  artifactReports: HrcDryRunArtifactReport[],
  options: BuildHrcDryRunArtifactIndexOptions = {},
): HrcDryRunArtifactIndex {
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  const reports = buildHrcDryRunArtifactComparisonRows(artifactReports);
  const statusCounts = createEmptyStatusCounts();
  const amountUnitCounts: Record<string, number> = {};

  for (const report of reports) {
    statusCounts[report.status] += 1;
    amountUnitCounts[report.amountUnit] =
      (amountUnitCounts[report.amountUnit] ?? 0) + 1;
  }

  const nodeEntryCounts = reports.map((report) => report.nodeEntryCount);
  const mismatchCategories = uniqueSorted(
    reports.flatMap((report) => report.mismatchCategories),
  );

  return {
    schemaVersion: HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
    generatedAt,
    sourceKind: HRC_DRY_RUN_ARTIFACT_INDEX_SOURCE_KIND,
    isProductImportCandidate: false,
    indexSortPolicy: HRC_DRY_RUN_ARTIFACT_INDEX_SORT_POLICY,
    reportCount: reports.length,
    statusCounts,
    validatorPassCount: reports.filter((report) => report.validatorPass).length,
    validatorFailCount: reports.filter((report) => !report.validatorPass).length,
    privacySafeCount: reports.filter((report) => report.privacySafe).length,
    privacyWarningCount: artifactReports.filter(
      (report) => !report.privacySafe || report.privacyWarnings.length > 0,
    ).length,
    mismatchReportCount: reports.filter(
      (report) =>
        report.mismatchCount > 0 || report.mismatchCategories.length > 0,
    ).length,
    mismatchCountTotal: reports.reduce(
      (total, report) => total + report.mismatchCount,
      0,
    ),
    mismatchCategories,
    warningCountTotal: reports.reduce(
      (total, report) => total + report.warningsCount,
      0,
    ),
    errorCountTotal: reports.reduce(
      (total, report) => total + report.errorsCount,
      0,
    ),
    amountUnitCounts,
    nodeEntryCount: summarizeNodeEntryCounts(nodeEntryCounts),
    selectedNodeEntriesSample: uniqueSorted(
      reports
        .map((report) => report.selectedNodeEntry)
        .filter((entry): entry is string => entry !== null),
    ).slice(0, 10),
    zipFileNamesSample: uniqueSorted(
      reports.map((report) => report.zipFileNameSanitized),
    ).slice(0, 10),
    reports,
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
    multiNodeAggregationApplied: false,
  };
}

export function buildHrcDryRunArtifactComparisonRows(
  artifactReports: HrcDryRunArtifactReport[],
): HrcDryRunArtifactIndexComparisonRow[] {
  return artifactReports
    .map(toComparisonRow)
    .sort(compareComparisonRows);
}

export function buildHrcDryRunArtifactIndexFileName(
  options: BuildHrcDryRunArtifactIndexFileNameOptions = {},
): string {
  if (options.fileName) {
    return ensureJsonExtension(sanitizeArtifactFileName(options.fileName));
  }

  const prefix = sanitizeArtifactFileName(
    options.prefix ?? "hrc-dry-run-index",
  );
  const timestamp = formatArtifactTimestamp(options.generatedAt ?? new Date());

  return ensureJsonExtension(sanitizeArtifactFileName(`${prefix}-${timestamp}`));
}

function toComparisonRow(
  artifactReport: HrcDryRunArtifactReport,
): HrcDryRunArtifactIndexComparisonRow {
  return {
    schemaVersion: HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
    generatedAt: sanitizeDiagnosticText(artifactReport.generatedAt),
    sourceKind: HRC_DRY_RUN_ARTIFACT_SOURCE_KIND,
    zipFileNameSanitized: sanitizeArtifactFileName(
      artifactReport.zipFileNameSanitized,
    ),
    status: artifactReport.status,
    selectedNodeEntry: sanitizeNullableText(artifactReport.selectedNodeEntry),
    nodeEntryCount: artifactReport.nodeEntryCount,
    actionCount: artifactReport.actionCount,
    handCount: artifactReport.handCount,
    sequenceLength: artifactReport.sequenceLength,
    validatorPass: artifactReport.validatorResult.pass,
    mismatchCount: artifactReport.mismatchSummary.mismatchCount,
    mismatchCategories: uniqueSorted(
      artifactReport.mismatchSummary.categories.map(sanitizeDiagnosticText),
    ),
    privacySafe: artifactReport.privacySafe,
    amountUnit: "UNKNOWN",
    warningsCount: artifactReport.warnings.length,
    errorsCount: artifactReport.errors.length,
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
  };
}

function compareComparisonRows(
  left: HrcDryRunArtifactIndexComparisonRow,
  right: HrcDryRunArtifactIndexComparisonRow,
): number {
  return (
    left.zipFileNameSanitized.localeCompare(right.zipFileNameSanitized) ||
    left.generatedAt.localeCompare(right.generatedAt) ||
    (left.selectedNodeEntry ?? "").localeCompare(right.selectedNodeEntry ?? "")
  );
}

function createEmptyStatusCounts(): HrcDryRunStatusCounts {
  return {
    OK: 0,
    ZIP_NOT_FOUND: 0,
    SETTINGS_MISSING: 0,
    NODE_MISSING: 0,
    SETTINGS_PARSE_ERROR: 0,
    NODE_PARSE_ERROR: 0,
    RAW_NODE_SHAPE_INVALID: 0,
    PRIVACY_WARNING: 0,
    ADAPTER_FAILED: 0,
    VALIDATOR_FAILED: 0,
  };
}

function summarizeNodeEntryCounts(
  values: number[],
): HrcDryRunNodeEntryCountSummary {
  if (values.length === 0) {
    return {
      min: null,
      max: null,
      valuesSample: [],
    };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
    valuesSample: Array.from(new Set(values)).sort((left, right) => left - right)
      .slice(0, 10),
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

function normalizeGeneratedAt(value?: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? new Date().toISOString();
}

function sanitizeNullableText(value: string | null): string | null {
  return value === null ? null : sanitizeDiagnosticText(value);
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users\\[^\s"']*/gi, "<redacted-windows-path>")
    .replace(/C:\/Users\/[^\s"']*/gi, "<redacted-windows-path>")
    .replace(/\bsample-user\b/gi, "<redacted-user>")
    .replace(/\b(AppData|Desktop|Documents)\b/gi, "<redacted-path-token>")
    .replace(/\b(playerName|nickname|screenname|userName)\b/gi, "<redacted-field>");
}

function ensureJsonExtension(fileName: string): string {
  const withoutJsonExtension = fileName.replace(/\.json$/i, "");
  return `${withoutJsonExtension || "hrc-dry-run-index"}.json`;
}

function formatArtifactTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date
      .toISOString()
      .slice(0, 19)
      .replace(/[-:]/g, "")
      .replace("T", "-");
  }

  return sanitizeArtifactFileName(String(value)).slice(0, 32) || "unknown-time";
}

import type {
  HrcRawZipDryRunAdapterReportSummary,
  HrcRawZipDryRunMismatchSummary,
  HrcRawZipDryRunReport,
  HrcRawZipDryRunStatus,
  HrcRawZipDryRunValidatorResult,
} from "./hrcRawZipDryRunReader.js";

export const HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION = "v2.6.0";
export const HRC_DRY_RUN_ARTIFACT_SOURCE_KIND = "HRC_RAW_ZIP_DRY_RUN";

export type HrcDryRunAmountSemantics = {
  amountUnit: "UNKNOWN";
  amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED";
  bbConversionApplied: false;
  chipConversionApplied: false;
};

export type HrcDryRunVerificationSummary = {
  exactLookup?: { passed: number; total: number } | null;
  randomLookup?: { passed: number; total: number } | null;
  duplicateCanonicalKey?: number | null;
  nearMatchHrcFalsePositive?: number | null;
};

export type HrcDryRunArtifactReport = {
  schemaVersion: typeof HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  sourceKind: typeof HRC_DRY_RUN_ARTIFACT_SOURCE_KIND;
  isProductImportCandidate: false;
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
  apiUsed: false;
  uiUsed: false;
  zipPathMasked: string;
  zipFileNameSanitized: string;
  entryCount: number;
  hasSettingsJson: boolean;
  nodeEntryCount: number;
  nodeEntriesSample: string[];
  selectedNodeEntry: string | null;
  selectedNodeReason: string | null;
  multipleNodeEntriesDetected: boolean;
  multiNodeAggregationApplied: false;
  status: HrcRawZipDryRunStatus;
  warnings: string[];
  errors: string[];
  privacySafe: boolean;
  privacyWarnings: string[];
  adapterReportSummary: HrcRawZipDryRunAdapterReportSummary | null;
  validatorResult: HrcRawZipDryRunValidatorResult;
  mismatchSummary: HrcRawZipDryRunMismatchSummary;
  amountSemantics: HrcDryRunAmountSemantics;
  verificationSummary: HrcDryRunVerificationSummary;
  actionCount: number;
  handCount: number;
  sequenceLength: number;
};

export type HrcDryRunComparisonSummary = {
  schemaVersion: typeof HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  sourceKind: typeof HRC_DRY_RUN_ARTIFACT_SOURCE_KIND;
  zipFileNameSanitized: string;
  status: HrcRawZipDryRunStatus;
  actionCount: number;
  handCount: number;
  sequenceLength: number;
  nodeEntryCount: number;
  selectedNodeEntry: string | null;
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

export type BuildHrcDryRunArtifactReportOptions = {
  generatedAt?: Date | string;
  zipPath?: string;
  zipFileName?: string;
  verificationSummary?: HrcDryRunVerificationSummary;
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const defaultVerificationSummary: HrcDryRunVerificationSummary = {
  exactLookup: null,
  randomLookup: null,
  duplicateCanonicalKey: null,
  nearMatchHrcFalsePositive: null,
};

export function buildHrcDryRunArtifactReport(
  dryRunReport: HrcRawZipDryRunReport,
  options: BuildHrcDryRunArtifactReportOptions = {},
): HrcDryRunArtifactReport {
  const generatedAt = normalizeGeneratedAt(options.generatedAt);
  const sourcePath = options.zipPath ?? dryRunReport.zipPathMasked;
  const zipFileNameSanitized = sanitizeArtifactFileName(
    options.zipFileName ?? sourcePath,
  );
  const mismatchSummary = sanitizeMismatchSummary(dryRunReport.mismatchSummary);

  return {
    schemaVersion: HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
    generatedAt,
    sourceKind: HRC_DRY_RUN_ARTIFACT_SOURCE_KIND,
    isProductImportCandidate: false,
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
    zipPathMasked: maskArtifactPath(sourcePath),
    zipFileNameSanitized,
    entryCount: dryRunReport.entryCount,
    hasSettingsJson: dryRunReport.hasSettingsJson,
    nodeEntryCount: dryRunReport.nodeEntryCount,
    nodeEntriesSample: dryRunReport.nodeEntriesSample
      .map(sanitizeDiagnosticText)
      .slice(0, 10),
    selectedNodeEntry: sanitizeNullableText(dryRunReport.selectedNodeEntry),
    selectedNodeReason: sanitizeNullableText(dryRunReport.selectedNodeReason),
    multipleNodeEntriesDetected: dryRunReport.multipleNodeEntriesDetected,
    multiNodeAggregationApplied: false,
    status: dryRunReport.status,
    warnings: dryRunReport.warnings.map(sanitizeDiagnosticText),
    errors: dryRunReport.errors.map(sanitizeDiagnosticText),
    privacySafe: dryRunReport.privacySafe,
    privacyWarnings: dryRunReport.privacyWarnings.map(sanitizePrivacyWarning),
    adapterReportSummary: dryRunReport.adapterReportSummary,
    validatorResult: sanitizeValidatorResult(dryRunReport.validatorResult),
    mismatchSummary,
    amountSemantics: {
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      bbConversionApplied: false,
      chipConversionApplied: false,
    },
    verificationSummary: {
      ...defaultVerificationSummary,
      ...options.verificationSummary,
    },
    actionCount: dryRunReport.actionCount,
    handCount: dryRunReport.handCount,
    sequenceLength: dryRunReport.sequenceLength,
  };
}

export function buildHrcDryRunComparisonSummary(
  artifactReport: HrcDryRunArtifactReport,
): HrcDryRunComparisonSummary {
  return {
    schemaVersion: artifactReport.schemaVersion,
    generatedAt: artifactReport.generatedAt,
    sourceKind: artifactReport.sourceKind,
    zipFileNameSanitized: artifactReport.zipFileNameSanitized,
    status: artifactReport.status,
    actionCount: artifactReport.actionCount,
    handCount: artifactReport.handCount,
    sequenceLength: artifactReport.sequenceLength,
    nodeEntryCount: artifactReport.nodeEntryCount,
    selectedNodeEntry: artifactReport.selectedNodeEntry,
    validatorPass: artifactReport.validatorResult.pass,
    mismatchCount: artifactReport.mismatchSummary.mismatchCount,
    mismatchCategories: artifactReport.mismatchSummary.categories,
    privacySafe: artifactReport.privacySafe,
    amountUnit: artifactReport.amountSemantics.amountUnit,
    warningsCount: artifactReport.warnings.length,
    errorsCount: artifactReport.errors.length,
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
  };
}

export function sanitizeArtifactFileName(name: string | null | undefined): string {
  const basename =
    name
      ?.replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .at(-1) ?? "unknown-source";

  const safeName = basename
    .replace(EMAIL_PATTERN, "email")
    .replace(/\b(C|Users|AppData|Desktop|Documents|sample-user)\b/gi, "")
    .replace(/\b(playerName|nickname|screenname|userName)\b/gi, "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 96);

  return safeName.length > 0 ? safeName : "unknown-source";
}

export function maskArtifactPath(path: string | null | undefined): string {
  return `<repo-external>/${sanitizeArtifactFileName(path)}`;
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

function sanitizeValidatorResult(
  validatorResult: HrcRawZipDryRunValidatorResult,
): HrcRawZipDryRunValidatorResult {
  return {
    ...validatorResult,
    issueMessages: validatorResult.issueMessages.map(sanitizeDiagnosticText),
    warningMessages:
      validatorResult.warningMessages.map(sanitizeDiagnosticText),
  };
}

function sanitizeMismatchSummary(
  mismatchSummary: HrcRawZipDryRunMismatchSummary,
): HrcRawZipDryRunMismatchSummary {
  return {
    ...mismatchSummary,
    categories: mismatchSummary.categories.map(sanitizeDiagnosticText),
    sample: mismatchSummary.sample.map(sanitizeDiagnosticText).slice(0, 3),
  };
}

function sanitizePrivacyWarning(value: string): string {
  const lowerValue = value.toLowerCase();

  if (
    lowerValue.includes("email") ||
    EMAIL_PATTERN.test(value)
  ) {
    return "privacy pattern detected: email";
  }

  if (
    lowerValue.includes("windows-user-path") ||
    lowerValue.includes("c:\\users") ||
    lowerValue.includes("c:/users")
  ) {
    return "privacy pattern detected: windows-user-path";
  }

  if (
    lowerValue.includes("account-user-token") ||
    lowerValue.includes("sample-user")
  ) {
    return "privacy pattern detected: account-user-token";
  }

  if (
    lowerValue.includes("appdata") ||
    lowerValue.includes("desktop") ||
    lowerValue.includes("documents")
  ) {
    return "privacy pattern detected: local-path-token";
  }

  if (
    lowerValue.includes("playername") ||
    lowerValue.includes("nickname") ||
    lowerValue.includes("screenname") ||
    lowerValue.includes("username")
  ) {
    return "privacy pattern detected: player-or-user-field";
  }

  return sanitizeDiagnosticText(value);
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

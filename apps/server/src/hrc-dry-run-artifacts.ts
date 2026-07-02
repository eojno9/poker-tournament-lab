import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

export type HrcDryRunArtifactKind = "REPORT" | "INDEX" | "COMPARISON" | "UNKNOWN";

export interface HrcDryRunArtifactsReadOptions {
  artifactsDir?: string;
}

export interface HrcDryRunArtifactSafetySummary {
  readOnly: true;
  dbWriteApplied: false;
  productImportConnected: false;
  batchRunnerExecuted: false;
  rawZipRead: false;
  uiUsed: false;
}

export interface HrcDryRunArtifactListItem {
  fileName: string;
  kind: HrcDryRunArtifactKind;
  generatedAt: string | null;
  status: string | null;
  zipFileNameSanitized: string | null;
  selectedNodeEntry: string | null;
  privacySafe: boolean | null;
  validatorPass: boolean | null;
  warningsCount: number;
  errorsCount: number;
  mismatchCount: number | null;
  safetyFlags: ArtifactSafetyFlags;
  sizeBytes: number;
  modifiedAt: string;
}

export interface HrcDryRunArtifactInvalidItem {
  fileName: string;
  reason:
    | "PATH_TRAVERSAL_REJECTED"
    | "ZIP_FILE_REJECTED"
    | "NON_JSON_FILE_REJECTED"
    | "MALFORMED_JSON"
    | "SCHEMA_UNRECOGNIZED"
    | "READ_FAILED";
  error: string | null;
}

export interface HrcDryRunArtifactsListResponse {
  directoryExists: boolean;
  baseDir: typeof ARTIFACT_BASE_DIR_LABEL;
  items: HrcDryRunArtifactListItem[];
  invalidItems: HrcDryRunArtifactInvalidItem[];
  safety: HrcDryRunArtifactSafetySummary;
}

export interface HrcDryRunArtifactDetailResponse {
  fileName: string;
  kind: HrcDryRunArtifactKind;
  summary: HrcDryRunArtifactListItem;
  detail: {
    adapterReportSummary: unknown;
    validatorResult: unknown;
    mismatchSummary: unknown;
    privacyWarnings: string[];
    indexSummary: unknown;
    comparisonSummary: unknown;
    safety: ArtifactSafetyFlags & HrcDryRunArtifactSafetySummary;
  };
}

export type HrcDryRunArtifactDetailReadResult =
  | { statusCode: 200; body: HrcDryRunArtifactDetailResponse }
  | { statusCode: 400 | 404 | 422; body: { error: string; fileName?: string } };

interface ArtifactSafetyFlags {
  rawZipCommitted: boolean | null;
  productImportConnected: boolean | null;
  dbWriteApplied: boolean | null;
  apiUsed: boolean | null;
  uiUsed: boolean | null;
  multiNodeAggregationApplied: boolean | null;
}

const ARTIFACT_BASE_DIR_LABEL = "artifacts/hrc-dry-run-reports";
const REPORT_SOURCE_KIND = "HRC_RAW_ZIP_DRY_RUN";
const INDEX_SOURCE_KIND = "HRC_RAW_ZIP_DRY_RUN_INDEX";
const COMPARISON_SOURCE_KIND = "HRC_RAW_ZIP_DRY_RUN_COMPARISON";
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function readHrcDryRunArtifactList(
  options: HrcDryRunArtifactsReadOptions = {},
): HrcDryRunArtifactsListResponse {
  const artifactsDir = resolveArtifactsDir(options);
  if (!existsSync(artifactsDir)) {
    return {
      directoryExists: false,
      baseDir: ARTIFACT_BASE_DIR_LABEL,
      items: [],
      invalidItems: [],
      safety: buildReadOnlySafety(),
    };
  }

  if (!statSync(artifactsDir).isDirectory()) {
    return {
      directoryExists: false,
      baseDir: ARTIFACT_BASE_DIR_LABEL,
      items: [],
      invalidItems: [
        {
          fileName: ARTIFACT_BASE_DIR_LABEL,
          reason: "READ_FAILED",
          error: "artifact path exists but is not a directory",
        },
      ],
      safety: buildReadOnlySafety(),
    };
  }

  const items: HrcDryRunArtifactListItem[] = [];
  const invalidItems: HrcDryRunArtifactInvalidItem[] = [];
  for (const fileName of readdirSync(artifactsDir).sort((left, right) => left.localeCompare(right))) {
    const candidate = validateArtifactFileName(fileName);
    if (!candidate.ok) {
      invalidItems.push({
        fileName: sanitizeText(fileName),
        reason: candidate.reason,
        error: candidate.error,
      });
      continue;
    }

    const filePath = path.resolve(artifactsDir, candidate.fileName);
    if (!isPathInside(artifactsDir, filePath)) {
      invalidItems.push({
        fileName: candidate.fileName,
        reason: "PATH_TRAVERSAL_REJECTED",
        error: "artifact file escaped the artifact directory",
      });
      continue;
    }

    const parsed = readArtifactJson(filePath);
    if (!parsed.ok) {
      invalidItems.push({
        fileName: candidate.fileName,
        reason: parsed.reason,
        error: parsed.error,
      });
      continue;
    }

    const summary = buildArtifactSummary(candidate.fileName, filePath, parsed.value);
    if (!summary.ok) {
      invalidItems.push({
        fileName: candidate.fileName,
        reason: "SCHEMA_UNRECOGNIZED",
        error: summary.error,
      });
      continue;
    }

    items.push(summary.item);
  }

  return {
    directoryExists: true,
    baseDir: ARTIFACT_BASE_DIR_LABEL,
    items: items.sort(compareArtifactItems),
    invalidItems,
    safety: buildReadOnlySafety(),
  };
}

export function readHrcDryRunArtifactDetail(
  fileName: string,
  options: HrcDryRunArtifactsReadOptions = {},
): HrcDryRunArtifactDetailReadResult {
  const candidate = validateArtifactFileName(fileName);
  if (!candidate.ok) {
    return {
      statusCode: 400,
      body: { error: candidate.error ?? "artifact file name was rejected", fileName: sanitizeText(fileName) },
    };
  }

  const artifactsDir = resolveArtifactsDir(options);
  const filePath = path.resolve(artifactsDir, candidate.fileName);
  if (!isPathInside(artifactsDir, filePath)) {
    return {
      statusCode: 400,
      body: { error: "artifact file path traversal was rejected", fileName: candidate.fileName },
    };
  }

  if (!existsSync(filePath)) {
    return {
      statusCode: 404,
      body: { error: "artifact file was not found", fileName: candidate.fileName },
    };
  }

  const parsed = readArtifactJson(filePath);
  if (!parsed.ok) {
    return {
      statusCode: 422,
      body: { error: parsed.error ?? "artifact JSON is invalid", fileName: candidate.fileName },
    };
  }

  const summary = buildArtifactSummary(candidate.fileName, filePath, parsed.value);
  if (!summary.ok) {
    return {
      statusCode: 422,
      body: { error: summary.error, fileName: candidate.fileName },
    };
  }

  const record = toRecord(parsed.value) ?? {};
  return {
    statusCode: 200,
    body: {
      fileName: candidate.fileName,
      kind: summary.item.kind,
      summary: summary.item,
      detail: {
        adapterReportSummary: sanitizeJson(record.adapterReportSummary ?? null),
        validatorResult: sanitizeJson(record.validatorResult ?? null),
        mismatchSummary: sanitizeMismatchSummary(record.mismatchSummary),
        privacyWarnings: readStringArray(record.privacyWarnings).flatMap(sanitizePrivacyWarnings),
        indexSummary: buildIndexDetailSummary(record),
        comparisonSummary: buildComparisonDetailSummary(record),
        safety: {
          ...summary.item.safetyFlags,
          ...buildReadOnlySafety(),
        },
      },
    },
  };
}

function resolveArtifactsDir(options: HrcDryRunArtifactsReadOptions): string {
  return path.resolve(options.artifactsDir ?? path.resolve(process.cwd(), ARTIFACT_BASE_DIR_LABEL));
}

function validateArtifactFileName(
  fileName: string,
):
  | { ok: true; fileName: string }
  | {
      ok: false;
      reason:
        | "PATH_TRAVERSAL_REJECTED"
        | "ZIP_FILE_REJECTED"
        | "NON_JSON_FILE_REJECTED";
      error: string;
    } {
  if (
    fileName.length === 0 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes(":") ||
    fileName.split(/[\\/]+/).some((segment) => segment === "..") ||
    path.isAbsolute(fileName) ||
    path.basename(fileName) !== fileName
  ) {
    return {
      ok: false,
      reason: "PATH_TRAVERSAL_REJECTED",
      error: "artifact file name must be a basename under artifacts/hrc-dry-run-reports",
    };
  }

  if (path.extname(fileName).toLowerCase() === ".zip") {
    return {
      ok: false,
      reason: "ZIP_FILE_REJECTED",
      error: "zip files are not readable through the dry-run artifact API",
    };
  }

  if (path.extname(fileName).toLowerCase() !== ".json") {
    return {
      ok: false,
      reason: "NON_JSON_FILE_REJECTED",
      error: "artifact file name must end with .json",
    };
  }

  return { ok: true, fileName };
}

function readArtifactJson(
  filePath: string,
):
  | { ok: true; value: unknown }
  | { ok: false; reason: "MALFORMED_JSON" | "READ_FAILED"; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, "utf8")) as unknown };
  } catch (error) {
    return {
      ok: false,
      reason: "MALFORMED_JSON",
      error: `artifact JSON could not be parsed: ${error instanceof Error ? sanitizeText(error.message) : "unknown parse error"}`,
    };
  }
}

function buildArtifactSummary(
  fileName: string,
  filePath: string,
  value: unknown,
):
  | { ok: true; item: HrcDryRunArtifactListItem }
  | { ok: false; error: string } {
  const record = toRecord(value);
  if (!record) {
    return { ok: false, error: "artifact JSON must be an object" };
  }

  const kind = inferArtifactKind(record.sourceKind);
  if (kind === "UNKNOWN") {
    return { ok: false, error: "artifact sourceKind is not recognized" };
  }

  const stats = statSync(filePath);
  const safetyFlags = readSafetyFlags(record);
  return {
    ok: true,
    item: {
      fileName: sanitizeText(fileName),
      kind,
      generatedAt: readOptionalString(record.generatedAt),
      status: readOptionalString(record.status),
      zipFileNameSanitized: readOptionalString(record.zipFileNameSanitized),
      selectedNodeEntry: readOptionalString(record.selectedNodeEntry),
      privacySafe: readOptionalBoolean(record.privacySafe),
      validatorPass: readValidatorPass(record),
      warningsCount: readArray(record.warnings).length,
      errorsCount: readArray(record.errors).length,
      mismatchCount: readMismatchCount(record),
      safetyFlags,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    },
  };
}

function inferArtifactKind(sourceKind: unknown): HrcDryRunArtifactKind {
  if (sourceKind === REPORT_SOURCE_KIND) {
    return "REPORT";
  }
  if (sourceKind === INDEX_SOURCE_KIND) {
    return "INDEX";
  }
  if (sourceKind === COMPARISON_SOURCE_KIND) {
    return "COMPARISON";
  }
  return "UNKNOWN";
}

function buildIndexDetailSummary(record: Record<string, unknown>): unknown {
  if (inferArtifactKind(record.sourceKind) !== "INDEX") {
    return null;
  }
  return sanitizeJson({
    reportCount: record.reportCount,
    statusCounts: record.statusCounts,
    validatorPassCount: record.validatorPassCount,
    validatorFailCount: record.validatorFailCount,
    privacySafeCount: record.privacySafeCount,
    privacyWarningCount: record.privacyWarningCount,
    mismatchCountTotal: record.mismatchCountTotal,
    mismatchCategories: record.mismatchCategories,
    warningCountTotal: record.warningCountTotal,
    errorCountTotal: record.errorCountTotal,
    amountUnitCounts: record.amountUnitCounts,
  });
}

function buildComparisonDetailSummary(record: Record<string, unknown>): unknown {
  if (inferArtifactKind(record.sourceKind) !== "COMPARISON") {
    return null;
  }
  const rows = Array.isArray(record.rows) ? record.rows : [];
  return sanitizeJson({
    reportCount: record.reportCount,
    rowCount: rows.length,
    rowsSample: rows.slice(0, 10),
  });
}

function sanitizeMismatchSummary(value: unknown): unknown {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  return sanitizeJson({
    hasMismatch: record.hasMismatch,
    mismatchCount: record.mismatchCount,
    categories: record.categories,
    sample: readArray(record.sample).slice(0, 3),
    fatal: record.fatal,
  });
}

function readSafetyFlags(record: Record<string, unknown>): ArtifactSafetyFlags {
  return {
    rawZipCommitted: readOptionalBoolean(record.rawZipCommitted),
    productImportConnected: readOptionalBoolean(record.productImportConnected),
    dbWriteApplied: readOptionalBoolean(record.dbWriteApplied),
    apiUsed: readOptionalBoolean(record.apiUsed),
    uiUsed: readOptionalBoolean(record.uiUsed),
    multiNodeAggregationApplied: readOptionalBoolean(record.multiNodeAggregationApplied),
  };
}

function readValidatorPass(record: Record<string, unknown>): boolean | null {
  const validatorResult = toRecord(record.validatorResult);
  if (!validatorResult) {
    if (typeof record.validatorPassCount === "number") {
      return null;
    }
    return null;
  }
  return readOptionalBoolean(validatorResult.pass);
}

function readMismatchCount(record: Record<string, unknown>): number | null {
  const mismatchSummary = toRecord(record.mismatchSummary);
  if (mismatchSummary) {
    return readOptionalNumber(mismatchSummary.mismatchCount);
  }
  return readOptionalNumber(record.mismatchCountTotal);
}

function buildReadOnlySafety(): HrcDryRunArtifactSafetySummary {
  return {
    readOnly: true,
    dbWriteApplied: false,
    productImportConnected: false,
    batchRunnerExecuted: false,
    rawZipRead: false,
    uiUsed: false,
  };
}

function compareArtifactItems(
  left: HrcDryRunArtifactListItem,
  right: HrcDryRunArtifactListItem,
): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.fileName.localeCompare(right.fileName) ||
    (left.generatedAt ?? "").localeCompare(right.generatedAt ?? "")
  );
}

function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return null;
  }
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeJson(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value).slice(0, 80)) {
      result[sanitizeText(key)] = sanitizeJson(entry, depth + 1);
    }
    return result;
  }
  return null;
}

function sanitizePrivacyWarnings(value: string): string[] {
  const sanitized = sanitizeText(value);
  const warnings: string[] = [];

  if (sanitized.includes("<redacted-email>")) {
    warnings.push("privacy pattern detected: email");
  }
  if (sanitized.includes("<redacted-windows-path>")) {
    warnings.push("privacy pattern detected: windows-user-path");
  }
  if (sanitized.includes("<redacted-user>")) {
    warnings.push("privacy pattern detected: account-user-token");
  }
  return warnings.length > 0 ? Array.from(new Set(warnings)) : [sanitized];
}

function sanitizeText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "<redacted-email>")
    .replace(/C:\\Users\\[^\s"']*/gi, "<redacted-windows-path>")
    .replace(/C:\/Users\/[^\s"']*/gi, "<redacted-windows-path>")
    .replace(/\bsample-user\b/gi, "<redacted-user>")
    .replace(/\b(AppData|Desktop|Documents)\b/gi, "<redacted-path-token>")
    .replace(/\b(playerName|nickname|screenname|userName)\b/gi, "<redacted-field>");
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? sanitizeText(value)
    : null;
}

function readOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return readArray(value).filter((item): item is string => typeof item === "string");
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

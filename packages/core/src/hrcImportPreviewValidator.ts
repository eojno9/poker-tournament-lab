import type { HrcImportPreviewRow } from "./hrcImportPreviewContract.js";

export type HrcImportPreviewValidationStatus =
  | "READY_FOR_IMPORT_PREVIEW"
  | "BLOCKED_BY_PREVIEW_DECISION"
  | "MISSING_CANONICAL_KEY"
  | "DUPLICATE_IN_BATCH"
  | "DUPLICATE_EXISTING_DB"
  | "PRIVACY_BLOCKED"
  | "DB_WRITE_NOT_ALLOWED"
  | "EXCLUDED";

export interface HrcImportPreviewValidationInput {
  rows: HrcImportPreviewRow[];
  existingCanonicalKeys: string[];
  options?: {
    normalizeCanonicalKeys?: boolean;
  };
}

export interface HrcImportPreviewValidatedRow {
  row: HrcImportPreviewRow;
  validationStatus: HrcImportPreviewValidationStatus;
  canonicalKey: string | null;
  importPreviewAllowed: boolean;
  dbWriteAllowed: false;
  reasons: string[];
  warnings: string[];
}

export interface HrcImportPreviewValidationSummary {
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
}

export interface HrcImportDbWriteGuardResult {
  pass: boolean;
  dbWriteAllowedTrueCount: number;
  offendingRowIds: string[];
}

export function validateHrcImportPreviewRows(
  input: HrcImportPreviewValidationInput
): HrcImportPreviewValidatedRow[] {
  const normalize = input.options?.normalizeCanonicalKeys ?? true;
  const existingKeys = new Set(
    input.existingCanonicalKeys
      .map((key) => normalizeCanonicalKey(key, normalize))
      .filter((key): key is string => key !== null)
  );
  const batchKeyCounts = buildBatchKeyCounts(input.rows, normalize);

  return input.rows.map((row) => validateRow(row, existingKeys, batchKeyCounts, normalize));
}

export function summarizeHrcImportPreviewValidation(
  validatedRows: HrcImportPreviewValidatedRow[]
): HrcImportPreviewValidationSummary {
  return {
    total: validatedRows.length,
    readyForImportPreviewCount: countBy(
      validatedRows,
      (row) => row.validationStatus === "READY_FOR_IMPORT_PREVIEW"
    ),
    blockedByDecisionCount: countBy(
      validatedRows,
      (row) => row.validationStatus === "BLOCKED_BY_PREVIEW_DECISION"
    ),
    missingCanonicalKeyCount: countBy(
      validatedRows,
      (row) => row.validationStatus === "MISSING_CANONICAL_KEY"
    ),
    duplicateInBatchCount: countBy(validatedRows, (row) => row.validationStatus === "DUPLICATE_IN_BATCH"),
    duplicateExistingDbCount: countBy(
      validatedRows,
      (row) => row.validationStatus === "DUPLICATE_EXISTING_DB"
    ),
    privacyBlockedCount: countBy(validatedRows, (row) => row.validationStatus === "PRIVACY_BLOCKED"),
    excludedCount: countBy(validatedRows, (row) => row.validationStatus === "EXCLUDED"),
    importPreviewAllowedCount: countBy(validatedRows, (row) => row.importPreviewAllowed),
    dbWriteAllowedTrueCount: countBy(validatedRows, (row) => Boolean(row.row.dbWriteAllowed))
  };
}

export function assertNoHrcImportDbWriteAllowed(
  validatedRows: HrcImportPreviewValidatedRow[]
): HrcImportDbWriteGuardResult {
  const offendingRowIds = validatedRows
    .filter((row) => Boolean(row.row.dbWriteAllowed))
    .map((row) => row.row.id);

  return {
    pass: offendingRowIds.length === 0,
    dbWriteAllowedTrueCount: offendingRowIds.length,
    offendingRowIds
  };
}

function validateRow(
  row: HrcImportPreviewRow,
  existingKeys: Set<string>,
  batchKeyCounts: Map<string, number>,
  normalize: boolean
): HrcImportPreviewValidatedRow {
  const canonicalKey = normalizeCanonicalKey(row.canonicalKeyPreview, normalize);
  const warnings = [...row.warnings];

  if (row.classification === "EXCLUDE" || row.decision === "EXCLUDED") {
    return blockedRow(row, "EXCLUDED", canonicalKey, [
      "Candidate is excluded by v2.9 classification or preview decision."
    ], warnings);
  }

  if (!row.privacyPassed) {
    return blockedRow(row, "PRIVACY_BLOCKED", canonicalKey, [
      "Privacy/path safety did not pass for this preview row."
    ], warnings);
  }

  if (Boolean(row.dbWriteAllowed)) {
    return blockedRow(row, "DB_WRITE_NOT_ALLOWED", canonicalKey, [
      "DB write is not allowed in the v3.0 import preview validator."
    ], warnings);
  }

  if (row.decision !== "READY_FOR_IMPORT_PREVIEW" || !row.importAllowed) {
    return blockedRow(row, "BLOCKED_BY_PREVIEW_DECISION", canonicalKey, [
      "Preview contract decision does not allow import preview."
    ], warnings);
  }

  if (canonicalKey === null) {
    return blockedRow(row, "MISSING_CANONICAL_KEY", canonicalKey, [
      "Ready preview rows must include a canonical key preview."
    ], warnings);
  }

  if ((batchKeyCounts.get(canonicalKey) ?? 0) > 1) {
    return blockedRow(row, "DUPLICATE_IN_BATCH", canonicalKey, [
      "Canonical key preview duplicates another row in the current batch."
    ], warnings);
  }

  if (existingKeys.has(canonicalKey)) {
    return blockedRow(row, "DUPLICATE_EXISTING_DB", canonicalKey, [
      "Canonical key preview already exists in the externally supplied existing key snapshot."
    ], warnings);
  }

  return {
    row,
    validationStatus: "READY_FOR_IMPORT_PREVIEW",
    canonicalKey,
    importPreviewAllowed: true,
    dbWriteAllowed: false,
    reasons: ["Preview row is ready for import preview; DB write remains disabled."],
    warnings
  };
}

function blockedRow(
  row: HrcImportPreviewRow,
  validationStatus: Exclude<HrcImportPreviewValidationStatus, "READY_FOR_IMPORT_PREVIEW">,
  canonicalKey: string | null,
  reasons: string[],
  warnings: string[]
): HrcImportPreviewValidatedRow {
  return {
    row,
    validationStatus,
    canonicalKey,
    importPreviewAllowed: false,
    dbWriteAllowed: false,
    reasons,
    warnings
  };
}

function buildBatchKeyCounts(rows: HrcImportPreviewRow[], normalize: boolean): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const canonicalKey = normalizeCanonicalKey(row.canonicalKeyPreview, normalize);
    if (canonicalKey !== null) {
      counts.set(canonicalKey, (counts.get(canonicalKey) ?? 0) + 1);
    }
  }

  return counts;
}

function normalizeCanonicalKey(value: string | null | undefined, normalize: boolean): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return normalize ? trimmed.toLowerCase() : trimmed;
}

function countBy<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

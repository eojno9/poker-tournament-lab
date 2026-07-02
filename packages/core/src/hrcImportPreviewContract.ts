export type HrcImportCandidateClassification =
  | "IMPORT_CANDIDATE"
  | "NEEDS_MANUAL_REVIEW"
  | "HOLD"
  | "EXCLUDE";

export type HrcImportPreviewDecision =
  | "READY_FOR_IMPORT_PREVIEW"
  | "MANUAL_REVIEW_REQUIRED"
  | "HOLD"
  | "EXCLUDED";

export type HrcImportPreviewRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "BLOCKED";

export type HrcImportPreviewSourceKind = "V2_9_CLASSIFICATION_REPORT" | "ARTIFACT_SUMMARY" | "MANUAL_ENTRY";

export interface HrcImportPreviewDecisionInput {
  classification: HrcImportCandidateClassification;
  dryRunSucceeded: boolean;
  privacyPassed: boolean;
  dashboardReviewed: boolean;
}

export interface HrcImportPreviewDecisionResult {
  decision: HrcImportPreviewDecision;
  riskLevel: HrcImportPreviewRiskLevel;
  reason: string;
  nextAction: string;
  importAllowed: boolean;
  dbWriteAllowed: false;
  warnings: string[];
}

export interface HrcImportPreviewRowInput extends HrcImportPreviewDecisionInput {
  id: string;
  zipFileNameSanitized: string;
  canonicalKeyPreview?: string | null;
  artifactReportAvailable?: boolean;
  sourceKind?: HrcImportPreviewSourceKind;
  sourceVersion?: string;
  warnings?: string[];
}

export interface HrcImportPreviewRow {
  id: string;
  zipFileNameSanitized: string;
  canonicalKeyPreview: string | null;
  classification: HrcImportCandidateClassification;
  decision: HrcImportPreviewDecision;
  riskLevel: HrcImportPreviewRiskLevel;
  reason: string;
  nextAction: string;
  dryRunSucceeded: boolean;
  privacyPassed: boolean;
  dashboardReviewed: boolean;
  artifactReportAvailable: boolean;
  importAllowed: boolean;
  dbWriteAllowed: false;
  sourceKind: HrcImportPreviewSourceKind;
  sourceVersion: string;
  warnings: string[];
}

export interface HrcImportPreviewSummary {
  total: number;
  readyForImportPreviewCount: number;
  manualReviewRequiredCount: number;
  holdCount: number;
  excludedCount: number;
  lowRiskCount: number;
  mediumRiskCount: number;
  highRiskCount: number;
  blockedRiskCount: number;
  dbWriteAllowedTrueCount: number;
  importAllowedCount: number;
}

export function classifyHrcImportPreviewDecision(
  input: HrcImportPreviewDecisionInput
): HrcImportPreviewDecisionResult {
  const warnings: string[] = [];

  if (!input.privacyPassed) {
    warnings.push("privacy scan did not pass");
    return {
      decision: input.classification === "EXCLUDE" ? "EXCLUDED" : "MANUAL_REVIEW_REQUIRED",
      riskLevel: "BLOCKED",
      reason: "Privacy/path safety must pass before an import preview candidate can advance.",
      nextAction: "Resolve privacy/path review before considering import preview.",
      importAllowed: false,
      dbWriteAllowed: false,
      warnings
    };
  }

  if (input.classification === "EXCLUDE") {
    return {
      decision: "EXCLUDED",
      riskLevel: "BLOCKED",
      reason: "v2.9 classification excluded this candidate from product import consideration.",
      nextAction: "Do not import unless a later review explicitly reclassifies the candidate.",
      importAllowed: false,
      dbWriteAllowed: false,
      warnings
    };
  }

  if (input.classification === "HOLD") {
    return {
      decision: "HOLD",
      riskLevel: "HIGH",
      reason: "v2.9 classification placed this candidate on hold.",
      nextAction: "Keep out of import preview until hold conditions are resolved.",
      importAllowed: false,
      dbWriteAllowed: false,
      warnings
    };
  }

  if (!input.dryRunSucceeded) {
    warnings.push("dry-run did not succeed");
    return {
      decision: "MANUAL_REVIEW_REQUIRED",
      riskLevel: "MEDIUM",
      reason: "Dry-run failure prevents the candidate from being ready for import preview.",
      nextAction: "Review dry-run failure and reclassify before import preview.",
      importAllowed: false,
      dbWriteAllowed: false,
      warnings
    };
  }

  if (!input.dashboardReviewed) {
    warnings.push("dashboard review is incomplete");
    return {
      decision: "MANUAL_REVIEW_REQUIRED",
      riskLevel: "MEDIUM",
      reason: "Dashboard review must be complete before import preview readiness.",
      nextAction: "Complete read-only dashboard review.",
      importAllowed: false,
      dbWriteAllowed: false,
      warnings
    };
  }

  if (input.classification === "NEEDS_MANUAL_REVIEW") {
    return {
      decision: "MANUAL_REVIEW_REQUIRED",
      riskLevel: "MEDIUM",
      reason: "v2.9 classification requires manual review before import preview.",
      nextAction: "Resolve manual-review questions and reclassify if appropriate.",
      importAllowed: false,
      dbWriteAllowed: false,
      warnings
    };
  }

  return {
    decision: "READY_FOR_IMPORT_PREVIEW",
    riskLevel: "LOW",
    reason: "v2.9 classification and safety reviews support product import preview readiness.",
    nextAction: "Build preview rows only; require a separate explicit gate before any DB write.",
    importAllowed: true,
    dbWriteAllowed: false,
    warnings
  };
}

export function buildHrcImportPreviewRow(input: HrcImportPreviewRowInput): HrcImportPreviewRow {
  const result = classifyHrcImportPreviewDecision(input);

  return {
    id: input.id,
    zipFileNameSanitized: input.zipFileNameSanitized,
    canonicalKeyPreview: input.canonicalKeyPreview ?? null,
    classification: input.classification,
    decision: result.decision,
    riskLevel: result.riskLevel,
    reason: result.reason,
    nextAction: result.nextAction,
    dryRunSucceeded: input.dryRunSucceeded,
    privacyPassed: input.privacyPassed,
    dashboardReviewed: input.dashboardReviewed,
    artifactReportAvailable: input.artifactReportAvailable ?? false,
    importAllowed: result.importAllowed,
    dbWriteAllowed: false,
    sourceKind: input.sourceKind ?? "MANUAL_ENTRY",
    sourceVersion: input.sourceVersion ?? "v3.0-step2",
    warnings: [...(input.warnings ?? []), ...result.warnings]
  };
}

export function summarizeHrcImportPreviewRows(rows: HrcImportPreviewRow[]): HrcImportPreviewSummary {
  return {
    total: rows.length,
    readyForImportPreviewCount: countBy(rows, (row) => row.decision === "READY_FOR_IMPORT_PREVIEW"),
    manualReviewRequiredCount: countBy(rows, (row) => row.decision === "MANUAL_REVIEW_REQUIRED"),
    holdCount: countBy(rows, (row) => row.decision === "HOLD"),
    excludedCount: countBy(rows, (row) => row.decision === "EXCLUDED"),
    lowRiskCount: countBy(rows, (row) => row.riskLevel === "LOW"),
    mediumRiskCount: countBy(rows, (row) => row.riskLevel === "MEDIUM"),
    highRiskCount: countBy(rows, (row) => row.riskLevel === "HIGH"),
    blockedRiskCount: countBy(rows, (row) => row.riskLevel === "BLOCKED"),
    dbWriteAllowedTrueCount: countBy(rows, (row) => Boolean(row.dbWriteAllowed)),
    importAllowedCount: countBy(rows, (row) => row.importAllowed)
  };
}

function countBy<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.filter(predicate).length;
}

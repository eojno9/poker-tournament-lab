import type {
  HrcCopiedDbRehearsalApprovalDecision,
  HrcCopiedDbRehearsalGuardResult,
  HrcCopiedDbRehearsalTargetKind,
  HrcCopiedDbRehearsalTargetLocationKind
} from "./hrcCopiedDbRehearsalGuard.js";

export interface HrcCopiedDbRehearsalPlanTargetSummary {
  targetKind: HrcCopiedDbRehearsalTargetKind;
  targetLocationKind: HrcCopiedDbRehearsalTargetLocationKind;
  targetPathRedacted: string;
}

export interface HrcCopiedDbRehearsalPlanGuardDecision {
  guardPassed: boolean;
  rehearsalAllowed: boolean;
  dryRunOnlyAllowed: boolean;
  copiedDbWriteAllowed: boolean;
  productionDbWriteAllowed: boolean;
  blockedReasons: string[];
  warnings: string[];
  requiredNextChecks: string[];
}

export interface HrcCopiedDbRehearsalPlanValidationSummary {
  previewValidationPassed: boolean;
  duplicateValidationPassed: boolean;
  importPreviewAllowed: number;
  blockedCount: number;
}

export interface HrcCopiedDbRehearsalPlanShaSummary {
  originalDbShaBefore: string;
  originalDbShaAfter: string;
  copiedDbShaBefore: string;
}

export interface HrcCopiedDbRehearsalPlanRollbackPlan {
  rollbackPlanProvided: boolean;
  rollbackVerificationRequired: boolean;
}

export interface HrcCopiedDbRehearsalPlanReportPolicy {
  reportFileWriteAllowed: boolean;
  consoleSummaryAllowed: boolean;
}

export interface HrcCopiedDbRehearsalPlanBuilderInput {
  rehearsalId: string;
  targetSummary: HrcCopiedDbRehearsalPlanTargetSummary;
  approvalDecision: HrcCopiedDbRehearsalApprovalDecision;
  guardDecision: HrcCopiedDbRehearsalPlanGuardDecision;
  validationSummary: HrcCopiedDbRehearsalPlanValidationSummary;
  shaSummary: HrcCopiedDbRehearsalPlanShaSummary;
  rollbackPlan: HrcCopiedDbRehearsalPlanRollbackPlan;
  reportPolicy: HrcCopiedDbRehearsalPlanReportPolicy;
}

export type HrcCopiedDbRehearsalPlanStatus =
  | "READY_FOR_DRY_RUN"
  | "READY_FOR_COPIED_DB_WRITE_REHEARSAL"
  | "BLOCKED";

export type HrcCopiedDbRehearsalPlanStep =
  | "PRECHECK"
  | "VALIDATE_PREVIEW"
  | "VALIDATE_DUPLICATES"
  | "VERIFY_ORIGINAL_DB_SHA"
  | "VERIFY_COPIED_DB_SHA"
  | "APPLY_TO_COPIED_DB_REHEARSAL"
  | "VERIFY_ROLLBACK_PLAN"
  | "POST_REHEARSAL_DIFF"
  | "CLEANUP";

export interface HrcCopiedDbRehearsalPlan {
  planVersion: "v3.1-copied-db-rehearsal-plan-preview";
  rehearsalId: string;
  targetSummary: HrcCopiedDbRehearsalPlanTargetSummary;
  status: HrcCopiedDbRehearsalPlanStatus;
  dryRunOnly: boolean;
  copiedDbWriteRehearsalAllowed: boolean;
  productionDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  consoleSummaryAllowed: boolean;
  steps: HrcCopiedDbRehearsalPlanStep[];
  blockedReasons: string[];
  warnings: string[];
  requiredNextChecks: string[];
}

export function buildHrcCopiedDbRehearsalPlan(
  input: HrcCopiedDbRehearsalPlanBuilderInput
): HrcCopiedDbRehearsalPlan {
  const blockedReasons = buildBlockedReasons(input).map(redactHrcCopiedDbRehearsalPlanPrivateTokens);
  const warnings = buildWarnings(input).map(redactHrcCopiedDbRehearsalPlanPrivateTokens);
  const readyForCopiedDbWriteRehearsal =
    blockedReasons.length === 0 &&
    input.guardDecision.rehearsalAllowed &&
    input.approvalDecision.approved &&
    input.approvalDecision.writeAllowed &&
    input.approvalDecision.copiedDbWriteAllowed;
  const readyForDryRun =
    blockedReasons.length === 0 &&
    input.guardDecision.dryRunOnlyAllowed &&
    input.approvalDecision.dryRunAllowed &&
    !input.approvalDecision.writeAllowed &&
    !input.approvalDecision.copiedDbWriteAllowed &&
    !input.approvalDecision.productionDbWriteAllowed;
  const status = getPlanStatus(readyForCopiedDbWriteRehearsal, readyForDryRun);

  return {
    planVersion: "v3.1-copied-db-rehearsal-plan-preview",
    rehearsalId: redactHrcCopiedDbRehearsalPlanPrivateTokens(input.rehearsalId),
    targetSummary: {
      targetKind: input.targetSummary.targetKind,
      targetLocationKind: input.targetSummary.targetLocationKind,
      targetPathRedacted: redactHrcCopiedDbRehearsalPlanPrivateTokens(input.targetSummary.targetPathRedacted)
    },
    status,
    dryRunOnly: status === "READY_FOR_DRY_RUN",
    copiedDbWriteRehearsalAllowed: status === "READY_FOR_COPIED_DB_WRITE_REHEARSAL",
    productionDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    consoleSummaryAllowed: input.reportPolicy.consoleSummaryAllowed,
    steps: buildPlanSteps(status),
    blockedReasons,
    warnings,
    requiredNextChecks: buildRequiredNextChecks(input, status, blockedReasons).map(
      redactHrcCopiedDbRehearsalPlanPrivateTokens
    )
  };
}

export function buildHrcCopiedDbRehearsalPlanGuardDecision(
  guardResult: Pick<
    HrcCopiedDbRehearsalGuardResult,
    | "guardPassed"
    | "rehearsalAllowed"
    | "dryRunOnlyAllowed"
    | "copiedDbWriteAllowed"
    | "productionDbWriteAllowed"
    | "blockedReasons"
    | "warnings"
    | "requiredNextChecks"
  >
): HrcCopiedDbRehearsalPlanGuardDecision {
  return {
    guardPassed: guardResult.guardPassed,
    rehearsalAllowed: guardResult.rehearsalAllowed,
    dryRunOnlyAllowed: guardResult.dryRunOnlyAllowed,
    copiedDbWriteAllowed: guardResult.copiedDbWriteAllowed,
    productionDbWriteAllowed: guardResult.productionDbWriteAllowed,
    blockedReasons: guardResult.blockedReasons,
    warnings: guardResult.warnings,
    requiredNextChecks: guardResult.requiredNextChecks
  };
}

export function assertNoHrcCopiedDbRehearsalPlanForbiddenExposure(plan: HrcCopiedDbRehearsalPlan): boolean {
  return !containsHrcCopiedDbRehearsalPlanForbiddenToken(JSON.stringify(plan));
}

function buildBlockedReasons(input: HrcCopiedDbRehearsalPlanBuilderInput): string[] {
  const blockedReasons: string[] = [];

  if (!input.guardDecision.guardPassed) {
    blockedReasons.push("rehearsal guard did not pass");
  }
  if (input.approvalDecision.productionDbWriteAllowed || input.guardDecision.productionDbWriteAllowed) {
    blockedReasons.push("production DB write is forbidden");
  }
  if (input.reportPolicy.reportFileWriteAllowed) {
    blockedReasons.push("report file write is disabled for this planning step");
  }
  if (input.shaSummary.originalDbShaBefore.trim().length === 0 || input.shaSummary.originalDbShaAfter.trim().length === 0) {
    blockedReasons.push("original DB SHA before and after must be present");
  } else if (input.shaSummary.originalDbShaBefore !== input.shaSummary.originalDbShaAfter) {
    blockedReasons.push("original DB SHA before and after must match");
  }
  if (input.shaSummary.copiedDbShaBefore.trim().length === 0) {
    blockedReasons.push("copied DB SHA baseline must be present");
  }
  if (!input.validationSummary.previewValidationPassed) {
    blockedReasons.push("preview validation must pass");
  }
  if (!input.validationSummary.duplicateValidationPassed) {
    blockedReasons.push("duplicate and canonical key validation must pass");
  }
  if (input.validationSummary.blockedCount > 0) {
    blockedReasons.push("validation blocked count must be zero");
  }
  if (!input.rollbackPlan.rollbackPlanProvided) {
    blockedReasons.push("rollback plan must be provided");
  }
  if (!input.rollbackPlan.rollbackVerificationRequired) {
    blockedReasons.push("rollback verification must be required");
  }
  if (!input.guardDecision.rehearsalAllowed && !input.guardDecision.dryRunOnlyAllowed) {
    blockedReasons.push("plan is neither copied DB rehearsal ready nor dry-run only ready");
  }
  if (input.guardDecision.rehearsalAllowed && !input.approvalDecision.approved) {
    blockedReasons.push("approval decision must be approved for copied DB rehearsal");
  }
  if (input.guardDecision.rehearsalAllowed && !input.approvalDecision.copiedDbWriteAllowed) {
    blockedReasons.push("approval decision must allow future copied DB write rehearsal");
  }

  return [...blockedReasons, ...input.guardDecision.blockedReasons, ...input.approvalDecision.blockedReasons];
}

function buildWarnings(input: HrcCopiedDbRehearsalPlanBuilderInput): string[] {
  const warnings = [...input.approvalDecision.warnings, ...input.guardDecision.warnings];

  if (input.validationSummary.importPreviewAllowed === 0) {
    warnings.push("import preview allowed count is zero");
  }
  if (input.reportPolicy.consoleSummaryAllowed) {
    warnings.push("console summary is allowed, but file report writing remains disabled");
  }

  return warnings;
}

function getPlanStatus(
  readyForCopiedDbWriteRehearsal: boolean,
  readyForDryRun: boolean
): HrcCopiedDbRehearsalPlanStatus {
  if (readyForCopiedDbWriteRehearsal) {
    return "READY_FOR_COPIED_DB_WRITE_REHEARSAL";
  }

  if (readyForDryRun) {
    return "READY_FOR_DRY_RUN";
  }

  return "BLOCKED";
}

function buildPlanSteps(status: HrcCopiedDbRehearsalPlanStatus): HrcCopiedDbRehearsalPlanStep[] {
  const preWriteSteps: HrcCopiedDbRehearsalPlanStep[] = [
    "PRECHECK",
    "VALIDATE_PREVIEW",
    "VALIDATE_DUPLICATES",
    "VERIFY_ORIGINAL_DB_SHA",
    "VERIFY_COPIED_DB_SHA",
    "VERIFY_ROLLBACK_PLAN"
  ];

  if (status === "READY_FOR_COPIED_DB_WRITE_REHEARSAL") {
    return [...preWriteSteps, "APPLY_TO_COPIED_DB_REHEARSAL", "POST_REHEARSAL_DIFF", "CLEANUP"];
  }

  if (status === "READY_FOR_DRY_RUN") {
    return [...preWriteSteps, "POST_REHEARSAL_DIFF", "CLEANUP"];
  }

  return preWriteSteps;
}

function buildRequiredNextChecks(
  input: HrcCopiedDbRehearsalPlanBuilderInput,
  status: HrcCopiedDbRehearsalPlanStatus,
  blockedReasons: string[]
): string[] {
  if (status === "READY_FOR_COPIED_DB_WRITE_REHEARSAL") {
    return [
      ...input.guardDecision.requiredNextChecks,
      "execute only inside an approved restore-test or backup-root rehearsal folder",
      "record post-rehearsal copied DB SHA",
      "verify rollback before any stable decision"
    ];
  }

  if (status === "READY_FOR_DRY_RUN") {
    return [
      ...input.guardDecision.requiredNextChecks,
      "run dry-run validation only",
      "collect explicit copied DB write approval before any write-capable rehearsal"
    ];
  }

  if (blockedReasons.length > 0) {
    return ["resolve blocked reasons before building a copied DB rehearsal plan"];
  }

  return [];
}

function redactHrcCopiedDbRehearsalPlanPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

function containsHrcCopiedDbRehearsalPlanForbiddenToken(value: string): boolean {
  return /C:\\Users|sample-user|sample-private-token|@privaterelay\.appleid\.com|sample-external-hrc-folder|raw hrc/i.test(
    value
  );
}

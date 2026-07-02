import type { HrcCopiedDbPathGuardResult } from "./hrcCopiedDbPathGuard.js";
import {
  buildHrcCopiedDbRehearsalApprovalDecisionFromContract,
  buildHrcCopiedDbRehearsalGuard,
  type HrcCopiedDbRehearsalGuardResult,
  type HrcCopiedDbRehearsalTargetKind,
  type HrcCopiedDbRehearsalTargetLocationKind
} from "./hrcCopiedDbRehearsalGuard.js";
import {
  buildHrcCopiedDbRehearsalPlan,
  buildHrcCopiedDbRehearsalPlanGuardDecision,
  type HrcCopiedDbRehearsalPlan,
  type HrcCopiedDbRehearsalPlanGuardDecision
} from "./hrcCopiedDbRehearsalPlanBuilder.js";
import {
  buildHrcCopiedDbRehearsalReport,
  summarizeHrcCopiedDbRehearsalReport,
  type HrcCopiedDbRehearsalReport,
  type HrcCopiedDbRehearsalReportExecutionSummary,
  type HrcCopiedDbRehearsalReportExitCode,
  type HrcCopiedDbRehearsalReportSafetySummary
} from "./hrcCopiedDbRehearsalReport.js";
import {
  buildHrcCopiedDbTargetApprovalContract,
  summarizeHrcCopiedDbTargetApprovalContract,
  type HrcCopiedDbTargetApprovalContract,
  type HrcCopiedDbTargetApprovalContractInput,
  type HrcCopiedDbTargetApprovalMode,
  type HrcCopiedDbTargetApprovalOperation
} from "./hrcCopiedDbTargetApprovalContract.js";

export interface HrcCopiedDbRehearsalDryRunTargetSummary {
  targetKind: HrcCopiedDbRehearsalTargetKind;
  targetLocationKind: HrcCopiedDbRehearsalTargetLocationKind;
  targetPathRedacted: string;
  copiedDbPathGuardResult: Pick<
    HrcCopiedDbPathGuardResult,
    "allowed" | "decision" | "normalizedTargetDbPathRedacted" | "reasons" | "warnings"
  >;
}

export interface HrcCopiedDbRehearsalDryRunApprovalInput {
  requestedOperation: HrcCopiedDbTargetApprovalOperation;
  approvalMode: HrcCopiedDbTargetApprovalMode;
  approvalFlagPresent?: boolean;
  approvalToken?: string;
  expectedApprovalToken?: string;
  copiedDbWriteRequested: boolean;
  productionDbWriteRequested: boolean;
  schemaMigrationRequested: boolean;
  productImportRouteConnectionRequested: boolean;
  apiUiImportFlowRequested: boolean;
  packageScriptRequested: boolean;
  rawHrcAccessRequested: boolean;
  reportJsonWriteRequested: boolean;
}

export interface HrcCopiedDbRehearsalDryRunValidationSummary {
  previewValidationPassed: boolean;
  duplicateValidationPassed: boolean;
  previewRows: number;
  importPreviewAllowed: number;
  blockedCount: number;
  duplicateExistingDbCount: number;
  duplicateInBatchCount: number;
  missingCanonicalKeyCount: number;
}

export interface HrcCopiedDbRehearsalDryRunShaSummary {
  originalDbShaBefore: string;
  originalDbShaAfter: string;
  copiedDbShaBefore: string;
  copiedDbShaAfter?: string;
  rollbackDbSha?: string;
}

export interface HrcCopiedDbRehearsalDryRunSafetyInput {
  rollbackPlanProvided: boolean;
  rollbackVerificationRequired: boolean;
  privacyScanPassed: boolean;
  backupManifestAvailable: boolean;
  sourceArchiveDbInjectionPolicyAcknowledged: boolean;
  rawZipAbsent: boolean;
  artifactReportsAbsent: boolean;
  productRouteDisconnected: boolean;
  apiUiRuntimeUnchanged: boolean;
}

export interface HrcCopiedDbRehearsalDryRunReportPolicy {
  reportFileWriteAllowed: boolean;
  consoleSummaryAllowed: boolean;
}

export interface HrcCopiedDbRehearsalDryRunOrchestratorInput {
  rehearsalId: string;
  targetSummary: HrcCopiedDbRehearsalDryRunTargetSummary;
  approval: HrcCopiedDbRehearsalDryRunApprovalInput;
  validationSummary: HrcCopiedDbRehearsalDryRunValidationSummary;
  shaSummary: HrcCopiedDbRehearsalDryRunShaSummary;
  safety: HrcCopiedDbRehearsalDryRunSafetyInput;
  executionSummary: HrcCopiedDbRehearsalReportExecutionSummary;
  reportPolicy: HrcCopiedDbRehearsalDryRunReportPolicy;
}

export interface HrcCopiedDbRehearsalDryRunSummary {
  rehearsalId: string;
  status: HrcCopiedDbRehearsalReport["status"];
  exitCode: HrcCopiedDbRehearsalReportExitCode;
  approvalOk: boolean;
  guardPassed: boolean;
  planStatus: HrcCopiedDbRehearsalPlan["status"];
  reportStatus: HrcCopiedDbRehearsalReport["status"];
  canDryRun: boolean;
  canCopiedDbWriteRehearsal: boolean;
  productionDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  orchestratorDbWritePerformed: false;
  orchestratorReportJsonWritten: false;
  blockedReasonCount: number;
  warningCount: number;
}

export interface HrcCopiedDbRehearsalDryRunResult {
  version: "v3.1-copied-db-rehearsal-dry-run-orchestrator";
  rehearsalId: string;
  approvalContract: HrcCopiedDbTargetApprovalContract;
  guard: HrcCopiedDbRehearsalGuardResult;
  plan: HrcCopiedDbRehearsalPlan;
  report: HrcCopiedDbRehearsalReport;
  summary: HrcCopiedDbRehearsalDryRunSummary;
  productionDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  orchestratorDbCopyPerformed: false;
  orchestratorDbWritePerformed: false;
  orchestratorReportJsonWritten: false;
}

export function buildHrcCopiedDbRehearsalDryRunResult(
  input: HrcCopiedDbRehearsalDryRunOrchestratorInput
): HrcCopiedDbRehearsalDryRunResult {
  const approvalContract = buildHrcCopiedDbTargetApprovalContract(buildApprovalContractInput(input));
  const approvalDecision = buildHrcCopiedDbRehearsalApprovalDecisionFromContract(approvalContract);
  const guard = buildHrcCopiedDbRehearsalGuard({
    targetKind: input.targetSummary.targetKind,
    targetLocationKind: input.targetSummary.targetLocationKind,
    approvalDecision,
    dbSha: {
      originalDbShaBefore: input.shaSummary.originalDbShaBefore,
      originalDbShaAfter: input.shaSummary.originalDbShaAfter,
      copiedDbShaBefore: input.shaSummary.copiedDbShaBefore
    },
    rehearsalInputs: {
      previewValidationPassed: input.validationSummary.previewValidationPassed,
      duplicateValidationPassed: input.validationSummary.duplicateValidationPassed,
      rollbackPlanProvided: input.safety.rollbackPlanProvided,
      privacyScanPassed: input.safety.privacyScanPassed,
      backupManifestAvailable: input.safety.backupManifestAvailable,
      sourceArchiveDbInjectionPolicyAcknowledged: input.safety.sourceArchiveDbInjectionPolicyAcknowledged
    }
  });
  const plan = buildHrcCopiedDbRehearsalPlan({
    rehearsalId: input.rehearsalId,
    targetSummary: {
      targetKind: input.targetSummary.targetKind,
      targetLocationKind: input.targetSummary.targetLocationKind,
      targetPathRedacted: input.targetSummary.targetPathRedacted
    },
    approvalDecision,
    guardDecision: buildPlanGuardDecision(approvalContract, guard),
    validationSummary: {
      previewValidationPassed: input.validationSummary.previewValidationPassed,
      duplicateValidationPassed: input.validationSummary.duplicateValidationPassed,
      importPreviewAllowed: input.validationSummary.importPreviewAllowed,
      blockedCount: input.validationSummary.blockedCount
    },
    shaSummary: {
      originalDbShaBefore: input.shaSummary.originalDbShaBefore,
      originalDbShaAfter: input.shaSummary.originalDbShaAfter,
      copiedDbShaBefore: input.shaSummary.copiedDbShaBefore
    },
    rollbackPlan: {
      rollbackPlanProvided: input.safety.rollbackPlanProvided,
      rollbackVerificationRequired: input.safety.rollbackVerificationRequired
    },
    reportPolicy: input.reportPolicy
  });
  const report = buildHrcCopiedDbRehearsalReport({
    rehearsalId: input.rehearsalId,
    plan,
    counts: {
      previewRows: input.validationSummary.previewRows,
      importPreviewAllowed: input.validationSummary.importPreviewAllowed,
      blockedCount: input.validationSummary.blockedCount,
      duplicateExistingDbCount: input.validationSummary.duplicateExistingDbCount,
      duplicateInBatchCount: input.validationSummary.duplicateInBatchCount,
      missingCanonicalKeyCount: input.validationSummary.missingCanonicalKeyCount
    },
    shaSummary: buildReportShaSummary(input.shaSummary),
    safetySummary: buildReportSafetySummary(input.safety),
    executionSummary: input.executionSummary
  });

  return {
    version: "v3.1-copied-db-rehearsal-dry-run-orchestrator",
    rehearsalId: report.rehearsalId,
    approvalContract,
    guard,
    plan,
    report,
    summary: buildSummary(approvalContract, guard, plan, report),
    productionDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    orchestratorDbCopyPerformed: false,
    orchestratorDbWritePerformed: false,
    orchestratorReportJsonWritten: false
  };
}

function buildApprovalContractInput(
  input: HrcCopiedDbRehearsalDryRunOrchestratorInput
): HrcCopiedDbTargetApprovalContractInput {
  const approvalContractInput: HrcCopiedDbTargetApprovalContractInput = {
    rehearsalId: input.rehearsalId,
    requestedOperation: input.approval.requestedOperation,
    approvalMode: input.approval.approvalMode,
    copiedDbPathGuardResult: input.targetSummary.copiedDbPathGuardResult,
    copiedDbWriteRequested: input.approval.copiedDbWriteRequested,
    productionDbWriteRequested: input.approval.productionDbWriteRequested,
    schemaMigrationRequested: input.approval.schemaMigrationRequested,
    productImportRouteConnectionRequested: input.approval.productImportRouteConnectionRequested,
    apiUiImportFlowRequested: input.approval.apiUiImportFlowRequested,
    packageScriptRequested: input.approval.packageScriptRequested,
    rawHrcAccessRequested: input.approval.rawHrcAccessRequested,
    reportJsonWriteRequested: input.approval.reportJsonWriteRequested
  };

  if (typeof input.approval.approvalFlagPresent === "boolean") {
    approvalContractInput.approvalFlagPresent = input.approval.approvalFlagPresent;
  }
  if (typeof input.approval.approvalToken === "string") {
    approvalContractInput.approvalToken = input.approval.approvalToken;
  }
  if (typeof input.approval.expectedApprovalToken === "string") {
    approvalContractInput.expectedApprovalToken = input.approval.expectedApprovalToken;
  }

  return approvalContractInput;
}

function buildPlanGuardDecision(
  approvalContract: HrcCopiedDbTargetApprovalContract,
  guard: HrcCopiedDbRehearsalGuardResult
): HrcCopiedDbRehearsalPlanGuardDecision {
  const guardDecision = buildHrcCopiedDbRehearsalPlanGuardDecision(guard);

  if (
    approvalContract.decision === "PREVIEW_ONLY_NO_APPROVAL_REQUIRED" &&
    guard.dryRunOnlyAllowed &&
    !guard.rehearsalAllowed
  ) {
    return {
      ...guardDecision,
      guardPassed: true,
      blockedReasons: []
    };
  }

  return guardDecision;
}

export function assertNoHrcCopiedDbRehearsalDryRunForbiddenExposure(
  result: HrcCopiedDbRehearsalDryRunResult
): boolean {
  return !containsHrcCopiedDbRehearsalDryRunForbiddenToken(JSON.stringify(result));
}

function buildReportShaSummary(
  shaSummary: HrcCopiedDbRehearsalDryRunShaSummary
): HrcCopiedDbRehearsalReport["shaSummary"] {
  const reportShaSummary: HrcCopiedDbRehearsalReport["shaSummary"] = {
    originalDbShaBefore: shaSummary.originalDbShaBefore,
    originalDbShaAfter: shaSummary.originalDbShaAfter,
    copiedDbShaBefore: shaSummary.copiedDbShaBefore
  };

  if (typeof shaSummary.copiedDbShaAfter === "string") {
    reportShaSummary.copiedDbShaAfter = shaSummary.copiedDbShaAfter;
  }
  if (typeof shaSummary.rollbackDbSha === "string") {
    reportShaSummary.rollbackDbSha = shaSummary.rollbackDbSha;
  }

  return reportShaSummary;
}

function buildReportSafetySummary(
  safety: HrcCopiedDbRehearsalDryRunSafetyInput
): HrcCopiedDbRehearsalReportSafetySummary {
  return {
    privacyScanPassed: safety.privacyScanPassed,
    rawZipAbsent: safety.rawZipAbsent,
    artifactReportsAbsent: safety.artifactReportsAbsent,
    productRouteDisconnected: safety.productRouteDisconnected,
    apiUiRuntimeUnchanged: safety.apiUiRuntimeUnchanged
  };
}

function buildSummary(
  approvalContract: HrcCopiedDbTargetApprovalContract,
  guard: HrcCopiedDbRehearsalGuardResult,
  plan: HrcCopiedDbRehearsalPlan,
  report: HrcCopiedDbRehearsalReport
): HrcCopiedDbRehearsalDryRunSummary {
  const reportSummary = summarizeHrcCopiedDbRehearsalReport(report);
  const approvalSummary = summarizeHrcCopiedDbTargetApprovalContract(approvalContract);

  return {
    rehearsalId: report.rehearsalId,
    status: report.status,
    exitCode: report.exitCode,
    approvalOk: approvalSummary.ok,
    guardPassed: guard.guardPassed,
    planStatus: plan.status,
    reportStatus: report.status,
    canDryRun: reportSummary.canDryRun,
    canCopiedDbWriteRehearsal: reportSummary.canCopiedDbWriteRehearsal,
    productionDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    orchestratorDbWritePerformed: false,
    orchestratorReportJsonWritten: false,
    blockedReasonCount: reportSummary.blockedReasonCount,
    warningCount: reportSummary.warningCount
  };
}

function containsHrcCopiedDbRehearsalDryRunForbiddenToken(value: string): boolean {
  return /C:\\Users|sample-user|sample-private-token|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|sample-external-hrc-folder|raw hrc/i.test(
    value
  );
}

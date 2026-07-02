import type { HrcCopiedDbTargetApprovalContract } from "./hrcCopiedDbTargetApprovalContract.js";

export type HrcCopiedDbRehearsalTargetKind = "COPIED_DB" | "PRODUCTION_DB" | "REPO_LOCAL_DB" | "UNKNOWN";

export type HrcCopiedDbRehearsalTargetLocationKind =
  | "RESTORE_TEST"
  | "BACKUP_ROOT_REHEARSAL"
  | "PROJECT_REPO"
  | "PRODUCTION"
  | "UNKNOWN";

export interface HrcCopiedDbRehearsalApprovalDecision {
  approved: boolean;
  writeAllowed: boolean;
  copiedDbWriteAllowed: boolean;
  productionDbWriteAllowed: boolean;
  dryRunAllowed: boolean;
  blockedReasons: string[];
  warnings: string[];
}

export interface HrcCopiedDbRehearsalDbShaInput {
  originalDbShaBefore: string;
  originalDbShaAfter: string;
  copiedDbShaBefore: string;
}

export interface HrcCopiedDbRehearsalInputs {
  previewValidationPassed: boolean;
  duplicateValidationPassed: boolean;
  rollbackPlanProvided: boolean;
  privacyScanPassed: boolean;
  backupManifestAvailable: boolean;
  sourceArchiveDbInjectionPolicyAcknowledged: boolean;
}

export interface HrcCopiedDbRehearsalGuardInput {
  targetKind: HrcCopiedDbRehearsalTargetKind;
  targetLocationKind: HrcCopiedDbRehearsalTargetLocationKind;
  approvalDecision: HrcCopiedDbRehearsalApprovalDecision;
  dbSha: HrcCopiedDbRehearsalDbShaInput;
  rehearsalInputs: HrcCopiedDbRehearsalInputs;
}

export interface HrcCopiedDbRehearsalGuardResult {
  version: "v3.1-copied-db-rehearsal-guard";
  targetKind: HrcCopiedDbRehearsalTargetKind;
  targetLocationKind: HrcCopiedDbRehearsalTargetLocationKind;
  guardPassed: boolean;
  rehearsalAllowed: boolean;
  dryRunOnlyAllowed: boolean;
  copiedDbWriteAllowed: false;
  productionDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  actualDbWritePerformed: false;
  blockedReasons: string[];
  warnings: string[];
  requiredNextChecks: string[];
}

export function buildHrcCopiedDbRehearsalGuard(
  input: HrcCopiedDbRehearsalGuardInput
): HrcCopiedDbRehearsalGuardResult {
  const targetBlockers = buildTargetBlockers(input);
  const forbiddenWriteBlockers = buildForbiddenWriteBlockers(input);
  const validationBlockers = buildValidationBlockers(input);
  const approvalBlockers = buildApprovalBlockers(input);
  const blockedReasons = [
    ...targetBlockers,
    ...forbiddenWriteBlockers,
    ...validationBlockers,
    ...approvalBlockers,
    ...input.approvalDecision.blockedReasons
  ].map(redactHrcCopiedDbRehearsalGuardPrivateTokens);
  const warnings = buildWarnings(input).map(redactHrcCopiedDbRehearsalGuardPrivateTokens);
  const dryRunOnlyAllowed = isDryRunOnlyAllowed(input, [
    ...targetBlockers,
    ...forbiddenWriteBlockers,
    ...validationBlockers
  ]);
  const guardPassed = blockedReasons.length === 0;
  const rehearsalAllowed = guardPassed && input.approvalDecision.approved && input.approvalDecision.copiedDbWriteAllowed;

  return {
    version: "v3.1-copied-db-rehearsal-guard",
    targetKind: input.targetKind,
    targetLocationKind: input.targetLocationKind,
    guardPassed,
    rehearsalAllowed,
    dryRunOnlyAllowed,
    copiedDbWriteAllowed: false,
    productionDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    actualDbWritePerformed: false,
    blockedReasons,
    warnings,
    requiredNextChecks: buildRequiredNextChecks(blockedReasons, rehearsalAllowed, dryRunOnlyAllowed)
  };
}

export function buildHrcCopiedDbRehearsalApprovalDecisionFromContract(
  approvalContract: Pick<
    HrcCopiedDbTargetApprovalContract,
    | "ok"
    | "requestedOperation"
    | "futureCopiedDbWriteRehearsalEligible"
    | "productionDbWriteAllowed"
    | "copiedDbWriteAllowed"
    | "reasons"
    | "warnings"
  >
): HrcCopiedDbRehearsalApprovalDecision {
  const futureEligible = approvalContract.ok && approvalContract.futureCopiedDbWriteRehearsalEligible;

  return {
    approved: futureEligible,
    writeAllowed: futureEligible,
    copiedDbWriteAllowed: futureEligible,
    productionDbWriteAllowed: approvalContract.productionDbWriteAllowed,
    dryRunAllowed: approvalContract.ok || approvalContract.requestedOperation === "PREVIEW_ONLY",
    blockedReasons: approvalContract.ok ? [] : approvalContract.reasons,
    warnings: approvalContract.warnings
  };
}

export function assertNoHrcCopiedDbRehearsalGuardForbiddenExposure(
  result: HrcCopiedDbRehearsalGuardResult
): boolean {
  return !containsHrcCopiedDbRehearsalGuardForbiddenToken(JSON.stringify(result));
}

function buildTargetBlockers(input: HrcCopiedDbRehearsalGuardInput): string[] {
  if (input.targetKind === "PRODUCTION_DB") {
    return ["production DB target is forbidden"];
  }

  if (input.targetKind === "REPO_LOCAL_DB") {
    return ["repo-local DB target is forbidden"];
  }

  if (input.targetKind === "UNKNOWN") {
    return ["unknown DB target kind is forbidden"];
  }

  if (!isSafeCopiedDbLocation(input.targetLocationKind)) {
    return ["copied DB target must be in RESTORE_TEST or BACKUP_ROOT_REHEARSAL"];
  }

  return [];
}

function buildForbiddenWriteBlockers(input: HrcCopiedDbRehearsalGuardInput): string[] {
  const blockers: string[] = [];

  if (input.approvalDecision.productionDbWriteAllowed) {
    blockers.push("approval decision attempted to allow production DB write");
  }

  return blockers;
}

function buildValidationBlockers(input: HrcCopiedDbRehearsalGuardInput): string[] {
  const blockers: string[] = [];

  if (input.approvalDecision.copiedDbWriteAllowed || input.approvalDecision.writeAllowed) {
    if (input.dbSha.originalDbShaBefore.trim().length === 0 || input.dbSha.originalDbShaAfter.trim().length === 0) {
      blockers.push("original DB SHA before and after must be present before copied DB write rehearsal");
    } else if (input.dbSha.originalDbShaBefore !== input.dbSha.originalDbShaAfter) {
      blockers.push("original DB SHA before and after must match");
    }
  }

  if (input.dbSha.copiedDbShaBefore.trim().length === 0) {
    blockers.push("copied DB SHA baseline must be present");
  }

  if (!input.rehearsalInputs.rollbackPlanProvided) {
    blockers.push("rollback plan must be provided");
  }
  if (!input.rehearsalInputs.previewValidationPassed) {
    blockers.push("import preview validation must pass");
  }
  if (!input.rehearsalInputs.duplicateValidationPassed) {
    blockers.push("duplicate and canonical key validation must pass");
  }
  if (!input.rehearsalInputs.privacyScanPassed) {
    blockers.push("privacy/path scan must pass");
  }
  if (!input.rehearsalInputs.backupManifestAvailable) {
    blockers.push("backup manifest must be available");
  }
  if (!input.rehearsalInputs.sourceArchiveDbInjectionPolicyAcknowledged) {
    blockers.push("source archive DB injection policy must be acknowledged");
  }

  return blockers;
}

function buildApprovalBlockers(input: HrcCopiedDbRehearsalGuardInput): string[] {
  if (!input.approvalDecision.approved) {
    return ["copied DB write rehearsal approval was not granted"];
  }

  if (!input.approvalDecision.writeAllowed || !input.approvalDecision.copiedDbWriteAllowed) {
    return ["approval decision did not allow future copied DB write rehearsal"];
  }

  return [];
}

function buildWarnings(input: HrcCopiedDbRehearsalGuardInput): string[] {
  const warnings = [...input.approvalDecision.warnings];

  if (input.approvalDecision.dryRunAllowed && !input.approvalDecision.writeAllowed) {
    warnings.push("dry-run only path remains available when write approval is absent");
  }

  return warnings;
}

function isDryRunOnlyAllowed(input: HrcCopiedDbRehearsalGuardInput, nonApprovalBlockers: string[]): boolean {
  return (
    nonApprovalBlockers.length === 0 &&
    input.approvalDecision.dryRunAllowed &&
    !input.approvalDecision.writeAllowed &&
    !input.approvalDecision.copiedDbWriteAllowed &&
    !input.approvalDecision.productionDbWriteAllowed
  );
}

function buildRequiredNextChecks(
  blockedReasons: string[],
  rehearsalAllowed: boolean,
  dryRunOnlyAllowed: boolean
): string[] {
  if (rehearsalAllowed) {
    return [
      "record copied DB SHA after rehearsal",
      "verify copied DB rollback",
      "confirm original DB SHA remains unchanged",
      "keep rehearsal reports outside committed repo history unless separately approved"
    ];
  }

  if (dryRunOnlyAllowed) {
    return [
      "record dry-run result only",
      "collect explicit copied DB write rehearsal approval before any future write rehearsal"
    ];
  }

  if (blockedReasons.length > 0) {
    return ["resolve blocked reasons before copied DB rehearsal"];
  }

  return [];
}

function isSafeCopiedDbLocation(targetLocationKind: HrcCopiedDbRehearsalTargetLocationKind): boolean {
  return targetLocationKind === "RESTORE_TEST" || targetLocationKind === "BACKUP_ROOT_REHEARSAL";
}

function redactHrcCopiedDbRehearsalGuardPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

function containsHrcCopiedDbRehearsalGuardForbiddenToken(value: string): boolean {
  return /C:\\Users|sample-user|sample-private-token|@privaterelay\.appleid\.com|sample-external-hrc-folder|raw hrc/i.test(
    value
  );
}

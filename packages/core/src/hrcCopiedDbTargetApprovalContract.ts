import type { HrcCopiedDbPathGuardDecision, HrcCopiedDbPathGuardResult } from "./hrcCopiedDbPathGuard.js";

export type HrcCopiedDbTargetApprovalMode = "NONE" | "EXPLICIT_FLAG" | "EXPLICIT_TOKEN";

export type HrcCopiedDbTargetApprovalOperation = "PREVIEW_ONLY" | "COPIED_DB_WRITE_REHEARSAL";

export type HrcCopiedDbTargetApprovalDecision =
  | "PREVIEW_ONLY_NO_APPROVAL_REQUIRED"
  | "ELIGIBLE_COPIED_DB_REHEARSAL_APPROVAL"
  | "BLOCKED_MISSING_APPROVAL"
  | "BLOCKED_INVALID_APPROVAL"
  | "BLOCKED_COPIED_DB_TARGET"
  | "BLOCKED_PRODUCTION_DB_WRITE"
  | "BLOCKED_SCHEMA_MIGRATION"
  | "BLOCKED_PRODUCT_IMPORT_SURFACE"
  | "BLOCKED_PACKAGE_SCRIPT"
  | "BLOCKED_RAW_HRC_ACCESS"
  | "BLOCKED_REPORT_JSON_WRITE";

export interface HrcCopiedDbTargetApprovalContractInput {
  rehearsalId: string;
  requestedOperation: HrcCopiedDbTargetApprovalOperation;
  approvalMode: HrcCopiedDbTargetApprovalMode;
  approvalFlagPresent?: boolean;
  approvalToken?: string;
  expectedApprovalToken?: string;
  copiedDbPathGuardResult: Pick<
    HrcCopiedDbPathGuardResult,
    "allowed" | "decision" | "normalizedTargetDbPathRedacted" | "reasons" | "warnings"
  >;
  copiedDbWriteRequested: boolean;
  productionDbWriteRequested: boolean;
  schemaMigrationRequested: boolean;
  productImportRouteConnectionRequested: boolean;
  apiUiImportFlowRequested: boolean;
  packageScriptRequested: boolean;
  rawHrcAccessRequested: boolean;
  reportJsonWriteRequested: boolean;
}

export interface HrcCopiedDbTargetApprovalContract {
  version: "v3.1-copied-db-target-approval-contract";
  rehearsalId: string;
  requestedOperation: HrcCopiedDbTargetApprovalOperation;
  ok: boolean;
  approvalRequired: boolean;
  approvalRecorded: boolean;
  approvalMode: HrcCopiedDbTargetApprovalMode;
  approvalTokenStored: false;
  decision: HrcCopiedDbTargetApprovalDecision;
  futureCopiedDbWriteRehearsalEligible: boolean;
  copiedDbTargetAllowed: boolean;
  copiedDbPathGuardDecision: HrcCopiedDbPathGuardDecision;
  copiedDbTargetPathRedacted: string;
  productionDbWriteAllowed: false;
  copiedDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  actualDbWritePerformed: false;
  productImportRouteConnected: false;
  apiUiImportFlowConnected: false;
  packageScriptAdded: false;
  rawHrcAccessed: false;
  reasons: string[];
  warnings: string[];
}

export interface HrcCopiedDbTargetApprovalContractSummary {
  version: HrcCopiedDbTargetApprovalContract["version"];
  rehearsalId: string;
  ok: boolean;
  approvalRequired: boolean;
  approvalRecorded: boolean;
  decision: HrcCopiedDbTargetApprovalDecision;
  futureCopiedDbWriteRehearsalEligible: boolean;
  copiedDbTargetAllowed: boolean;
  copiedDbPathGuardDecision: HrcCopiedDbPathGuardDecision;
  productionDbWriteAllowed: false;
  copiedDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  reasonCount: number;
  warningCount: number;
}

export function buildHrcCopiedDbTargetApprovalContract(
  input: HrcCopiedDbTargetApprovalContractInput
): HrcCopiedDbTargetApprovalContract {
  const sanitizedRehearsalId = redactHrcCopiedDbApprovalPrivateTokens(input.rehearsalId);
  const copiedDbTargetPathRedacted = redactHrcCopiedDbApprovalPrivateTokens(
    input.copiedDbPathGuardResult.normalizedTargetDbPathRedacted
  );
  const warnings = buildBaseWarnings(input, sanitizedRehearsalId, copiedDbTargetPathRedacted);
  const blockingDecision = getBlockingDecision(input);

  if (blockingDecision) {
    return contract(input, {
      rehearsalId: sanitizedRehearsalId,
      copiedDbTargetPathRedacted,
      decision: blockingDecision.decision,
      ok: false,
      approvalRequired: input.requestedOperation === "COPIED_DB_WRITE_REHEARSAL" || input.copiedDbWriteRequested,
      approvalRecorded: hasRecordedApproval(input),
      futureCopiedDbWriteRehearsalEligible: false,
      reasons: blockingDecision.reasons,
      warnings
    });
  }

  if (input.requestedOperation === "PREVIEW_ONLY" && !input.copiedDbWriteRequested) {
    return contract(input, {
      rehearsalId: sanitizedRehearsalId,
      copiedDbTargetPathRedacted,
      decision: "PREVIEW_ONLY_NO_APPROVAL_REQUIRED",
      ok: true,
      approvalRequired: false,
      approvalRecorded: false,
      futureCopiedDbWriteRehearsalEligible: false,
      reasons: ["preview-only operation does not require copied DB write approval"],
      warnings
    });
  }

  if (!hasRecordedApproval(input)) {
    return contract(input, {
      rehearsalId: sanitizedRehearsalId,
      copiedDbTargetPathRedacted,
      decision: "BLOCKED_MISSING_APPROVAL",
      ok: false,
      approvalRequired: true,
      approvalRecorded: false,
      futureCopiedDbWriteRehearsalEligible: false,
      reasons: ["copied DB write rehearsal requires explicit approval"],
      warnings
    });
  }

  if (!hasValidApproval(input)) {
    return contract(input, {
      rehearsalId: sanitizedRehearsalId,
      copiedDbTargetPathRedacted,
      decision: "BLOCKED_INVALID_APPROVAL",
      ok: false,
      approvalRequired: true,
      approvalRecorded: true,
      futureCopiedDbWriteRehearsalEligible: false,
      reasons: ["explicit approval did not match the expected approval contract"],
      warnings
    });
  }

  return contract(input, {
    rehearsalId: sanitizedRehearsalId,
    copiedDbTargetPathRedacted,
    decision: "ELIGIBLE_COPIED_DB_REHEARSAL_APPROVAL",
    ok: true,
    approvalRequired: true,
    approvalRecorded: true,
    futureCopiedDbWriteRehearsalEligible: true,
    reasons: ["copied DB target approval contract is satisfied for a future rehearsal"],
    warnings
  });
}

export function summarizeHrcCopiedDbTargetApprovalContract(
  approvalContract: HrcCopiedDbTargetApprovalContract
): HrcCopiedDbTargetApprovalContractSummary {
  return {
    version: approvalContract.version,
    rehearsalId: approvalContract.rehearsalId,
    ok: approvalContract.ok,
    approvalRequired: approvalContract.approvalRequired,
    approvalRecorded: approvalContract.approvalRecorded,
    decision: approvalContract.decision,
    futureCopiedDbWriteRehearsalEligible: approvalContract.futureCopiedDbWriteRehearsalEligible,
    copiedDbTargetAllowed: approvalContract.copiedDbTargetAllowed,
    copiedDbPathGuardDecision: approvalContract.copiedDbPathGuardDecision,
    productionDbWriteAllowed: false,
    copiedDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    reasonCount: approvalContract.reasons.length,
    warningCount: approvalContract.warnings.length
  };
}

export function assertNoHrcCopiedDbApprovalForbiddenExposure(
  approvalContract: HrcCopiedDbTargetApprovalContract
): boolean {
  return !containsHrcCopiedDbApprovalForbiddenToken(JSON.stringify(approvalContract));
}

function contract(
  input: HrcCopiedDbTargetApprovalContractInput,
  values: {
    rehearsalId: string;
    copiedDbTargetPathRedacted: string;
    decision: HrcCopiedDbTargetApprovalDecision;
    ok: boolean;
    approvalRequired: boolean;
    approvalRecorded: boolean;
    futureCopiedDbWriteRehearsalEligible: boolean;
    reasons: string[];
    warnings: string[];
  }
): HrcCopiedDbTargetApprovalContract {
  return {
    version: "v3.1-copied-db-target-approval-contract",
    rehearsalId: values.rehearsalId,
    requestedOperation: input.requestedOperation,
    ok: values.ok,
    approvalRequired: values.approvalRequired,
    approvalRecorded: values.approvalRecorded,
    approvalMode: input.approvalMode,
    approvalTokenStored: false,
    decision: values.decision,
    futureCopiedDbWriteRehearsalEligible: values.futureCopiedDbWriteRehearsalEligible,
    copiedDbTargetAllowed: input.copiedDbPathGuardResult.allowed,
    copiedDbPathGuardDecision: input.copiedDbPathGuardResult.decision,
    copiedDbTargetPathRedacted: values.copiedDbTargetPathRedacted,
    productionDbWriteAllowed: false,
    copiedDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    actualDbWritePerformed: false,
    productImportRouteConnected: false,
    apiUiImportFlowConnected: false,
    packageScriptAdded: false,
    rawHrcAccessed: false,
    reasons: values.reasons.map(redactHrcCopiedDbApprovalPrivateTokens),
    warnings: values.warnings.map(redactHrcCopiedDbApprovalPrivateTokens)
  };
}

function getBlockingDecision(input: HrcCopiedDbTargetApprovalContractInput):
  | {
      decision: HrcCopiedDbTargetApprovalDecision;
      reasons: string[];
    }
  | null {
  if (input.productionDbWriteRequested) {
    return {
      decision: "BLOCKED_PRODUCTION_DB_WRITE",
      reasons: ["production DB write is forbidden"]
    };
  }

  if (input.schemaMigrationRequested) {
    return {
      decision: "BLOCKED_SCHEMA_MIGRATION",
      reasons: ["DB schema migration is outside copied DB rehearsal approval scope"]
    };
  }

  if (input.productImportRouteConnectionRequested || input.apiUiImportFlowRequested) {
    return {
      decision: "BLOCKED_PRODUCT_IMPORT_SURFACE",
      reasons: ["product import route, API, or UI exposure is outside approval scope"]
    };
  }

  if (input.packageScriptRequested) {
    return {
      decision: "BLOCKED_PACKAGE_SCRIPT",
      reasons: ["package script exposure requires a separate approval step"]
    };
  }

  if (input.rawHrcAccessRequested) {
    return {
      decision: "BLOCKED_RAW_HRC_ACCESS",
      reasons: ["raw HRC access is outside copied DB approval scope"]
    };
  }

  if (input.reportJsonWriteRequested) {
    return {
      decision: "BLOCKED_REPORT_JSON_WRITE",
      reasons: ["report JSON writing is outside copied DB approval scope"]
    };
  }

  if (!input.copiedDbPathGuardResult.allowed) {
    return {
      decision: "BLOCKED_COPIED_DB_TARGET",
      reasons: [
        `copied DB path guard did not allow target: ${input.copiedDbPathGuardResult.decision}`,
        ...input.copiedDbPathGuardResult.reasons
      ]
    };
  }

  return null;
}

function hasRecordedApproval(input: HrcCopiedDbTargetApprovalContractInput): boolean {
  if (input.approvalMode === "EXPLICIT_FLAG") {
    return input.approvalFlagPresent === true;
  }

  if (input.approvalMode === "EXPLICIT_TOKEN") {
    return typeof input.approvalToken === "string" && input.approvalToken.trim().length > 0;
  }

  return false;
}

function hasValidApproval(input: HrcCopiedDbTargetApprovalContractInput): boolean {
  if (input.approvalMode === "EXPLICIT_FLAG") {
    return input.approvalFlagPresent === true;
  }

  if (input.approvalMode === "EXPLICIT_TOKEN") {
    return (
      typeof input.approvalToken === "string" &&
      typeof input.expectedApprovalToken === "string" &&
      input.approvalToken.length > 0 &&
      input.approvalToken === input.expectedApprovalToken
    );
  }

  return false;
}

function buildBaseWarnings(
  input: HrcCopiedDbTargetApprovalContractInput,
  sanitizedRehearsalId: string,
  copiedDbTargetPathRedacted: string
): string[] {
  const warnings: string[] = [];

  if (sanitizedRehearsalId !== input.rehearsalId) {
    warnings.push("rehearsalId required redaction");
  }
  if (copiedDbTargetPathRedacted !== input.copiedDbPathGuardResult.normalizedTargetDbPathRedacted) {
    warnings.push("copied DB target path required redaction");
  }
  if (input.approvalMode === "EXPLICIT_TOKEN" && input.approvalToken) {
    warnings.push("approval token was provided and intentionally not stored");
  }
  if (input.copiedDbPathGuardResult.warnings.length > 0) {
    warnings.push(...input.copiedDbPathGuardResult.warnings);
  }

  return warnings;
}

function redactHrcCopiedDbApprovalPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

function containsHrcCopiedDbApprovalForbiddenToken(value: string): boolean {
  return /C:\\Users|sample-user|sample-private-token|@privaterelay\.appleid\.com|sample-external-hrc-folder|raw hrc/i.test(
    value
  );
}

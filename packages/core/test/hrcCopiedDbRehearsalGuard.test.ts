import { describe, expect, it } from "vitest";
import {
  assertNoHrcCopiedDbRehearsalGuardForbiddenExposure,
  buildHrcCopiedDbRehearsalApprovalDecisionFromContract,
  buildHrcCopiedDbRehearsalGuard,
  type HrcCopiedDbRehearsalGuardInput
} from "../src/hrcCopiedDbRehearsalGuard.js";
import { buildHrcCopiedDbTargetApprovalContract } from "../src/hrcCopiedDbTargetApprovalContract.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC copied DB rehearsal guard helper", () => {
  it("fails a production DB target", () => {
    const result = buildHrcCopiedDbRehearsalGuard(validInput({ targetKind: "PRODUCTION_DB" }));

    expect(result.guardPassed).toBe(false);
    expect(result.rehearsalAllowed).toBe(false);
    expect(result.blockedReasons).toContain("production DB target is forbidden");
    expect(result.productionDbWriteAllowed).toBe(false);
  });

  it("fails a repo-local DB target", () => {
    const result = buildHrcCopiedDbRehearsalGuard(validInput({ targetKind: "REPO_LOCAL_DB" }));

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("repo-local DB target is forbidden");
  });

  it("fails an unknown target", () => {
    const result = buildHrcCopiedDbRehearsalGuard(validInput({ targetKind: "UNKNOWN" }));

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("unknown DB target kind is forbidden");
  });

  it("fails a copied DB target in the wrong location", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        targetLocationKind: "PROJECT_REPO"
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("copied DB target must be in RESTORE_TEST or BACKUP_ROOT_REHEARSAL");
  });

  it("fails when copied DB approval is false", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        approvalDecision: {
          ...approvedDecision(),
          approved: false,
          writeAllowed: false,
          copiedDbWriteAllowed: false,
          dryRunAllowed: false,
          blockedReasons: ["approval contract blocked request"]
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.rehearsalAllowed).toBe(false);
    expect(result.blockedReasons).toContain("copied DB write rehearsal approval was not granted");
    expect(result.blockedReasons).toContain("approval contract blocked request");
  });

  it("allows a copied DB rehearsal when approval, location, SHA, and checks are safe", () => {
    const result = buildHrcCopiedDbRehearsalGuard(validInput());

    expect(result.guardPassed).toBe(true);
    expect(result.rehearsalAllowed).toBe(true);
    expect(result.dryRunOnlyAllowed).toBe(false);
    expect(result.blockedReasons).toEqual([]);
    expect(result.requiredNextChecks).toContain("record copied DB SHA after rehearsal");
    expect(result.productionDbWriteAllowed).toBe(false);
    expect(result.copiedDbWriteAllowed).toBe(false);
    expectNoForbiddenOutput(result);
  });

  it("can use the Step 2 approval contract as an input adapter", () => {
    const approvalContract = buildHrcCopiedDbTargetApprovalContract({
      rehearsalId: "v3.1-copied-db-approval-001",
      requestedOperation: "COPIED_DB_WRITE_REHEARSAL",
      approvalMode: "EXPLICIT_TOKEN",
      approvalToken: "approve-copied-db-rehearsal",
      expectedApprovalToken: "approve-copied-db-rehearsal",
      copiedDbPathGuardResult: {
        allowed: true,
        decision: "ALLOWED_COPIED_DB_TARGET",
        normalizedTargetDbPathRedacted: "<local-backup-root>/copy/poker-tournament-lab.db",
        reasons: ["target DB path is under the copied DB backup root"],
        warnings: []
      },
      copiedDbWriteRequested: true,
      productionDbWriteRequested: false,
      schemaMigrationRequested: false,
      productImportRouteConnectionRequested: false,
      apiUiImportFlowRequested: false,
      packageScriptRequested: false,
      rawHrcAccessRequested: false,
      reportJsonWriteRequested: false
    });
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        approvalDecision: buildHrcCopiedDbRehearsalApprovalDecisionFromContract(approvalContract)
      })
    );

    expect(result.guardPassed).toBe(true);
    expect(result.rehearsalAllowed).toBe(true);
    expect(result.copiedDbWriteAllowed).toBe(false);
  });

  it("fails when original DB SHA before and after do not match", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        dbSha: {
          ...validDbSha(),
          originalDbShaAfter: "DIFFERENT_SHA"
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("original DB SHA before and after must match");
  });

  it("fails when original DB SHA is missing for a write rehearsal", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        dbSha: {
          ...validDbSha(),
          originalDbShaBefore: ""
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain(
      "original DB SHA before and after must be present before copied DB write rehearsal"
    );
  });

  it("fails when rollback plan is missing", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        rehearsalInputs: {
          ...validRehearsalInputs(),
          rollbackPlanProvided: false
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("rollback plan must be provided");
  });

  it("fails when preview validation fails", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        rehearsalInputs: {
          ...validRehearsalInputs(),
          previewValidationPassed: false
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("import preview validation must pass");
  });

  it("fails when duplicate validation fails", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        rehearsalInputs: {
          ...validRehearsalInputs(),
          duplicateValidationPassed: false
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("duplicate and canonical key validation must pass");
  });

  it("fails when privacy scan fails", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        rehearsalInputs: {
          ...validRehearsalInputs(),
          privacyScanPassed: false
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("privacy/path scan must pass");
  });

  it("fails when backup manifest is missing", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        rehearsalInputs: {
          ...validRehearsalInputs(),
          backupManifestAvailable: false
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("backup manifest must be available");
  });

  it("fails when source archive DB injection policy is not acknowledged", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        rehearsalInputs: {
          ...validRehearsalInputs(),
          sourceArchiveDbInjectionPolicyAcknowledged: false
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("source archive DB injection policy must be acknowledged");
  });

  it("allows a dry-run only path when write flags are false", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        approvalDecision: {
          approved: false,
          writeAllowed: false,
          copiedDbWriteAllowed: false,
          productionDbWriteAllowed: false,
          dryRunAllowed: true,
          blockedReasons: [],
          warnings: []
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.rehearsalAllowed).toBe(false);
    expect(result.dryRunOnlyAllowed).toBe(true);
    expect(result.copiedDbWriteAllowed).toBe(false);
    expect(result.productionDbWriteAllowed).toBe(false);
    expect(result.requiredNextChecks).toContain(
      "collect explicit copied DB write rehearsal approval before any future write rehearsal"
    );
  });

  it("fails if approval attempts to allow production DB writes while output remains false", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        approvalDecision: {
          ...approvedDecision(),
          productionDbWriteAllowed: true
        }
      })
    );

    expect(result.guardPassed).toBe(false);
    expect(result.blockedReasons).toContain("approval decision attempted to allow production DB write");
    expect(result.productionDbWriteAllowed).toBe(false);
  });

  it("redacts forbidden local/private/email path strings from output", () => {
    const result = buildHrcCopiedDbRehearsalGuard(
      validInput({
        approvalDecision: {
          ...approvedDecision(),
          blockedReasons: ["C:\\Users\\sample-user\\sample-private-token@example.test\\blocked"],
          warnings: ["sample-private-token@example.test warning"]
        }
      })
    );

    expect(assertNoHrcCopiedDbRehearsalGuardForbiddenExposure(result)).toBe(true);
    expectNoForbiddenOutput(result);
  });

  it("uses only in-memory inputs without filesystem, DB, process, env, Date, random, or report operations", () => {
    const result = buildHrcCopiedDbRehearsalGuard(validInput());
    const serialized = JSON.stringify({
      result,
      buildSource: buildHrcCopiedDbRehearsalGuard.toString()
    });

    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("process.argv");
    expect(serialized).not.toContain("process.env");
    expect(serialized).not.toContain("process.exit");
    expect(serialized).not.toContain("Date.now");
    expect(serialized).not.toContain("new Date");
    expect(serialized).not.toContain("Math.random");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(overrides: Partial<HrcCopiedDbRehearsalGuardInput> = {}): HrcCopiedDbRehearsalGuardInput {
  return {
    targetKind: "COPIED_DB",
    targetLocationKind: "RESTORE_TEST",
    approvalDecision: approvedDecision(),
    dbSha: validDbSha(),
    rehearsalInputs: validRehearsalInputs(),
    ...overrides
  };
}

function approvedDecision() {
  return {
    approved: true,
    writeAllowed: true,
    copiedDbWriteAllowed: true,
    productionDbWriteAllowed: false,
    dryRunAllowed: true,
    blockedReasons: [],
    warnings: []
  };
}

function validDbSha() {
  return {
    originalDbShaBefore: DB_SHA256,
    originalDbShaAfter: DB_SHA256,
    copiedDbShaBefore: DB_SHA256
  };
}

function validRehearsalInputs() {
  return {
    previewValidationPassed: true,
    duplicateValidationPassed: true,
    rollbackPlanProvided: true,
    privacyScanPassed: true,
    backupManifestAvailable: true,
    sourceArchiveDbInjectionPolicyAcknowledged: true
  };
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toContain("private@example.invalid");
  expect(serialized).not.toContain("raw hrc");
}

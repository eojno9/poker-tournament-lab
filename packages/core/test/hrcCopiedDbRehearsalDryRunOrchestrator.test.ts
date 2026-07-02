import { describe, expect, it } from "vitest";
import type { HrcCopiedDbPathGuardResult } from "../src/hrcCopiedDbPathGuard.js";
import {
  assertNoHrcCopiedDbRehearsalDryRunForbiddenExposure,
  buildHrcCopiedDbRehearsalDryRunResult,
  type HrcCopiedDbRehearsalDryRunOrchestratorInput
} from "../src/hrcCopiedDbRehearsalDryRunOrchestrator.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC copied DB rehearsal dry-run orchestrator helper", () => {
  it("builds a valid dry-run only result", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        approval: {
          ...validApproval(),
          requestedOperation: "PREVIEW_ONLY",
          approvalMode: "NONE",
          approvalToken: undefined,
          expectedApprovalToken: undefined,
          copiedDbWriteRequested: false
        }
      })
    );

    expect(result.report.status).toBe("READY_FOR_DRY_RUN");
    expect(result.summary.exitCode).toBe(0);
    expect(result.summary.canDryRun).toBe(true);
    expect(result.summary.canCopiedDbWriteRehearsal).toBe(false);
    expect(result.productionDbWriteAllowed).toBe(false);
    expect(result.reportFileWriteAllowed).toBe(false);
    expectNoForbiddenOutput(result);
  });

  it("builds a copied DB write rehearsal shape without performing writes", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(validInput());

    expect(result.approvalContract.ok).toBe(true);
    expect(result.guard.guardPassed).toBe(true);
    expect(result.plan.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(result.report.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(result.summary.exitCode).toBe(0);
    expect(result.summary.canCopiedDbWriteRehearsal).toBe(true);
    expect(result.orchestratorDbCopyPerformed).toBe(false);
    expect(result.orchestratorDbWritePerformed).toBe(false);
    expect(result.orchestratorReportJsonWritten).toBe(false);
  });

  it("blocks production DB targets", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        targetSummary: {
          ...validTargetSummary(),
          targetKind: "PRODUCTION_DB",
          targetLocationKind: "PRODUCTION"
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.blockedReasons).toContain("production DB target is forbidden");
    expect(result.summary.exitCode).toBe(1);
  });

  it("blocks repo-local DB targets", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        targetSummary: {
          ...validTargetSummary(),
          targetKind: "REPO_LOCAL_DB",
          targetLocationKind: "PROJECT_REPO"
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.blockedReasons).toContain("repo-local DB target is forbidden");
  });

  it("blocks missing approval", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        approval: {
          ...validApproval(),
          approvalMode: "NONE",
          approvalToken: undefined,
          expectedApprovalToken: undefined
        }
      })
    );

    expect(result.approvalContract.decision).toBe("BLOCKED_MISSING_APPROVAL");
    expect(result.report.status).toBe("BLOCKED");
    expect(result.summary.canCopiedDbWriteRehearsal).toBe(false);
  });

  it("uses privacy exitCode 3 when privacy scan fails", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        safety: {
          ...validSafety(),
          privacyScanPassed: false
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(3);
    expect(result.report.blockedReasons).toContain("privacy/path scan failed");
  });

  it("uses safety exitCode 2 when raw zip is present", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        safety: {
          ...validSafety(),
          rawZipAbsent: false
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(2);
    expect(result.report.blockedReasons).toContain("raw zip absence check failed");
  });

  it("blocks actual DB write evidence", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        executionSummary: {
          ...validExecutionSummary(),
          actualDbWritePerformed: true
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(2);
    expect(result.report.blockedReasons).toContain("actual DB write was performed but is forbidden");
    expect(result.summary.productionDbWriteAllowed).toBe(false);
  });

  it("blocks report JSON written evidence", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        executionSummary: {
          ...validExecutionSummary(),
          reportJsonWritten: true
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(2);
    expect(result.report.blockedReasons).toContain("report JSON was written but file output is forbidden");
    expect(result.summary.reportFileWriteAllowed).toBe(false);
  });

  it("blocks original DB SHA mismatch", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        shaSummary: {
          ...validShaSummary(),
          originalDbShaAfter: "DIFFERENT_SHA"
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(2);
    expect(result.report.blockedReasons).toContain("original DB SHA before and after must match");
  });

  it("blocks duplicate validation failure", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        validationSummary: {
          ...validValidationSummary(),
          duplicateValidationPassed: false
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(1);
    expect(result.report.blockedReasons).toContain("duplicate and canonical key validation must pass");
  });

  it("blocks missing rollback plan", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        safety: {
          ...validSafety(),
          rollbackPlanProvided: false
        }
      })
    );

    expect(result.report.status).toBe("BLOCKED");
    expect(result.report.exitCode).toBe(1);
    expect(result.report.blockedReasons).toContain("rollback plan must be provided");
  });

  it("keeps production and report write flags false", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(validInput());

    expect(result.productionDbWriteAllowed).toBe(false);
    expect(result.reportFileWriteAllowed).toBe(false);
    expect(result.summary.productionDbWriteAllowed).toBe(false);
    expect(result.summary.reportFileWriteAllowed).toBe(false);
    expect(result.report.decision.canProductionDbWrite).toBe(false);
    expect(result.report.decision.canWriteReportFile).toBe(false);
  });

  it("redacts forbidden local/private/email path strings from output", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(
      validInput({
        rehearsalId: "C:\\Users\\sample-user\\sample-private-token@example.test\\orchestrator",
        targetSummary: {
          ...validTargetSummary(),
          targetPathRedacted:
            "C:\\Users\\sample-user\\Documents\\sample-external-hrc-folder\\poker-tournament-lab.db",
          copiedDbPathGuardResult: pathGuardResult({
            normalizedTargetDbPathRedacted:
              "C:\\Users\\sample-user\\Documents\\sample-external-hrc-folder\\poker-tournament-lab.db",
            warnings: ["sample-private-token@example.test warning"]
          })
        }
      })
    );

    expect(assertNoHrcCopiedDbRehearsalDryRunForbiddenExposure(result)).toBe(true);
    expectNoForbiddenOutput(result);
  });

  it("uses only pure helpers without filesystem, DB, process env, Date, random, or report file operations", () => {
    const result = buildHrcCopiedDbRehearsalDryRunResult(validInput());
    const serialized = JSON.stringify({
      result,
      buildSource: buildHrcCopiedDbRehearsalDryRunResult.toString()
    });

    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("process.env");
    expect(serialized).not.toContain("process.argv");
    expect(serialized).not.toContain("process.exit");
    expect(serialized).not.toContain("Date.now");
    expect(serialized).not.toContain("new Date");
    expect(serialized).not.toContain("Math.random");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(
  overrides: Partial<HrcCopiedDbRehearsalDryRunOrchestratorInput> = {}
): HrcCopiedDbRehearsalDryRunOrchestratorInput {
  return {
    rehearsalId: "v3.1-copied-db-dry-run-001",
    targetSummary: validTargetSummary(),
    approval: validApproval(),
    validationSummary: validValidationSummary(),
    shaSummary: validShaSummary(),
    safety: validSafety(),
    executionSummary: validExecutionSummary(),
    reportPolicy: {
      reportFileWriteAllowed: false,
      consoleSummaryAllowed: true
    },
    ...overrides
  };
}

function validTargetSummary(): HrcCopiedDbRehearsalDryRunOrchestratorInput["targetSummary"] {
  return {
    targetKind: "COPIED_DB",
    targetLocationKind: "RESTORE_TEST",
    targetPathRedacted: "<local-backup-root>/v3.1-copied-db-rehearsal/poker-tournament-lab.db",
    copiedDbPathGuardResult: pathGuardResult()
  };
}

function validApproval(): HrcCopiedDbRehearsalDryRunOrchestratorInput["approval"] {
  return {
    requestedOperation: "COPIED_DB_WRITE_REHEARSAL",
    approvalMode: "EXPLICIT_TOKEN",
    approvalToken: "approve-copied-db-rehearsal",
    expectedApprovalToken: "approve-copied-db-rehearsal",
    copiedDbWriteRequested: true,
    productionDbWriteRequested: false,
    schemaMigrationRequested: false,
    productImportRouteConnectionRequested: false,
    apiUiImportFlowRequested: false,
    packageScriptRequested: false,
    rawHrcAccessRequested: false,
    reportJsonWriteRequested: false
  };
}

function validValidationSummary(): HrcCopiedDbRehearsalDryRunOrchestratorInput["validationSummary"] {
  return {
    previewValidationPassed: true,
    duplicateValidationPassed: true,
    previewRows: 28,
    importPreviewAllowed: 19,
    blockedCount: 0,
    duplicateExistingDbCount: 0,
    duplicateInBatchCount: 0,
    missingCanonicalKeyCount: 0
  };
}

function validShaSummary(): HrcCopiedDbRehearsalDryRunOrchestratorInput["shaSummary"] {
  return {
    originalDbShaBefore: DB_SHA256,
    originalDbShaAfter: DB_SHA256,
    copiedDbShaBefore: DB_SHA256
  };
}

function validSafety(): HrcCopiedDbRehearsalDryRunOrchestratorInput["safety"] {
  return {
    rollbackPlanProvided: true,
    rollbackVerificationRequired: true,
    privacyScanPassed: true,
    backupManifestAvailable: true,
    sourceArchiveDbInjectionPolicyAcknowledged: true,
    rawZipAbsent: true,
    artifactReportsAbsent: true,
    productRouteDisconnected: true,
    apiUiRuntimeUnchanged: true
  };
}

function validExecutionSummary(): HrcCopiedDbRehearsalDryRunOrchestratorInput["executionSummary"] {
  return {
    actualDbCopyPerformed: false,
    actualDbWritePerformed: false,
    reportJsonWritten: false
  };
}

function pathGuardResult(overrides: Partial<HrcCopiedDbPathGuardResult> = {}): HrcCopiedDbPathGuardResult {
  return {
    allowed: true,
    decision: "ALLOWED_COPIED_DB_TARGET",
    normalizedTargetDbPathRedacted:
      "<local-backup-root>/v3.1-copied-db-rehearsal/poker-tournament-lab.db",
    normalizedProductionDbPathRedacted: "<repo-root>/apps/server/data/poker-tournament-lab.db",
    reasons: ["target DB path is under the copied DB backup root"],
    warnings: [],
    ...overrides
  };
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  expect(serialized).not.toContain("raw hrc");
}

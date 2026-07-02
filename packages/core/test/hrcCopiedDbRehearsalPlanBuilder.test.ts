import { describe, expect, it } from "vitest";
import {
  assertNoHrcCopiedDbRehearsalPlanForbiddenExposure,
  buildHrcCopiedDbRehearsalPlan,
  buildHrcCopiedDbRehearsalPlanGuardDecision,
  type HrcCopiedDbRehearsalPlanBuilderInput
} from "../src/hrcCopiedDbRehearsalPlanBuilder.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC copied DB rehearsal plan builder helper", () => {
  it("returns BLOCKED when the guard fails", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        guardDecision: {
          ...validGuardDecision(),
          guardPassed: false,
          rehearsalAllowed: false,
          blockedReasons: ["guard blocked copied DB target"]
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasons).toContain("rehearsal guard did not pass");
    expect(plan.blockedReasons).toContain("guard blocked copied DB target");
    expect(plan.copiedDbWriteRehearsalAllowed).toBe(false);
  });

  it("blocks production DB write input while output productionDbWriteAllowed remains false", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        approvalDecision: {
          ...validApprovalDecision(),
          productionDbWriteAllowed: true
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasons).toContain("production DB write is forbidden");
    expect(plan.productionDbWriteAllowed).toBe(false);
  });

  it("builds READY_FOR_DRY_RUN when guard permits dry-run only and write flags are false", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        approvalDecision: {
          approved: false,
          writeAllowed: false,
          copiedDbWriteAllowed: false,
          productionDbWriteAllowed: false,
          dryRunAllowed: true,
          blockedReasons: [],
          warnings: []
        },
        guardDecision: {
          ...validGuardDecision(),
          rehearsalAllowed: false,
          dryRunOnlyAllowed: true,
          copiedDbWriteAllowed: false
        }
      })
    );

    expect(plan.status).toBe("READY_FOR_DRY_RUN");
    expect(plan.dryRunOnly).toBe(true);
    expect(plan.copiedDbWriteRehearsalAllowed).toBe(false);
    expect(plan.steps).not.toContain("APPLY_TO_COPIED_DB_REHEARSAL");
  });

  it("builds READY_FOR_COPIED_DB_WRITE_REHEARSAL when all safe inputs pass", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(validInput());

    expect(plan.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(plan.dryRunOnly).toBe(false);
    expect(plan.copiedDbWriteRehearsalAllowed).toBe(true);
    expect(plan.productionDbWriteAllowed).toBe(false);
    expect(plan.reportFileWriteAllowed).toBe(false);
    expect(plan.steps).toContain("APPLY_TO_COPIED_DB_REHEARSAL");
    expect(plan.steps).toContain("VERIFY_ROLLBACK_PLAN");
    expect(plan.steps).toContain("CLEANUP");
    expectNoForbiddenOutput(plan);
  });

  it("can adapt a Step 3 guard result into plan guard decision input", () => {
    const guardDecision = buildHrcCopiedDbRehearsalPlanGuardDecision({
      guardPassed: true,
      rehearsalAllowed: true,
      dryRunOnlyAllowed: false,
      copiedDbWriteAllowed: false,
      productionDbWriteAllowed: false,
      blockedReasons: [],
      warnings: [],
      requiredNextChecks: ["record copied DB SHA after rehearsal"]
    });
    const plan = buildHrcCopiedDbRehearsalPlan(validInput({ guardDecision }));

    expect(plan.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(plan.requiredNextChecks).toContain("record copied DB SHA after rehearsal");
  });

  it("blocks original DB SHA mismatch", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        shaSummary: {
          ...validShaSummary(),
          originalDbShaAfter: "DIFFERENT_SHA"
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasons).toContain("original DB SHA before and after must match");
  });

  it("blocks failed preview validation", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        validationSummary: {
          ...validValidationSummary(),
          previewValidationPassed: false
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasons).toContain("preview validation must pass");
  });

  it("blocks failed duplicate validation", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        validationSummary: {
          ...validValidationSummary(),
          duplicateValidationPassed: false
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasons).toContain("duplicate and canonical key validation must pass");
  });

  it("blocks when rollback plan is missing", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        rollbackPlan: {
          ...validRollbackPlan(),
          rollbackPlanProvided: false
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.blockedReasons).toContain("rollback plan must be provided");
  });

  it("warns when importPreviewAllowed is zero", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        validationSummary: {
          ...validValidationSummary(),
          importPreviewAllowed: 0
        }
      })
    );

    expect(plan.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(plan.warnings).toContain("import preview allowed count is zero");
  });

  it("blocks report file writing while output reportFileWriteAllowed remains false", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        reportPolicy: {
          reportFileWriteAllowed: true,
          consoleSummaryAllowed: true
        }
      })
    );

    expect(plan.status).toBe("BLOCKED");
    expect(plan.reportFileWriteAllowed).toBe(false);
    expect(plan.blockedReasons).toContain("report file write is disabled for this planning step");
  });

  it("redacts forbidden local/private/email path strings from output", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(
      validInput({
        rehearsalId: "C:\\Users\\sample-user\\sample-private-token@example.test\\plan",
        targetSummary: {
          ...validTargetSummary(),
          targetPathRedacted:
            "C:\\Users\\sample-user\\Documents\\sample-external-hrc-folder\\poker-tournament-lab.db"
        },
        guardDecision: {
          ...validGuardDecision(),
          warnings: ["sample-private-token@example.test warning"]
        }
      })
    );

    expect(assertNoHrcCopiedDbRehearsalPlanForbiddenExposure(plan)).toBe(true);
    expectNoForbiddenOutput(plan);
  });

  it("uses only in-memory inputs without filesystem, DB, process, env, Date, random, or report operations", () => {
    const plan = buildHrcCopiedDbRehearsalPlan(validInput());
    const serialized = JSON.stringify({
      plan,
      buildSource: buildHrcCopiedDbRehearsalPlan.toString()
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

function validInput(
  overrides: Partial<HrcCopiedDbRehearsalPlanBuilderInput> = {}
): HrcCopiedDbRehearsalPlanBuilderInput {
  return {
    rehearsalId: "v3.1-copied-db-plan-001",
    targetSummary: validTargetSummary(),
    approvalDecision: validApprovalDecision(),
    guardDecision: validGuardDecision(),
    validationSummary: validValidationSummary(),
    shaSummary: validShaSummary(),
    rollbackPlan: validRollbackPlan(),
    reportPolicy: validReportPolicy(),
    ...overrides
  };
}

function validTargetSummary() {
  return {
    targetKind: "COPIED_DB" as const,
    targetLocationKind: "RESTORE_TEST" as const,
    targetPathRedacted: "<local-backup-root>/v3.1-copied-db-rehearsal/poker-tournament-lab.db"
  };
}

function validApprovalDecision() {
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

function validGuardDecision() {
  return {
    guardPassed: true,
    rehearsalAllowed: true,
    dryRunOnlyAllowed: false,
    copiedDbWriteAllowed: false,
    productionDbWriteAllowed: false,
    blockedReasons: [],
    warnings: [],
    requiredNextChecks: ["record copied DB SHA after rehearsal"]
  };
}

function validValidationSummary() {
  return {
    previewValidationPassed: true,
    duplicateValidationPassed: true,
    importPreviewAllowed: 19,
    blockedCount: 0
  };
}

function validShaSummary() {
  return {
    originalDbShaBefore: DB_SHA256,
    originalDbShaAfter: DB_SHA256,
    copiedDbShaBefore: DB_SHA256
  };
}

function validRollbackPlan() {
  return {
    rollbackPlanProvided: true,
    rollbackVerificationRequired: true
  };
}

function validReportPolicy() {
  return {
    reportFileWriteAllowed: false,
    consoleSummaryAllowed: true
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

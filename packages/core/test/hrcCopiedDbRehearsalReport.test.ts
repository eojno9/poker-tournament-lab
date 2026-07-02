import { describe, expect, it } from "vitest";
import {
  assertNoHrcCopiedDbRehearsalReportForbiddenExposure,
  buildHrcCopiedDbRehearsalReport,
  summarizeHrcCopiedDbRehearsalReport,
  type HrcCopiedDbRehearsalReportInput
} from "../src/hrcCopiedDbRehearsalReport.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC copied DB rehearsal report shape helper", () => {
  it("builds a READY_FOR_DRY_RUN report", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        plan: {
          ...validPlan(),
          status: "READY_FOR_DRY_RUN",
          dryRunOnly: true,
          copiedDbWriteRehearsalAllowed: false,
          steps: ["PRECHECK", "VALIDATE_PREVIEW", "POST_REHEARSAL_DIFF", "CLEANUP"]
        }
      })
    );
    const summary = summarizeHrcCopiedDbRehearsalReport(report);

    expect(report.status).toBe("READY_FOR_DRY_RUN");
    expect(report.decision.canDryRun).toBe(true);
    expect(report.decision.canCopiedDbWriteRehearsal).toBe(false);
    expect(report.exitCode).toBe(0);
    expect(summary.canDryRun).toBe(true);
  });

  it("builds a READY_FOR_COPIED_DB_WRITE_REHEARSAL report without performing writes", () => {
    const report = buildHrcCopiedDbRehearsalReport(validInput());

    expect(report.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(report.decision.canCopiedDbWriteRehearsal).toBe(true);
    expect(report.decision.canProductionDbWrite).toBe(false);
    expect(report.decision.canWriteReportFile).toBe(false);
    expect(report.executionSummary.actualDbWritePerformed).toBe(false);
    expect(report.executionSummary.reportJsonWritten).toBe(false);
    expect(report.exitCode).toBe(0);
    expectNoForbiddenOutput(report);
  });

  it("builds a blocked report when the plan is BLOCKED", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        plan: {
          ...validPlan(),
          status: "BLOCKED",
          dryRunOnly: false,
          copiedDbWriteRehearsalAllowed: false,
          blockedReasons: ["preview validation must pass"]
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.decision.canDryRun).toBe(false);
    expect(report.exitCode).toBe(1);
    expect(report.blockedReasons).toContain("plan status is BLOCKED");
    expect(report.blockedReasons).toContain("preview validation must pass");
  });

  it("uses exitCode 3 when privacy scan fails", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        safetySummary: {
          ...validSafetySummary(),
          privacyScanPassed: false
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.exitCode).toBe(3);
    expect(report.blockedReasons).toContain("privacy/path scan failed");
  });

  it("uses exitCode 2 when raw zip absence check fails", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        safetySummary: {
          ...validSafetySummary(),
          rawZipAbsent: false
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.exitCode).toBe(2);
    expect(report.blockedReasons).toContain("raw zip absence check failed");
  });

  it("blocks when actual DB write was performed", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        executionSummary: {
          ...validExecutionSummary(),
          actualDbWritePerformed: true
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.exitCode).toBe(2);
    expect(report.blockedReasons).toContain("actual DB write was performed but is forbidden");
    expect(report.decision.canProductionDbWrite).toBe(false);
  });

  it("blocks when report JSON was written", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        executionSummary: {
          ...validExecutionSummary(),
          reportJsonWritten: true
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.exitCode).toBe(2);
    expect(report.blockedReasons).toContain("report JSON was written but file output is forbidden");
    expect(report.decision.canWriteReportFile).toBe(false);
  });

  it("blocks when actual DB copy was performed", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        executionSummary: {
          ...validExecutionSummary(),
          actualDbCopyPerformed: true
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.exitCode).toBe(2);
    expect(report.blockedReasons).toContain("actual DB copy was performed but is forbidden in this report-shape step");
  });

  it("keeps production and report write decisions false", () => {
    const report = buildHrcCopiedDbRehearsalReport(validInput());

    expect(report.decision.canProductionDbWrite).toBe(false);
    expect(report.decision.canWriteReportFile).toBe(false);
  });

  it("warns when importPreviewAllowed is zero", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        counts: {
          ...validCounts(),
          importPreviewAllowed: 0
        }
      })
    );

    expect(report.status).toBe("READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(report.warnings).toContain("import preview allowed count is zero");
  });

  it("blocks original DB SHA mismatch with safety exitCode", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        shaSummary: {
          ...validShaSummary(),
          originalDbShaAfter: "DIFFERENT_SHA"
        }
      })
    );

    expect(report.status).toBe("BLOCKED");
    expect(report.exitCode).toBe(2);
    expect(report.blockedReasons).toContain("original DB SHA before and after must match");
  });

  it("redacts forbidden local/private/email path strings from output", () => {
    const report = buildHrcCopiedDbRehearsalReport(
      validInput({
        rehearsalId: "C:\\Users\\sample-user\\sample-private-token@example.test\\report",
        plan: {
          ...validPlan(),
          blockedReasons: ["C:\\Users\\sample-user\\blocked"],
          warnings: ["sample-private-token@example.test warning"],
          requiredNextChecks: ["check sample-external-hrc-folder"]
        },
        shaSummary: {
          ...validShaSummary(),
          copiedDbShaAfter: "sample-private-token@example.test"
        }
      })
    );

    expect(assertNoHrcCopiedDbRehearsalReportForbiddenExposure(report)).toBe(true);
    expectNoForbiddenOutput(report);
  });

  it("uses only in-memory inputs without filesystem, DB, process, env, Date, random, or report file operations", () => {
    const report = buildHrcCopiedDbRehearsalReport(validInput());
    const serialized = JSON.stringify({
      report,
      buildSource: buildHrcCopiedDbRehearsalReport.toString()
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

function validInput(overrides: Partial<HrcCopiedDbRehearsalReportInput> = {}): HrcCopiedDbRehearsalReportInput {
  return {
    rehearsalId: "v3.1-copied-db-report-001",
    plan: validPlan(),
    counts: validCounts(),
    shaSummary: validShaSummary(),
    safetySummary: validSafetySummary(),
    executionSummary: validExecutionSummary(),
    ...overrides
  };
}

function validPlan(): HrcCopiedDbRehearsalReportInput["plan"] {
  return {
    status: "READY_FOR_COPIED_DB_WRITE_REHEARSAL",
    dryRunOnly: false,
    copiedDbWriteRehearsalAllowed: true,
    productionDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    steps: [
      "PRECHECK",
      "VALIDATE_PREVIEW",
      "VALIDATE_DUPLICATES",
      "VERIFY_ORIGINAL_DB_SHA",
      "VERIFY_COPIED_DB_SHA",
      "VERIFY_ROLLBACK_PLAN",
      "APPLY_TO_COPIED_DB_REHEARSAL",
      "POST_REHEARSAL_DIFF",
      "CLEANUP"
    ],
    blockedReasons: [],
    warnings: [],
    requiredNextChecks: ["verify rollback before any release decision"]
  };
}

function validCounts(): HrcCopiedDbRehearsalReportInput["counts"] {
  return {
    previewRows: 28,
    importPreviewAllowed: 19,
    blockedCount: 0,
    duplicateExistingDbCount: 0,
    duplicateInBatchCount: 0,
    missingCanonicalKeyCount: 0
  };
}

function validShaSummary(): HrcCopiedDbRehearsalReportInput["shaSummary"] {
  return {
    originalDbShaBefore: DB_SHA256,
    originalDbShaAfter: DB_SHA256,
    copiedDbShaBefore: DB_SHA256
  };
}

function validSafetySummary(): HrcCopiedDbRehearsalReportInput["safetySummary"] {
  return {
    privacyScanPassed: true,
    rawZipAbsent: true,
    artifactReportsAbsent: true,
    productRouteDisconnected: true,
    apiUiRuntimeUnchanged: true
  };
}

function validExecutionSummary(): HrcCopiedDbRehearsalReportInput["executionSummary"] {
  return {
    actualDbCopyPerformed: false,
    actualDbWritePerformed: false,
    reportJsonWritten: false
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

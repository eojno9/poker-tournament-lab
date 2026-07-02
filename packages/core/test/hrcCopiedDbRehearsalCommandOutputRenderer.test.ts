import { describe, expect, it } from "vitest";
import type { HrcCopiedDbPathGuardResult } from "../src/hrcCopiedDbPathGuard.js";
import {
  buildHrcCopiedDbRehearsalDryRunResult,
  type HrcCopiedDbRehearsalDryRunOrchestratorInput,
  type HrcCopiedDbRehearsalDryRunResult
} from "../src/hrcCopiedDbRehearsalDryRunOrchestrator.js";
import {
  assertNoHrcCopiedDbRehearsalCommandOutputForbiddenExposure,
  renderHrcCopiedDbRehearsalCommandOutput,
  renderHrcCopiedDbRehearsalCommandOutputLines,
  renderHrcCopiedDbRehearsalCommandOutputText
} from "../src/hrcCopiedDbRehearsalCommandOutputRenderer.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC copied DB rehearsal command output renderer", () => {
  it("renders READY_FOR_DRY_RUN output", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: dryRunOnlyResult()
    });

    expect(rendered.text).toContain("HRC Copied DB Rehearsal Preview");
    expect(rendered.text).toContain("Status: READY_FOR_DRY_RUN");
    expect(rendered.text).toContain("Exit Code: 0");
    expect(rendered.text).toContain("Can Dry Run: true");
    expect(rendered.text).toContain("Can Copied DB Write Rehearsal: false");
    expect(rendered.lineCount).toBe(rendered.lines.length);
    expect(assertNoHrcCopiedDbRehearsalCommandOutputForbiddenExposure(rendered).pass).toBe(true);
  });

  it("renders READY_FOR_COPIED_DB_WRITE_REHEARSAL output without performing writes", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult()
    });

    expect(rendered.text).toContain("Status: READY_FOR_COPIED_DB_WRITE_REHEARSAL");
    expect(rendered.text).toContain("Exit Code: 0");
    expect(rendered.text).toContain("Can Copied DB Write Rehearsal: true");
    expect(rendered.text).toContain("* Actual DB Copy Performed: false");
    expect(rendered.text).toContain("* Actual DB Write Performed: false");
    expect(rendered.text).toContain("* Report JSON Written: false");
  });

  it("renders BLOCKED output", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult({
        targetSummary: {
          ...validTargetSummary(),
          targetKind: "PRODUCTION_DB",
          targetLocationKind: "PRODUCTION"
        }
      })
    });

    expect(rendered.text).toContain("Status: BLOCKED");
    expect(rendered.text).toContain("Blocked Reasons:");
    expect(rendered.text).toContain("production DB target is forbidden");
  });

  it("renders privacy failure exitCode 3", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult({
        safety: {
          ...validSafety(),
          privacyScanPassed: false
        }
      })
    });

    expect(rendered.text).toContain("Status: BLOCKED");
    expect(rendered.text).toContain("Exit Code: 3");
    expect(rendered.text).toContain("* Privacy Scan Passed: false");
  });

  it("renders safety failure exitCode 2", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult({
        safety: {
          ...validSafety(),
          rawZipAbsent: false
        }
      })
    });

    expect(rendered.text).toContain("Status: BLOCKED");
    expect(rendered.text).toContain("Exit Code: 2");
    expect(rendered.text).toContain("* Raw Zip Absent: false");
  });

  it("renders actualDbWritePerformed true as blocked evidence", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult({
        executionSummary: {
          ...validExecutionSummary(),
          actualDbWritePerformed: true
        }
      })
    });

    expect(rendered.text).toContain("Status: BLOCKED");
    expect(rendered.text).toContain("Exit Code: 2");
    expect(rendered.text).toContain("* Actual DB Write Performed: true");
    expect(rendered.text).toContain("actual DB write was performed but is forbidden");
  });

  it("renders reportJsonWritten true as blocked evidence", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult({
        executionSummary: {
          ...validExecutionSummary(),
          reportJsonWritten: true
        }
      })
    });

    expect(rendered.text).toContain("Status: BLOCKED");
    expect(rendered.text).toContain("Exit Code: 2");
    expect(rendered.text).toContain("* Report JSON Written: true");
    expect(rendered.text).toContain("report JSON was written but file output is forbidden");
  });

  it("always renders production and report file write decisions as false", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult()
    });

    expect(rendered.text).toContain("Can Production DB Write: false");
    expect(rendered.text).toContain("Can Write Report File: false");
  });

  it("redacts forbidden real path and privacy token output", () => {
    const localPath = ["C:", "Users", "sample-user", "sample-private-token"].join("\\");
    const email = ["sample-private-token", "example.test"].join("@");
    const unsafeResult = copiedDbWriteRehearsalResult();
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: {
        ...unsafeResult,
        rehearsalId: `${localPath}\\rehearsal`,
        plan: {
          ...unsafeResult.plan,
          targetSummary: {
            ...unsafeResult.plan.targetSummary,
            targetPathRedacted: `${localPath}\\sample-external-hrc-folder\\poker-tournament-lab.db`
          }
        },
        report: {
          ...unsafeResult.report,
          warnings: [`${email} warning`],
          requiredNextChecks: [`review ${localPath}\\sample-external-hrc-folder before output`]
        }
      }
    });

    expect(rendered.forbiddenExposureDetected).toBe(true);
    expect(rendered.warnings).toContain("forbidden exposure redacted from copied DB rehearsal command output");
    expectNoForbiddenOutput(rendered);
    expect(assertNoHrcCopiedDbRehearsalCommandOutputForbiddenExposure(rendered).pass).toBe(false);
  });

  it("supports lines-only and text-only helpers", () => {
    const result = copiedDbWriteRehearsalResult();
    const lines = renderHrcCopiedDbRehearsalCommandOutputLines({ dryRunResult: result });
    const text = renderHrcCopiedDbRehearsalCommandOutputText({ dryRunResult: result });

    expect(lines[0]).toBe("HRC Copied DB Rehearsal Preview");
    expect(text).toBe(lines.join("\n"));
  });

  it("uses no filesystem, DB, process env, Date, random, or direct console output operations", () => {
    const rendered = renderHrcCopiedDbRehearsalCommandOutput({
      dryRunResult: copiedDbWriteRehearsalResult()
    });
    const serialized = JSON.stringify({
      rendered,
      renderSource: renderHrcCopiedDbRehearsalCommandOutput.toString()
    });
    const processEnvToken = ["process", "env"].join(".");
    const consoleLogToken = ["console", "log"].join(".");

    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain(processEnvToken);
    expect(serialized).not.toContain("process.argv");
    expect(serialized).not.toContain("process.exit");
    expect(serialized).not.toContain("Date.now");
    expect(serialized).not.toContain("new Date");
    expect(serialized).not.toContain("Math.random");
    expect(serialized).not.toContain(consoleLogToken);
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function dryRunOnlyResult(
  overrides: Partial<HrcCopiedDbRehearsalDryRunOrchestratorInput> = {}
): HrcCopiedDbRehearsalDryRunResult {
  return buildHrcCopiedDbRehearsalDryRunResult(
    validInput({
      approval: {
        ...validApproval(),
        requestedOperation: "PREVIEW_ONLY",
        approvalMode: "NONE",
        copiedDbWriteRequested: false
      },
      ...overrides
    })
  );
}

function copiedDbWriteRehearsalResult(
  overrides: Partial<HrcCopiedDbRehearsalDryRunOrchestratorInput> = {}
): HrcCopiedDbRehearsalDryRunResult {
  return buildHrcCopiedDbRehearsalDryRunResult(validInput(overrides));
}

function validInput(
  overrides: Partial<HrcCopiedDbRehearsalDryRunOrchestratorInput> = {}
): HrcCopiedDbRehearsalDryRunOrchestratorInput {
  return {
    rehearsalId: "v3.1-copied-db-command-output-001",
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
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  expect(serialized).not.toContain("raw hrc");
}

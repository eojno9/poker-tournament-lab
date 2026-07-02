import { describe, expect, it } from "vitest";
import {
  buildHrcImportCommandReport,
  type HrcImportCommandReport,
  type HrcImportCommandReportInput
} from "../src/hrcImportCommandReport.js";
import { buildHrcImportNoWriteCliCommandPlan } from "../src/hrcImportNoWriteCliCommand.js";
import {
  assertNoHrcImportCommandOutputForbiddenExposure,
  renderHrcImportCommandReport,
  renderHrcImportCommandReportLines,
  renderHrcImportCommandReportText
} from "../src/hrcImportCommandOutputRenderer.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC import command output renderer", () => {
  it("renders an exitCode 0 command report as readable lines and text", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport(),
      commandPlan: buildHrcImportNoWriteCliCommandPlan(["import:hrc:preview", "--dry-run"])
    });

    expect(result.text).toContain("HRC Import Preview");
    expect(result.text).toContain("Mode: DRY_RUN");
    expect(result.text).toContain("Status: OK");
    expect(result.text).toContain("Exit Code: 0");
    expect(result.text).toContain("* Total: 28");
    expect(result.text).toContain("* Import Preview Allowed: 19");
    expect(result.text).toContain("* Manual Review Required: 8");
    expect(result.text).toContain("* Excluded: 1");
    expect(result.lineCount).toBe(result.lines.length);
    expect(assertNoHrcImportCommandOutputForbiddenExposure(result).pass).toBe(true);
  });

  it("renders an exitCode 1 validation blocking report", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport({
        validationSummary: {
          blockingIssueCount: 1,
          duplicateExistingDbCount: 1,
          duplicateInBatchCount: 0,
          missingCanonicalKeyCount: 0,
          privacyBlockedCount: 0
        }
      })
    });

    expect(result.text).toContain("Status: VALIDATION_BLOCKED");
    expect(result.text).toContain("Exit Code: 1");
    expect(result.text).toContain("* Duplicate Existing DB: 1");
    expect(result.text).toContain("* Blocking Issues: 1");
  });

  it("renders an exitCode 2 safety failure report", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport({
        dbSha256After: "DIFFERENT_SHA256",
        safetyGateSummary: {
          dbReadWriteNotPerformed: true
        }
      })
    });

    expect(result.text).toContain("Status: SAFETY_FAILED");
    expect(result.text).toContain("Exit Code: 2");
    expect(result.text).toContain("* DB SHA256 Unchanged: false");
    expect(result.text).toContain("* DB Read/Write Performed: false");
  });

  it("renders an exitCode 3 privacy/path failure report", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport({
        localPathExposureDetected: true
      })
    });

    expect(result.text).toContain("Status: PRIVACY_PATH_FAILED");
    expect(result.text).toContain("Exit Code: 3");
  });

  it("clearly displays write and file write flags as false", () => {
    const result = renderHrcImportCommandReport({ commandReport: validReport() });

    expect(result.text).toContain("Write Allowed: false");
    expect(result.text).toContain("DB Write Allowed: false");
    expect(result.text).toContain("Report File Write Allowed: false");
  });

  it("renders validation and safety summary counts from the report", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport({
        validationSummary: {
          blockingIssueCount: 3,
          duplicateExistingDbCount: 1,
          duplicateInBatchCount: 1,
          missingCanonicalKeyCount: 1,
          privacyBlockedCount: 0
        },
        safetyGateSummary: {
          dbReadWritePerformed: true
        },
        dbReadWritePerformed: true
      })
    });

    expect(result.text).toContain("* Duplicate Existing DB: 1");
    expect(result.text).toContain("* Duplicate In Batch: 1");
    expect(result.text).toContain("* Missing Canonical Key: 1");
    expect(result.text).toContain("* DB Read/Write Performed: true");
  });

  it("omits the warnings section when includeWarnings is false", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport({
        warnings: ["manual review warning"]
      }),
      includeWarnings: false
    });

    expect(result.hasWarnings).toBe(true);
    expect(result.text).not.toContain("Warnings:");
    expect(result.text).not.toContain("manual review warning");
  });

  it("omits the next action section when includeNextAction is false", () => {
    const result = renderHrcImportCommandReport({
      commandReport: validReport(),
      includeNextAction: false
    });

    expect(result.text).not.toContain("Next Action:");
    expect(result.text).not.toContain("Review dry-run command summary");
  });

  it("supports line-only and text-only convenience helpers", () => {
    const report = validReport();
    const lines = renderHrcImportCommandReportLines({ commandReport: report });
    const text = renderHrcImportCommandReportText({ commandReport: report });

    expect(lines[0]).toBe("HRC Import Preview");
    expect(text).toBe(lines.join("\n"));
  });

  it("redacts forbidden exposure in rendered output and records a renderer warning", () => {
    const report: HrcImportCommandReport = {
      ...validReport(),
      nextAction: "Review C:\\Users\\sample-user\\sample-external-hrc-folder\\sample-external-hrc-folder raw\\sample.zip with hero@example.com"
    };
    const result = renderHrcImportCommandReport({ commandReport: report });

    expect(result.forbiddenExposureDetected).toBe(true);
    expect(result.warnings).toContain("forbidden exposure redacted from command output");
    expectNoForbiddenOutput(result);
    expect(assertNoHrcImportCommandOutputForbiddenExposure(result).pass).toBe(false);
  });

  it("returns no forbidden exposure assertion warning for safe output", () => {
    const result = renderHrcImportCommandReport({ commandReport: validReport() });
    const assertion = assertNoHrcImportCommandOutputForbiddenExposure(result);

    expect(assertion).toEqual({ pass: true, warnings: [] });
  });

  it("uses no direct process, console, filesystem, DB, API, or report write operations in output", () => {
    const result = renderHrcImportCommandReport({ commandReport: validReport() });
    const serialized = JSON.stringify(result);
    const processArgvToken = ["process", "argv"].join(".");
    const consoleLogToken = ["console", "log"].join(".");

    expect(serialized).not.toContain(processArgvToken);
    expect(serialized).not.toContain(consoleLogToken);
    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("existsSync");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("mkdir");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validReport(overrides: Partial<HrcImportCommandReportInput> = {}): HrcImportCommandReport {
  return buildHrcImportCommandReport({
    commandName: "import:hrc:preview",
    mode: "DRY_RUN",
    timestampIso: "2026-06-22T12:00:00.000Z",
    previewSummary: {
      total: 28,
      importPreviewAllowedCount: 19,
      manualReviewRequiredCount: 8,
      excludedCount: 1
    },
    validationSummary: {
      blockingIssueCount: 0,
      duplicateExistingDbCount: 0,
      duplicateInBatchCount: 0,
      missingCanonicalKeyCount: 0,
      privacyBlockedCount: 0,
      dbWriteAllowedTrueCount: 0
    },
    backupManifestSummary: {
      writeAllowed: false,
      restoreRehearsalRequired: true
    },
    safetyGateSummary: {
      dbReadWriteNotPerformed: true
    },
    privacyScanPassed: true,
    dbSha256Before: DB_SHA256,
    dbSha256After: DB_SHA256,
    productImportRouteDisabled: true,
    dbReadWritePerformed: false,
    localPathExposureDetected: false,
    rawArtifactExposureDetected: false,
    warnings: [],
    ...overrides
  });
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("hero@example.com");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toContain("raw hrc");
}

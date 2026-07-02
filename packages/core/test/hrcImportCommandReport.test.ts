import { describe, expect, it } from "vitest";
import {
  buildHrcImportCommandReport,
  determineHrcImportCommandExitCode,
  summarizeHrcImportCommandReport,
  type HrcImportCommandReportInput
} from "../src/hrcImportCommandReport.js";

describe("HRC import command report shape helper", () => {
  it("builds a normal dry-run report with exitCode 0", () => {
    const report = buildHrcImportCommandReport(validInput());
    const summary = summarizeHrcImportCommandReport(report);

    expect(report.exitCode).toBe(0);
    expect(report.status).toBe("OK");
    expect(report.dbSha256Unchanged).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(summary.exitCode).toBe(0);
  });

  it("returns exitCode 1 for validation blocking issues", () => {
    const input = validInput({
      validationSummary: {
        blockingIssueCount: 1,
        duplicateExistingDbCount: 1
      }
    });
    const report = buildHrcImportCommandReport(input);

    expect(determineHrcImportCommandExitCode(input)).toBe(1);
    expect(report.exitCode).toBe(1);
    expect(report.status).toBe("VALIDATION_BLOCKED");
    expect(report.warnings).toContain("validation blocking issue detected");
  });

  it("returns exitCode 2 when DB SHA256 changes", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        dbSha256After: "DIFFERENT_SHA256"
      })
    );

    expect(report.exitCode).toBe(2);
    expect(report.status).toBe("SAFETY_FAILED");
    expect(report.dbSha256Unchanged).toBe(false);
    expect(report.warnings).toContain("DB SHA256 changed during dry-run command preview");
  });

  it("returns exitCode 2 when product import route is not disabled", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        productImportRouteDisabled: false
      })
    );

    expect(report.exitCode).toBe(2);
    expect(report.warnings).toContain("product import route is not disabled");
  });

  it("returns exitCode 2 when DB read/write was performed", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        dbReadWritePerformed: true
      })
    );

    expect(report.exitCode).toBe(2);
    expect(report.warnings).toContain("DB read/write was performed");
  });

  it("returns exitCode 3 when local path exposure is detected", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        localPathExposureDetected: true
      })
    );

    expect(report.exitCode).toBe(3);
    expect(report.status).toBe("PRIVACY_PATH_FAILED");
  });

  it("returns exitCode 3 when raw artifact exposure is detected", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        rawArtifactExposureDetected: true
      })
    );

    expect(report.exitCode).toBe(3);
    expect(report.status).toBe("PRIVACY_PATH_FAILED");
  });

  it("returns exitCode 4 for non-DRY_RUN mode when no higher priority issue exists", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        mode: "WRITE" as unknown as "DRY_RUN"
      })
    );

    expect(report.exitCode).toBe(4);
    expect(report.status).toBe("INVALID_INPUT");
    expect(report.mode).toBe("<invalid-mode>");
  });

  it("keeps write and file-output flags false", () => {
    const report = buildHrcImportCommandReport(validInput());
    const summary = summarizeHrcImportCommandReport(report);

    expect(report.writeAllowed).toBe(false);
    expect(report.dbWriteAllowed).toBe(false);
    expect(report.reportFileWriteAllowed).toBe(false);
    expect(summary.writeAllowed).toBe(false);
    expect(summary.dbWriteAllowed).toBe(false);
    expect(summary.reportFileWriteAllowed).toBe(false);
  });

  it("uses timestampIso from input without generating a timestamp", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        timestampIso: "2031-02-03T04:05:06.000Z"
      })
    );

    expect(report.timestampIso).toBe("2031-02-03T04:05:06.000Z");
  });

  it("redacts forbidden local path, user, email, and raw HRC strings from report output", () => {
    const report = buildHrcImportCommandReport(
      validInput({
        previewSummary: {
          rawPath: "<sample-user-home>\\sample-external-hrc-folder\\<sample-external-hrc-folder>\\raw.zip",
          email: "sample@example.test",
          userToken: "sample-private-token"
        },
        warnings: ["Found <sample-user-home>\\secret and sample@example.test"]
      })
    );
    const serialized = JSON.stringify(report);

    expect(report.exitCode).toBe(3);
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
    expect(serialized).not.toContain("sample-private-token");
    expect(serialized).not.toContain("sample@example.test");
    expect(serialized).not.toContain("sample-external-hrc-folder");
    expect(serialized).not.toContain("raw hrc");
    expect(report.warnings.some((warning) => warning.startsWith("redacted private token"))).toBe(true);
  });

  it("uses plain inputs without filesystem, DB, API, command, or report file operations", () => {
    const report = buildHrcImportCommandReport(validInput());
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(overrides: Partial<HrcImportCommandReportInput> = {}): HrcImportCommandReportInput {
  const sha = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

  return {
    commandName: "import:hrc:preview",
    mode: "DRY_RUN",
    timestampIso: "2026-06-21T14:00:00.000Z",
    previewSummary: {
      total: 28,
      readyForImportPreviewCount: 19,
      dbWriteAllowedTrueCount: 0
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
      restoreRehearsalRequired: true,
      allSafetyChecksPassed: true
    },
    safetyGateSummary: {
      rawZipAbsent: true,
      generatedArtifactJsonAbsent: true,
      hrcDryRunReportsAbsent: true,
      productImportRouteDisabled: true
    },
    privacyScanPassed: true,
    dbSha256Before: sha,
    dbSha256After: sha,
    productImportRouteDisabled: true,
    dbReadWritePerformed: false,
    localPathExposureDetected: false,
    rawArtifactExposureDetected: false,
    warnings: [],
    ...overrides
  };
}

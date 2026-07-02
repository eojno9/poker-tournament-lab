import { describe, expect, it } from "vitest";
import { buildHrcImportPreviewRow, type HrcImportPreviewRow } from "../src/hrcImportPreviewContract.js";
import {
  buildHrcImportDryRunOrchestration,
  type HrcImportDryRunOrchestrationInput
} from "../src/hrcImportDryRunOrchestrator.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC import dry-run orchestration helper", () => {
  it("orchestrates the v2.9 fixture with manual review and exclude as non-fatal", () => {
    const result = buildHrcImportDryRunOrchestration(validInput());

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("OK");
    expect(result.previewSummary.total).toBe(28);
    expect(result.previewSummary.importAllowedCount).toBe(19);
    expect(result.validationSummary.readyForImportPreviewCount).toBe(19);
    expect(result.validationSummary.blockedByDecisionCount).toBe(8);
    expect(result.validationSummary.excludedCount).toBe(1);
    expect(result.validationSummary.blockingIssueCount).toBe(0);
    expect(result.validationSummary.importPreviewAllowedCount).toBe(19);
    expect(result.writeAllowed).toBe(false);
    expect(result.dbWriteAllowed).toBe(false);
    expect(result.reportFileWriteAllowed).toBe(false);
    expect(result.commandReport.writeAllowed).toBe(false);
    expect(result.commandReport.dbWriteAllowed).toBe(false);
    expect(result.commandReport.reportFileWriteAllowed).toBe(false);
  });

  it("returns exitCode 1 for an existing DB canonical key collision", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        existingSolutionRows: [
          {
            id: "existing-001",
            canonicalKey: "candidate-key-007",
            source: "HRC_PRECOMPUTED_DB"
          }
        ]
      })
    );

    expect(result.validationSummary.duplicateExistingDbCount).toBe(1);
    expect(result.validationSummary.blockingIssueCount).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(result.status).toBe("VALIDATION_BLOCKED");
  });

  it("returns exitCode 1 for duplicate canonical keys inside the candidate batch", () => {
    const rows = buildV29PreviewRows();
    rows[1] = previewRow({
      id: "import-candidate-002",
      zipFileNameSanitized: "import-candidate-002.json",
      canonicalKeyPreview: "candidate-key-001",
      classification: "IMPORT_CANDIDATE"
    });
    const result = buildHrcImportDryRunOrchestration(validInput({ previewRows: rows }));

    expect(result.validationSummary.duplicateInBatchCount).toBeGreaterThan(0);
    expect(result.exitCode).toBe(1);
    expect(result.status).toBe("VALIDATION_BLOCKED");
  });

  it("returns exitCode 1 for missing canonical key on a ready import preview row", () => {
    const rows = buildV29PreviewRows();
    rows[0] = previewRow({
      id: "import-candidate-001",
      zipFileNameSanitized: "import-candidate-001.json",
      canonicalKeyPreview: null,
      classification: "IMPORT_CANDIDATE"
    });
    const result = buildHrcImportDryRunOrchestration(validInput({ previewRows: rows }));

    expect(result.validationSummary.missingCanonicalKeyCount).toBe(1);
    expect(result.validationSummary.blockingIssueCount).toBe(1);
    expect(result.exitCode).toBe(1);
  });

  it("returns exitCode 2 when DB SHA256 changes", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        dbSha256After: "DIFFERENT_SHA256"
      })
    );

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("SAFETY_FAILED");
    expect(result.commandReport.dbSha256Unchanged).toBe(false);
  });

  it("returns exitCode 2 when the product import route is not disabled", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        safetyChecks: {
          ...safeChecks(),
          productImportRouteDisabled: false
        }
      })
    );

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("SAFETY_FAILED");
    expect(result.warnings).toContain("product import route is not disabled");
  });

  it("returns exitCode 2 when DB read/write was performed", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        safetyChecks: {
          ...safeChecks(),
          dbReadWriteNotPerformed: false
        }
      })
    );

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("SAFETY_FAILED");
    expect(result.warnings).toContain("DB read/write was performed");
  });

  it("returns exitCode 3 for local path exposure without exposing the forbidden string", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        classificationSummary: {
          importCandidateCount: 19,
          rawPath: "<sample-user-home>\\sample-external-hrc-folder\\sample-external-hrc-folder raw\\sample.zip",
          email: "sample@example.test",
          userToken: "sample-private-token"
        },
        safetyChecks: {
          ...safeChecks(),
          localPathExposureDetected: true
        }
      })
    );
    const serialized = JSON.stringify(result);

    expect(result.exitCode).toBe(3);
    expect(result.status).toBe("PRIVACY_PATH_FAILED");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
    expect(serialized).not.toContain("sample-private-token");
    expect(serialized).not.toContain("sample@example.test");
    expect(serialized).not.toContain("sample-external-hrc-folder");
    expect(serialized).not.toContain("raw hrc");
  });

  it("returns exitCode 3 for raw artifact exposure", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        safetyChecks: {
          ...safeChecks(),
          rawArtifactExposureDetected: true
        }
      })
    );

    expect(result.exitCode).toBe(3);
    expect(result.status).toBe("PRIVACY_PATH_FAILED");
  });

  it("returns exitCode 4 for invalid command input when no higher priority issue exists", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        commandName: "import:hrc:write" as HrcImportDryRunOrchestrationInput["commandName"]
      })
    );

    expect(result.exitCode).toBe(4);
    expect(result.status).toBe("INVALID_INPUT");
    expect(result.commandReport.commandName).toBe("<invalid-command>");
  });

  it("sanitizes private tokens from existing solution snapshot output", () => {
    const result = buildHrcImportDryRunOrchestration(
      validInput({
        existingSolutionRows: [
          {
            id: "<sample-user-home>\\secret-row",
            canonicalKey: "<sample-user-home>\\secret-key",
            source: "<sample-user-home>\\source",
            sourceFile: "<sample-user-home>\\sample-external-hrc-folder\\raw.csv"
          }
        ]
      })
    );
    const serialized = JSON.stringify(result);

    expect(result.exitCode).toBe(3);
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
    expect(serialized).not.toContain("sample-external-hrc-folder");
  });

  it("uses only in-memory inputs and never describes filesystem, DB, API, or report file operations", () => {
    const result = buildHrcImportDryRunOrchestration(validInput());
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("Date.now");
    expect(serialized).not.toContain("Math.random");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(overrides: Partial<HrcImportDryRunOrchestrationInput> = {}): HrcImportDryRunOrchestrationInput {
  return {
    commandName: "import:hrc:preview",
    timestampIso: "2026-06-22T12:00:00.000Z",
    branchName: "v3.0-product-import-design",
    commitHash: "fd0d777887efb722b0f77c18c34a00a7ad57290d",
    dbFileName: "poker-tournament-lab.db",
    dbSha256Before: DB_SHA256,
    dbSha256After: DB_SHA256,
    previewRows: buildV29PreviewRows(),
    existingSolutionRows: [],
    classificationSummary: {
      IMPORT_CANDIDATE: 19,
      NEEDS_MANUAL_REVIEW: 8,
      HOLD: 0,
      EXCLUDE: 1
    },
    safetyChecks: safeChecks(),
    ...overrides
  };
}

function safeChecks(): HrcImportDryRunOrchestrationInput["safetyChecks"] {
  return {
    gitStatusClean: true,
    testPassed: true,
    buildPassed: true,
    smokePassed: true,
    privacyScanPassed: true,
    rawZipAbsent: true,
    generatedArtifactJsonAbsent: true,
    hrcDryRunReportsAbsent: true,
    productImportRouteDisabled: true,
    dbReadWriteNotPerformed: true,
    localPathExposureDetected: false,
    rawArtifactExposureDetected: false
  };
}

function previewRow(overrides: Partial<Parameters<typeof buildHrcImportPreviewRow>[0]> = {}): HrcImportPreviewRow {
  return buildHrcImportPreviewRow({
    id: "candidate-001",
    zipFileNameSanitized: "candidate-001.json",
    canonicalKeyPreview: "candidate-key-001",
    classification: "IMPORT_CANDIDATE",
    dryRunSucceeded: true,
    privacyPassed: true,
    dashboardReviewed: true,
    artifactReportAvailable: true,
    sourceKind: "V2_9_CLASSIFICATION_REPORT",
    sourceVersion: "v2.9",
    ...overrides
  });
}

function buildV29PreviewRows(): HrcImportPreviewRow[] {
  const rows: HrcImportPreviewRow[] = [];

  for (let index = 1; index <= 19; index += 1) {
    rows.push(
      previewRow({
        id: `import-candidate-${String(index).padStart(3, "0")}`,
        zipFileNameSanitized: `import-candidate-${String(index).padStart(3, "0")}.json`,
        canonicalKeyPreview: `candidate-key-${String(index).padStart(3, "0")}`,
        classification: "IMPORT_CANDIDATE"
      })
    );
  }

  for (let index = 1; index <= 8; index += 1) {
    rows.push(
      previewRow({
        id: `manual-review-${String(index).padStart(3, "0")}`,
        zipFileNameSanitized: `manual-review-${String(index).padStart(3, "0")}.json`,
        canonicalKeyPreview: `manual-review-key-${String(index).padStart(3, "0")}`,
        classification: "NEEDS_MANUAL_REVIEW"
      })
    );
  }

  rows.push(
    previewRow({
      id: "excluded-001",
      zipFileNameSanitized: "excluded-001.json",
      canonicalKeyPreview: "excluded-key-001",
      classification: "EXCLUDE",
      dryRunSucceeded: false,
      artifactReportAvailable: false
    })
  );

  return rows;
}

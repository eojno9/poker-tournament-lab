import { describe, expect, it } from "vitest";
import {
  buildHrcImportBackupManifest,
  summarizeHrcImportBackupManifest,
  validateHrcImportBackupSafetyChecks,
  type HrcImportBackupManifestInput
} from "../src/hrcImportBackupManifest.js";

describe("HRC import backup manifest helper", () => {
  it("builds a valid manifest from explicit input values", () => {
    const manifest = buildHrcImportBackupManifest(validInput());
    const summary = summarizeHrcImportBackupManifest(manifest);

    expect(manifest.version).toBe("v3.0-backup-manifest-preview");
    expect(manifest.backupId).toBe("v3-import-backup-001");
    expect(manifest.timestampIso).toBe("2026-06-21T13:00:00.000Z");
    expect(manifest.dbFileName).toBe("poker-tournament-lab.db");
    expect(manifest.dbSha256Before).toBe(
      "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461"
    );
    expect(summary.allSafetyChecksPassed).toBe(true);
    expect(summary.warningCount).toBe(0);
  });

  it("keeps writeAllowed false and restoreRehearsalRequired true", () => {
    const manifest = buildHrcImportBackupManifest(validInput());

    expect(manifest.writeAllowed).toBe(false);
    expect(manifest.restoreRehearsalRequired).toBe(true);
    expect(summarizeHrcImportBackupManifest(manifest).writeAllowed).toBe(false);
    expect(summarizeHrcImportBackupManifest(manifest).restoreRehearsalRequired).toBe(true);
  });

  it("warns when dbSha256Before is missing", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        dbSha256Before: "   "
      })
    );

    expect(manifest.dbSha256Before).toBe("   ");
    expect(manifest.warnings).toContain("missing required field: dbSha256Before");
    expect(summarizeHrcImportBackupManifest(manifest).dbSha256BeforePresent).toBe(false);
  });

  it("adds warnings when any safety check is false", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          buildPassed: false
        }
      })
    );
    const safety = validateHrcImportBackupSafetyChecks(manifest);

    expect(safety.pass).toBe(false);
    expect(safety.failedChecks).toEqual(["buildPassed"]);
    expect(manifest.warnings).toContain("safety check failed: buildPassed");
  });

  it("warns when rawZipAbsent is false", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          rawZipAbsent: false
        }
      })
    );

    expect(validateHrcImportBackupSafetyChecks(manifest).failedChecks).toContain("rawZipAbsent");
    expect(manifest.warnings).toContain("safety check failed: rawZipAbsent");
  });

  it("warns when productImportRouteDisabled is false", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          productImportRouteDisabled: false
        }
      })
    );

    expect(validateHrcImportBackupSafetyChecks(manifest).failedChecks).toContain("productImportRouteDisabled");
    expect(manifest.warnings).toContain("safety check failed: productImportRouteDisabled");
  });

  it("warns when dbReadWriteNotPerformed is false", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          dbReadWriteNotPerformed: false
        }
      })
    );

    expect(validateHrcImportBackupSafetyChecks(manifest).failedChecks).toContain("dbReadWriteNotPerformed");
    expect(manifest.warnings).toContain("safety check failed: dbReadWriteNotPerformed");
  });

  it("uses timestampIso from input without generating a timestamp", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        timestampIso: "2030-01-02T03:04:05.000Z"
      })
    );

    expect(manifest.timestampIso).toBe("2030-01-02T03:04:05.000Z");
  });

  it("redacts local paths, user tokens, HRC folder names, and emails from public manifest fields", () => {
    const manifest = buildHrcImportBackupManifest(
      validInput({
        dbFileName: "<local-project-root>\\apps\\server\\data\\poker-tournament-lab.db",
        importPreviewSummary: {
          rawPath: "<sample-user-home>\\sample-external-hrc-folder\\<sample-external-hrc-folder>\\raw.zip",
          reviewer: "sample@example.test",
          userToken: "sample-private-token"
        },
        rollbackInstructions: [
          "Restore from <sample-user-home>\\Documents\\Backup\\poker-tournament-lab.db",
          "Notify sample@example.test only in private notes"
        ]
      })
    );
    const serialized = JSON.stringify(manifest);

    expect(manifest.dbFileName).toBe("poker-tournament-lab.db");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
    expect(serialized).not.toContain("sample-private-token");
    expect(serialized).not.toContain("sample@example.test");
    expect(serialized).not.toContain("sample-external-hrc-folder");
    expect(serialized).not.toContain("raw hrc");
    expect(manifest.warnings.some((warning) => warning.startsWith("redacted private token"))).toBe(true);
  });

  it("uses plain in-memory inputs without filesystem, DB, API, or backup operations", () => {
    const manifest = buildHrcImportBackupManifest(validInput());
    const serialized = JSON.stringify(manifest);

    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(overrides: Partial<HrcImportBackupManifestInput> = {}): HrcImportBackupManifestInput {
  return {
    backupId: "v3-import-backup-001",
    timestampIso: "2026-06-21T13:00:00.000Z",
    branchName: "v3.0-product-import-design",
    commitHash: "00c6933a576f36a9b759e2ab2799de0ee50308b9",
    dbFileName: "poker-tournament-lab.db",
    dbSha256Before: "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461",
    importPreviewSummary: {
      total: 28,
      readyForImportPreviewCount: 19,
      dbWriteAllowedTrueCount: 0
    },
    validationSummary: {
      duplicateExistingDbCount: 0,
      duplicateInBatchCount: 0,
      missingCanonicalKeyCount: 0
    },
    classificationSummary: {
      IMPORT_CANDIDATE: 19,
      NEEDS_MANUAL_REVIEW: 8,
      HOLD: 0,
      EXCLUDE: 1
    },
    safetyChecks: validSafetyChecks(),
    rollbackInstructions: [
      "Stop import process.",
      "Restore backup DB.",
      "Verify post-rollback DB SHA256.",
      "Run test/build/smoke."
    ],
    ...overrides
  };
}

function validSafetyChecks() {
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
    dbReadWriteNotPerformed: true
  };
}

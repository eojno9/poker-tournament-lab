import { describe, expect, it } from "vitest";
import {
  buildHrcCopiedDbRehearsalManifest,
  summarizeHrcCopiedDbRehearsalManifest,
  validateHrcCopiedDbRehearsalSafetyChecks,
  type HrcCopiedDbRehearsalManifestInput
} from "../src/hrcCopiedDbRehearsalManifest.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("HRC copied DB rehearsal manifest helper", () => {
  it("builds a valid manifest from explicit input values", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(validInput());
    const summary = summarizeHrcCopiedDbRehearsalManifest(manifest);

    expect(manifest.version).toBe("v3.0-copied-db-rehearsal-manifest-preview");
    expect(manifest.rehearsalId).toBe("v3-copied-db-rehearsal-001");
    expect(manifest.timestampIso).toBe("2026-06-23T13:00:00.000Z");
    expect(manifest.branchName).toBe("v3.0-product-import-design");
    expect(manifest.productionDbSha256Unchanged).toBe(true);
    expect(manifest.copiedDbSha256Changed).toBe(false);
    expect(manifest.importPreviewAllowed).toBe(19);
    expect(manifest.warnings).toEqual([]);
    expect(summary.allSafetyChecksPassed).toBe(true);
    expect(summary.warningCount).toBe(0);
  });

  it("keeps all write flags false", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(validInput());
    const summary = summarizeHrcCopiedDbRehearsalManifest(manifest);

    expect(manifest.productionDbWriteAllowed).toBe(false);
    expect(manifest.copiedDbWriteAllowed).toBe(false);
    expect(manifest.reportFileWriteAllowed).toBe(false);
    expect(summary.productionDbWriteAllowed).toBe(false);
    expect(summary.copiedDbWriteAllowed).toBe(false);
    expect(summary.reportFileWriteAllowed).toBe(false);
  });

  it("warns when production DB SHA before and after do not match", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        productionDbSha256After: "DIFFERENT_SHA256",
        safetyChecks: {
          ...validSafetyChecks(),
          productionDbShaUnchanged: false
        }
      })
    );

    expect(manifest.productionDbSha256Unchanged).toBe(false);
    expect(manifest.warnings).toContain("production DB SHA256 changed during copied-DB rehearsal preview");
    expect(manifest.warnings).toContain("safety check failed: productionDbShaUnchanged");
  });

  it("tracks copied DB SHA changes while keeping write flags false", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        copiedDbSha256After: "COPIED_DB_CHANGED_SHA256"
      })
    );

    expect(manifest.copiedDbSha256Changed).toBe(true);
    expect(manifest.productionDbWriteAllowed).toBe(false);
    expect(manifest.copiedDbWriteAllowed).toBe(false);
    expect(manifest.reportFileWriteAllowed).toBe(false);
  });

  it("keeps copiedDbWriteAllowed false even when explicit approval is recorded", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        explicitApprovalRecorded: true
      })
    );

    expect(manifest.explicitApprovalRecorded).toBe(true);
    expect(manifest.copiedDbWriteAllowed).toBe(false);
    expect(manifest.productionDbWriteAllowed).toBe(false);
  });

  it("adds warnings when any safety check is false", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          buildPassed: false
        }
      })
    );
    const safety = validateHrcCopiedDbRehearsalSafetyChecks(manifest);

    expect(safety.pass).toBe(false);
    expect(safety.failedChecks).toEqual(["buildPassed"]);
    expect(manifest.warnings).toContain("safety check failed: buildPassed");
  });

  it("warns when copiedDbTargetAllowed is false", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        copiedDbPathGuardDecision: "BLOCKED_PRODUCTION_DB_TARGET",
        safetyChecks: {
          ...validSafetyChecks(),
          copiedDbTargetAllowed: false
        }
      })
    );

    expect(manifest.warnings).toContain("copied DB path guard did not allow target: BLOCKED_PRODUCTION_DB_TARGET");
    expect(manifest.warnings).toContain("safety check failed: copiedDbTargetAllowed");
  });

  it("warns when product import route is not disabled", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          productImportRouteDisabled: false
        }
      })
    );

    expect(manifest.warnings).toContain("safety check failed: productImportRouteDisabled");
  });

  it("warns when DB read/write was performed", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          dbReadWriteNotPerformed: false
        }
      })
    );

    expect(manifest.warnings).toContain("safety check failed: dbReadWriteNotPerformed");
  });

  it("warns when report JSON was generated", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        safetyChecks: {
          ...validSafetyChecks(),
          reportJsonNotGenerated: false
        }
      })
    );

    expect(manifest.warnings).toContain("safety check failed: reportJsonNotGenerated");
  });

  it("warns when rollback plan is unavailable", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        rollbackPlanAvailable: false
      })
    );

    expect(manifest.warnings).toContain("rollback plan is not available");
  });

  it("warns when dry-run exitCode is non-zero", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        dryRunExitCode: 1
      })
    );

    expect(manifest.warnings).toContain("dry-run exitCode was non-zero: 1");
  });

  it("redacts forbidden local/private/raw path strings from manifest output", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(
      validInput({
        rehearsalId: "C:\\Users\\sample-user\\rehearsal",
        validationSummary: {
          rawPath: "<sample-user-home>\\sample-external-hrc-folder\\<sample-external-hrc-folder>\\raw.zip",
          reviewer: "sample@example.test",
          userToken: "sample-private-token"
        }
      })
    );

    expectNoForbiddenOutput(manifest);
    expect(manifest.warnings.some((warning) => warning.startsWith("redacted private token"))).toBe(true);
  });

  it("uses only in-memory inputs without filesystem, DB, API, Date.now, random, or report file operations", () => {
    const manifest = buildHrcCopiedDbRehearsalManifest(validInput());
    const serialized = JSON.stringify({
      manifest,
      buildSource: buildHrcCopiedDbRehearsalManifest.toString()
    });

    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("Date.now");
    expect(serialized).not.toContain("Math.random");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(overrides: Partial<HrcCopiedDbRehearsalManifestInput> = {}): HrcCopiedDbRehearsalManifestInput {
  return {
    rehearsalId: "v3-copied-db-rehearsal-001",
    timestampIso: "2026-06-23T13:00:00.000Z",
    branchName: "v3.0-product-import-design",
    commitHash: "70594a7ad9dff5f3b2601e008bb3321ff43f1780",
    productionDbSha256Before: DB_SHA256,
    productionDbSha256After: DB_SHA256,
    copiedDbSha256Before: DB_SHA256,
    copiedDbSha256After: DB_SHA256,
    copiedDbPathGuardDecision: "ALLOWED_COPIED_DB_TARGET",
    dryRunExitCode: 0,
    importPreviewAllowed: 19,
    validationSummary: {
      duplicateExistingDbCount: 0,
      duplicateInBatchCount: 0,
      missingCanonicalKeyCount: 0,
      blockingIssueCount: 0
    },
    safetyChecks: validSafetyChecks(),
    rollbackPlanAvailable: true,
    explicitApprovalRecorded: false,
    ...overrides
  };
}

function validSafetyChecks() {
  return {
    gitStatusClean: true,
    testPassed: true,
    buildPassed: true,
    smokePassed: true,
    productionDbShaUnchanged: true,
    copiedDbTargetAllowed: true,
    productImportRouteDisabled: true,
    dbReadWriteNotPerformed: true,
    reportJsonNotGenerated: true,
    rawZipAbsent: true,
    generatedArtifactJsonAbsent: true,
    hrcDryRunReportsAbsent: true,
    privacyPathScanPassed: true
  };
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toContain("raw hrc");
}

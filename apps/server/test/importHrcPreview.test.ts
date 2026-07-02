import { describe, expect, it, vi } from "vitest";
import {
  buildHrcImportPreviewRow,
  type HrcExistingSolutionSnapshotInputRow,
  type HrcImportDryRunOrchestrationSafetyChecks,
  type HrcImportPreviewRow
} from "@poker-tournament-lab/core";
import {
  parseHrcImportPreviewArgs,
  renderHrcImportPreviewOutput,
  runHrcImportPreviewEntrypoint,
  type HrcImportPreviewEntrypointContext
} from "../src/cli/importHrcPreview.js";

const DB_SHA256 = "92BBF8DA75EA34ABF4CBCF8111ADBCD729DA93D7DDE690E14EB52482A8E16461";

describe("no-write HRC import preview entrypoint", () => {
  it("returns sanitized help without command side effects", () => {
    const result = runHrcImportPreviewEntrypoint(["--help"], validContext());

    expect(result.exitCode).toBe(0);
    expect(result.report).toBe(null);
    expect(result.stdoutLines.join("\n")).toContain("HRC import preview entrypoint (no-write).");
    expect(result.stdoutLines.join("\n")).toContain("Allowed flags");
    expect(result.writeAllowed).toBe(false);
    expect(result.dbWriteAllowed).toBe(false);
    expect(result.reportFileWriteAllowed).toBe(false);
    expect(result.stderrLines).toEqual([]);
    expectNoForbiddenOutput(result);
  });

  it("runs the v2.9 dry-run fixture with exitCode 0 and importPreviewAllowed 19", () => {
    const result = runHrcImportPreviewEntrypoint(["import:hrc:preview", "--dry-run"], validContext());

    expect(result.exitCode).toBe(0);
    expect(result.report?.status).toBe("OK");
    expect(result.report?.writeAllowed).toBe(false);
    expect(result.report?.dbWriteAllowed).toBe(false);
    expect(result.report?.reportFileWriteAllowed).toBe(false);
    expect(result.stdoutLines.join("\n")).toContain("* Import Preview Allowed: 19");
    expect(result.stdoutLines.join("\n")).toContain("* Manual Review Required: 8");
    expectNoForbiddenOutput(result);
  });

  it("accepts import:hrc:dry-run through --command-name", () => {
    const result = runHrcImportPreviewEntrypoint(["--command-name", "import:hrc:dry-run", "--dry-run"], validContext());

    expect(result.exitCode).toBe(0);
    expect(result.report?.commandName).toBe("import:hrc:dry-run");
    expect(result.commandPlan.commandName).toBe("import:hrc:dry-run");
  });

  it.each(["--write", "--force", "--db-write", "--production", "--output-json", "--report-json", "--artifact-json"])(
    "rejects safety forbidden flag %s",
    (flag) => {
      const result = runHrcImportPreviewEntrypoint(["import:hrc:preview", "--dry-run", flag], validContext());

      expect(result.exitCode).toBe(2);
      expect(result.report).toBe(null);
      expect(result.stderrLines.join("\n")).toContain(`forbidden flag rejected: ${flag}`);
      expect(result.writeAllowed).toBe(false);
      expect(result.dbWriteAllowed).toBe(false);
      expect(result.reportFileWriteAllowed).toBe(false);
      expectNoForbiddenOutput(result);
    }
  );

  it.each(["--raw", "--raw-hrc"])("rejects raw HRC forbidden flag %s as privacy/path failure", (flag) => {
    const result = runHrcImportPreviewEntrypoint(["import:hrc:preview", "--dry-run", flag], validContext());

    expect(result.exitCode).toBe(3);
    expect(result.report).toBe(null);
    expect(result.stderrLines.join("\n")).toContain(`forbidden flag rejected: ${flag}`);
    expectNoForbiddenOutput(result);
  });

  it("accepts a safe copied DB target without reading or writing the file", () => {
    const result = runHrcImportPreviewEntrypoint(
      [
        "import:hrc:preview",
        "--dry-run",
        "--target-db",
        "<local-backup-root>/v3.0-copied-db-rehearsal-20260623-120000/poker-tournament-lab.db"
      ],
      validContext()
    );

    expect(result.exitCode).toBe(0);
    expect(result.commandPlan.requiresCopiedDbPathGuard).toBe(true);
    expect(result.commandPlan.copiedDbPathGuardResult?.allowed).toBe(true);
    expect(result.commandPlan.copiedDbPathGuardResult?.decision).toBe("ALLOWED_COPIED_DB_TARGET");
    expectNoForbiddenOutput(result);
  });

  it("rejects a production DB target", () => {
    const result = runHrcImportPreviewEntrypoint(
      [
        "import:hrc:preview",
        "--dry-run",
        "--target-db",
        "<repo-root>/apps/server/data/poker-tournament-lab.db"
      ],
      validContext()
    );

    expect(result.exitCode).toBe(2);
    expect(result.commandPlan.copiedDbPathGuardResult?.decision).toBe("BLOCKED_PRODUCTION_DB_TARGET");
    expect(result.stderrLines.join("\n")).toContain("copied DB target rejected: BLOCKED_PRODUCTION_DB_TARGET");
  });

  it("rejects a repo-local copied DB target", () => {
    const result = runHrcImportPreviewEntrypoint(
      ["import:hrc:preview", "--dry-run", "--target-db", "<repo-root>/tmp/poker-tournament-lab.db"],
      validContext()
    );

    expect(result.exitCode).toBe(2);
    expect(result.commandPlan.copiedDbPathGuardResult?.decision).toBe("BLOCKED_REPO_LOCAL_TARGET");
  });

  it("returns exitCode 1 for duplicate existing DB validation", () => {
    const result = runHrcImportPreviewEntrypoint(
      ["import:hrc:preview", "--dry-run"],
      validContext({
        existingSolutionRows: [
          {
            id: "existing-001",
            canonicalKey: "candidate-key-007",
            source: "HRC_PRECOMPUTED_DB"
          }
        ]
      })
    );

    expect(result.exitCode).toBe(1);
    expect(result.report?.status).toBe("VALIDATION_BLOCKED");
    expect(result.stdoutLines.join("\n")).toContain("* Duplicate Existing DB: 1");
  });

  it("returns exitCode 2 for safety failure", () => {
    const result = runHrcImportPreviewEntrypoint(
      ["import:hrc:preview", "--dry-run"],
      validContext({
        dbSha256After: "DIFFERENT_SHA256"
      })
    );

    expect(result.exitCode).toBe(2);
    expect(result.report?.status).toBe("SAFETY_FAILED");
    expect(result.stdoutLines.join("\n")).toContain("* DB SHA256 Unchanged: false");
  });

  it("returns exitCode 3 for privacy/path failure without leaking forbidden strings", () => {
    const result = runHrcImportPreviewEntrypoint(
      ["import:hrc:preview", "--dry-run"],
      validContext({
        classificationSummary: {
          IMPORT_CANDIDATE: 19,
          rawPath: "C:\\Users\\sample-user\\sample-external-hrc-folder\\sample-external-hrc-folder raw\\sample.zip",
          email: "hero@example.com",
          token: "sample-private-token"
        },
        safetyChecks: {
          ...safeChecks(),
          localPathExposureDetected: true
        }
      })
    );

    expect(result.exitCode).toBe(3);
    expect(result.report?.status).toBe("PRIVACY_PATH_FAILED");
    expectNoForbiddenOutput(result);
  });

  it("returns exitCode 4 for invalid input", () => {
    const result = runHrcImportPreviewEntrypoint(["--dry-run"], validContext());

    expect(result.exitCode).toBe(4);
    expect(result.report).toBe(null);
    expect(result.stderrLines).toContain("invalid or missing command name");
  });

  it("renders output through the pure output wrapper", () => {
    const result = runHrcImportPreviewEntrypoint(["import:hrc:preview", "--dry-run"], validContext());
    const rendered = renderHrcImportPreviewOutput(result);

    expect(rendered.stdoutText).toBe(result.stdoutLines.join("\n"));
    expect(rendered.stderrText).toBe("");
    expect(rendered.stdoutLines[0]).toBe("HRC Import Preview");
    expectNoForbiddenOutput(rendered);
  });

  it("parses args without exposing target DB private strings", () => {
    const parsed = parseHrcImportPreviewArgs(
      [
        "import:hrc:preview",
        "--dry-run",
        "--target-db",
        "C:\\Users\\sample-user\\Documents\\backup\\poker-tournament-lab.db"
      ],
      validContext()
    );

    expect(parsed.exitCode).toBe(2);
    expect(parsed.commandPlan.copiedDbPathGuardResult?.normalizedTargetDbPathRedacted).toBe(
      "<redacted-local-path>/poker-tournament-lab.db"
    );
    expectNoForbiddenOutput(parsed);
  });

  it("does not call process exit or console log", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined as never));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const result = runHrcImportPreviewEntrypoint(["import:hrc:preview", "--dry-run"], validContext());

      expect(result.exitCode).toBe(0);
      expect(exitSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it("does not describe file writes, DB reads or writes, report JSON creation, package scripts, or runtime calls", () => {
    const result = runHrcImportPreviewEntrypoint(["import:hrc:preview", "--dry-run"], validContext());
    const serialized = JSON.stringify(result);
    const disallowedTokens = [
      "readFile",
      "writeFile",
      "mkdir",
      "sqlite",
      "fetch(",
      "package.json script added",
      "report JSON created",
      "artifacts/hrc-dry-run-reports"
    ];

    for (const token of disallowedTokens) {
      expect(serialized).not.toContain(token);
    }
  });
});

function validContext(overrides: Partial<HrcImportPreviewEntrypointContext> = {}): HrcImportPreviewEntrypointContext {
  return {
    previewRows: buildV29PreviewRows(),
    existingSolutionRows: [],
    classificationSummary: {
      IMPORT_CANDIDATE: 19,
      NEEDS_MANUAL_REVIEW: 8,
      HOLD: 0,
      EXCLUDE: 1
    },
    safetyChecks: safeChecks(),
    dbSha256Before: DB_SHA256,
    dbSha256After: DB_SHA256,
    timestampIso: "2026-06-23T12:00:00.000Z",
    branchName: "v3.0-product-import-design",
    commitHash: "5660e7b8b314ace3d1865c20339051070d3dee2c",
    dbFileName: "poker-tournament-lab.db",
    productionDbPath: "<repo-root>/apps/server/data/poker-tournament-lab.db",
    repoRootPath: "<repo-root>",
    backupRootPath: "<local-backup-root>",
    ...overrides
  };
}

function safeChecks(): HrcImportDryRunOrchestrationSafetyChecks {
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

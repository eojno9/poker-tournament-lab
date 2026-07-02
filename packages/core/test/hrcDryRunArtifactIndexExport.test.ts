import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runHrcDryRunArtifactIndexExport,
  resolveAllowedReportsDir,
} from "../../../scripts/hrcDryRunArtifactIndexExport.js";
import {
  buildHrcDryRunArtifactReport,
  type HrcDryRunArtifactReport,
} from "./helpers/hrcDryRunArtifactReport.js";
import type { HrcRawZipDryRunReport } from "./helpers/hrcRawZipDryRunReader.js";

const generatedAt = new Date("2026-06-16T17:10:00.000Z");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createTempRepo(): string {
  return createTempDir("hrc-index-repo-");
}

function reportsDir(repoRoot: string): string {
  return join(repoRoot, "artifacts", "hrc-dry-run-reports");
}

function repoRoot(): string {
  return resolve(process.cwd(), "..", "..");
}

function baseDryRunReport(
  overrides: Partial<HrcRawZipDryRunReport> = {},
): HrcRawZipDryRunReport {
  return {
    status: "OK",
    zipDetected: true,
    zipPathMasked: "<repo-external>/sample-raw.zip",
    zipPathInsideRepo: false,
    entryCount: 2,
    hasSettingsJson: true,
    nodeEntryCount: 1,
    nodeEntriesSample: ["nodes/0.json"],
    selectedNodeEntry: "nodes/0.json",
    selectedNodeReason: "nodes/0.json is present and selected by policy",
    multipleNodeEntriesDetected: false,
    nodeSelectionPolicy: "PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST",
    multiNodeAggregationApplied: false,
    settingsTopLevelKeys: ["handdata", "eqmodel", "treeconfig", "engine"],
    nodeTopLevelKeys: ["player", "street", "sequence", "actions", "hands"],
    rawNodeRecognized: true,
    actionCount: 3,
    handCount: 169,
    sequenceLength: 6,
    privacySafe: true,
    privacyWarnings: [],
    privacyPatternMatches: [],
    rawZipCommitted: false,
    productImportConnected: false,
    amountUnit: "UNKNOWN",
    amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
    adapterCandidateBuilt: true,
    adapterValidatorPass: true,
    adapterReportSummary: {
      candidateBuilt: true,
      sourceShape: "HRC_RAW_NODE",
      targetShape: "APP_V2_MULTI_ACTION_CANDIDATE",
      handCount: 169,
      actionCount: 3,
      convertedHandCount: 169,
      convertedActionCount: 507,
      unknownActionCount: 0,
      missingPlayedCount: 0,
      missingEvsCount: 0,
      lengthMismatchCount: 0,
      rawValidatorPass: false,
      candidateValidatorPass: true,
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      productImportRouteConnected: false,
      warningCount: 0,
      warningsCount: 0,
    },
    validatorResult: {
      attempted: true,
      valid: true,
      pass: true,
      errorCount: 0,
      warningCount: 0,
      checkedHands: 169,
      expectedHands: 169,
      sourceLabel: "APP_V2_MULTI_ACTION_CANDIDATE",
      issueMessages: [],
      warningMessages: [],
    },
    mismatchSummary: {
      hasMismatch: false,
      mismatchCount: 0,
      categories: [],
      sample: [],
      fatal: false,
    },
    adapterReport: null,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function artifact(
  zipFileName: string,
  generatedAtValue: string,
  overrides: Partial<HrcRawZipDryRunReport> = {},
): HrcDryRunArtifactReport {
  return buildHrcDryRunArtifactReport(baseDryRunReport(overrides), {
    generatedAt: generatedAtValue,
    zipFileName,
  });
}

function writeReport(
  repoRootPath: string,
  fileName: string,
  report: HrcDryRunArtifactReport,
): void {
  const dir = reportsDir(repoRootPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), `${JSON.stringify(report, null, 2)}\n`);
}

function runIndex(input: {
  repoRoot: string;
  reports?: string;
  out?: string;
  allow?: boolean;
}) {
  const argv: string[] = [];
  if (input.reports) {
    argv.push("--reports", input.reports);
  }
  if (input.out) {
    argv.push("--out", input.out);
  }
  if (input.allow) {
    argv.push("--allow-repo-artifact-write");
  }

  return runHrcDryRunArtifactIndexExport(argv, {
    repoRoot: input.repoRoot,
    now: () => generatedAt,
  });
}

function collectRuntimeFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRuntimeFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("opt-in HRC dry-run artifact index export command", () => {
  it("refuses index/comparison writes without the explicit allow flag", () => {
    const tempRepo = createTempRepo();
    writeReport(
      tempRepo,
      "hrc-dry-run-alpha.json",
      artifact("alpha.zip", "2026-06-16T17:00:00.000Z"),
    );

    const result = runIndex({ repoRoot: tempRepo });

    expect(result.status).toBe("ALLOW_FLAG_REQUIRED");
    expect(result.ok).toBe(false);
    expect(result.indexWritten).toBe(false);
    expect(result.comparisonWritten).toBe(false);
    expect(result.reportCount).toBe(1);
    expect(readdirSync(reportsDir(tempRepo))).toEqual([
      "hrc-dry-run-alpha.json",
    ]);
  });

  it("writes index and comparison artifacts only with allow-repo-artifact-write", () => {
    const tempRepo = createTempRepo();
    writeReport(
      tempRepo,
      "hrc-dry-run-bravo.json",
      artifact("bravo.zip", "2026-06-16T17:00:02.000Z"),
    );
    writeReport(
      tempRepo,
      "hrc-dry-run-alpha.json",
      artifact("alpha.zip", "2026-06-16T17:00:01.000Z", {
        mismatchSummary: {
          hasMismatch: true,
          mismatchCount: 2,
          categories: ["length_mismatch", "missing_evs"],
          sample: ["AA", "AKs"],
          fatal: false,
        },
        warnings: ["MULTIPLE_NODE_ENTRIES"],
        multipleNodeEntriesDetected: true,
      }),
    );

    const result = runIndex({ repoRoot: tempRepo, allow: true });

    expect(result.status).toBe("OK");
    expect(result.indexWritten).toBe(true);
    expect(result.comparisonWritten).toBe(true);
    expect(result.indexFileName).toBe("hrc-dry-run-index-20260616-171000.json");
    expect(result.comparisonFileName).toBe(
      "hrc-dry-run-comparison-20260616-171000.json",
    );

    const index = JSON.parse(readFileSync(result.indexOutputPath ?? "", "utf8"));
    const comparison = JSON.parse(
      readFileSync(result.comparisonOutputPath ?? "", "utf8"),
    );

    expect(index.reportCount).toBe(2);
    expect(index.statusCounts.OK).toBe(2);
    expect(index.validatorPassCount).toBe(2);
    expect(index.validatorFailCount).toBe(0);
    expect(index.mismatchCountTotal).toBe(2);
    expect(index.mismatchCategories).toEqual([
      "length_mismatch",
      "missing_evs",
    ]);
    expect(index.warningCountTotal).toBe(1);
    expect(index.errorCountTotal).toBe(0);
    expect(index.amountUnitCounts.UNKNOWN).toBe(2);
    expect(index.reports.map((row: { zipFileNameSanitized: string }) => row.zipFileNameSanitized)).toEqual([
      "alpha.zip",
      "bravo.zip",
    ]);
    expect(comparison.sourceKind).toBe("HRC_RAW_ZIP_DRY_RUN_COMPARISON");
    expect(comparison.rows.map((row: { zipFileNameSanitized: string }) => row.zipFileNameSanitized)).toEqual([
      "alpha.zip",
      "bravo.zip",
    ]);
    expect(comparison.rows[0]).toEqual(
      expect.objectContaining({
        selectedNodeEntry: "nodes/0.json",
        multipleNodeEntriesDetected: true,
        multiNodeAggregationApplied: false,
        validatorPassed: true,
        mismatchCount: 2,
        warningCount: 1,
        errorCount: 0,
        amountUnit: "UNKNOWN",
        amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      }),
    );
  });

  it("rejects reports path outside artifacts/hrc-dry-run-reports", () => {
    const tempRepo = createTempRepo();
    const outside = createTempDir("hrc-index-outside-");
    const result = runIndex({
      repoRoot: tempRepo,
      reports: outside,
      allow: true,
    });

    expect(result.status).toBe("REPORTS_DIR_NOT_ALLOWED");
    expect(result.indexWritten).toBe(false);
    expect(result.comparisonWritten).toBe(false);
  });

  it("rejects output path outside artifacts/hrc-dry-run-reports", () => {
    const tempRepo = createTempRepo();
    writeReport(
      tempRepo,
      "hrc-dry-run-alpha.json",
      artifact("alpha.zip", "2026-06-16T17:00:00.000Z"),
    );
    const result = runIndex({
      repoRoot: tempRepo,
      out: join(createTempDir("hrc-index-out-"), "reports"),
      allow: true,
    });

    expect(result.status).toBe("OUTPUT_DIR_NOT_ALLOWED");
    expect(result.indexWritten).toBe(false);
    expect(result.comparisonWritten).toBe(false);
  });

  it("rejects path traversal in reports and output paths", () => {
    const tempRepo = createTempRepo();

    expect(
      runIndex({
        repoRoot: tempRepo,
        reports: "artifacts/hrc-dry-run-reports/../outside",
        allow: true,
      }).status,
    ).toBe("REPORTS_DIR_NOT_ALLOWED");
    expect(
      runIndex({
        repoRoot: tempRepo,
        out: "artifacts/hrc-dry-run-reports/../outside",
        allow: true,
      }).status,
    ).toBe("OUTPUT_DIR_NOT_ALLOWED");
  });

  it("rejects zip, non-json, malformed, and schema-invalid report inputs", () => {
    const zipRepo = createTempRepo();
    mkdirSync(reportsDir(zipRepo), { recursive: true });
    writeFileSync(join(reportsDir(zipRepo), "raw.zip"), "not a report");
    expect(runIndex({ repoRoot: zipRepo, allow: true }).status).toBe(
      "REPORT_FILE_REJECTED",
    );

    const textRepo = createTempRepo();
    mkdirSync(reportsDir(textRepo), { recursive: true });
    writeFileSync(join(reportsDir(textRepo), "report.txt"), "not json");
    expect(runIndex({ repoRoot: textRepo, allow: true }).status).toBe(
      "REPORT_FILE_REJECTED",
    );

    const malformedRepo = createTempRepo();
    mkdirSync(reportsDir(malformedRepo), { recursive: true });
    writeFileSync(join(reportsDir(malformedRepo), "report.json"), "{");
    expect(runIndex({ repoRoot: malformedRepo, allow: true }).status).toBe(
      "REPORT_PARSE_ERROR",
    );

    const invalidRepo = createTempRepo();
    mkdirSync(reportsDir(invalidRepo), { recursive: true });
    writeFileSync(
      join(reportsDir(invalidRepo), "report.json"),
      JSON.stringify({ schemaVersion: "nope", sourceKind: "NOPE" }),
    );
    expect(runIndex({ repoRoot: invalidRepo, allow: true }).status).toBe(
      "REPORT_SCHEMA_INVALID",
    );
  });

  it("rejects unsafe flags and privacy unsafe reports", () => {
    const unsafeFlagRepo = createTempRepo();
    writeReport(unsafeFlagRepo, "unsafe.json", {
      ...artifact("unsafe.zip", "2026-06-16T17:00:00.000Z"),
      rawZipCommitted: true as false,
    });
    expect(runIndex({ repoRoot: unsafeFlagRepo, allow: true }).status).toBe(
      "REPORT_UNSAFE",
    );

    const privacyRepo = createTempRepo();
    writeReport(privacyRepo, "privacy.json", {
      ...artifact("privacy.zip", "2026-06-16T17:00:00.000Z"),
      privacySafe: false,
      privacyWarnings: ["privacy pattern detected: email"],
    });
    expect(runIndex({ repoRoot: privacyRepo, allow: true }).status).toBe(
      "REPORT_UNSAFE",
    );

    const rawPathRepo = createTempRepo();
    writeReport(rawPathRepo, "raw-path.json", {
      ...artifact("safe.zip", "2026-06-16T17:00:00.000Z"),
      zipFileNameSanitized: "<sample-user-home>\\hero@example.com.zip",
    });
    expect(runIndex({ repoRoot: rawPathRepo, allow: true }).status).toBe(
      "REPORT_UNSAFE",
    );
  });

  it("keeps index and comparison output free of private path tokens", () => {
    const tempRepo = createTempRepo();
    writeReport(
      tempRepo,
      "safe.json",
      artifact("safe.zip", "2026-06-16T17:00:00.000Z"),
    );

    const result = runIndex({ repoRoot: tempRepo, allow: true });
    const indexText = readFileSync(result.indexOutputPath ?? "", "utf8");
    const comparisonText = readFileSync(
      result.comparisonOutputPath ?? "",
      "utf8",
    );
    const outputText = `${indexText}\n${comparisonText}`;

    expect(outputText).not.toContain("C:\\Users");
    expect(outputText).not.toContain("sample-user");
    expect(outputText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(outputText).not.toContain("PK\u0003\u0004");
    expect(outputText).not.toContain("\"hands\":");
    expect(outputText).not.toContain("\"played\":");
    expect(outputText).not.toContain("\"evs\":");
  });

  it("keeps product runtime disconnected from index export helpers", () => {
    const runtimeRoots = [
      join(repoRoot(), "apps", "server", "src"),
      join(repoRoot(), "apps", "web", "src"),
      join(repoRoot(), "packages", "core", "src"),
    ];
    const forbiddenTokens = [
      "hrcDryRunArtifactIndexExport",
      "runHrcDryRunArtifactIndexExport",
      "hrcDryRunArtifactExport",
      "hrcDryRunArtifactReport",
      "hrcDryRunArtifactWriter",
      "hrcDryRunArtifactIndex",
      "hrcRawZipDryRunReader",
      "buildHrcDryRunArtifactIndex",
      "buildHrcDryRunArtifactComparisonRows",
    ];
    const runtimeText = runtimeRoots
      .flatMap(collectRuntimeFiles)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    for (const token of forbiddenTokens) {
      expect(runtimeText).not.toContain(token);
    }
  });

  it("does not create repo artifacts or track raw zip files during tests", () => {
    const root = repoRoot();
    const trackedZipFiles = execFileSync("git", ["ls-files", "*.zip"], {
      cwd: root,
      encoding: "utf8",
    }).trim();

    expect(existsSync(join(root, "artifacts", "hrc-dry-run-reports"))).toBe(
      false,
    );
    expect(trackedZipFiles).toBe("");
  });

  it("keeps reports directory pinned to repo artifacts", () => {
    const tempRepo = createTempRepo();
    const allowed = resolveAllowedReportsDir(
      "artifacts/hrc-dry-run-reports",
      tempRepo,
    );
    const outside = resolveAllowedReportsDir(
      "artifacts/hrc-dry-run-reports-extra",
      tempRepo,
    );

    expect(allowed.allowed).toBe(true);
    expect(outside.allowed).toBe(false);
  });
});

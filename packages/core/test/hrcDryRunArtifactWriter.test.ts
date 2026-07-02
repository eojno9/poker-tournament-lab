import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import {
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHrcDryRunArtifactReport,
  buildHrcDryRunComparisonSummary,
} from "./helpers/hrcDryRunArtifactReport.js";
import {
  buildHrcDryRunArtifactFileName,
  writeHrcDryRunArtifactReport,
  writeHrcDryRunComparisonSummary,
} from "./helpers/hrcDryRunArtifactWriter.js";
import type { HrcRawZipDryRunReport } from "./helpers/hrcRawZipDryRunReader.js";

const generatedAt = "2026-06-12T20:35:00.000Z";
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hrc-dry-run-writer-"));
  tempDirs.push(dir);
  return dir;
}

function repoArtifactsDir(): string {
  return resolve(process.cwd(), "..", "..", "artifacts", "hrc-dry-run-reports");
}

function baseDryRunReport(
  overrides: Partial<HrcRawZipDryRunReport> = {},
): HrcRawZipDryRunReport {
  return {
    status: "OK",
    zipDetected: true,
    zipPathMasked: "<repo-external>/mtt-raw-sample.zip",
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

describe("hrc dry-run artifact writer helper", () => {
  it("writes an artifact report JSON only to a test temp folder", () => {
    const outputDir = createTempDir();
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
    });
    const result = writeHrcDryRunArtifactReport(artifact, outputDir);
    const parsed = JSON.parse(readFileSync(result.outputPath, "utf8"));

    expect(existsSync(result.outputPath)).toBe(true);
    expect(result.fileName).toMatch(/^hrc-dry-run-20260612-203500-/);
    expect(result.fileName.endsWith(".json")).toBe(true);
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(result.jsonParseVerified).toBe(true);
    expect(result.artifactWriteScope).toBe("TEST_TEMP_ONLY");
    expect(result.repoArtifactsWriteApplied).toBe(false);
    expect(parsed.schemaVersion).toBe("v2.6.0");
    expect(parsed.sourceKind).toBe("HRC_RAW_ZIP_DRY_RUN");
    expect(parsed.rawZipCommitted).toBe(false);
    expect(parsed.productImportConnected).toBe(false);
    expect(parsed.dbWriteApplied).toBe(false);
  });

  it("writes a comparison summary JSON only to a test temp folder", () => {
    const outputDir = createTempDir();
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
    });
    const summary = buildHrcDryRunComparisonSummary(artifact);
    const result = writeHrcDryRunComparisonSummary(summary, outputDir);
    const parsed = JSON.parse(readFileSync(result.outputPath, "utf8"));

    expect(existsSync(result.outputPath)).toBe(true);
    expect(result.fileName).toMatch(/^hrc-dry-run-comparison-/);
    expect(parsed.schemaVersion).toBe("v2.6.0");
    expect(parsed.validatorPass).toBe(true);
    expect(parsed.mismatchCount).toBe(0);
    expect(parsed.rawZipCommitted).toBe(false);
    expect(parsed.productImportConnected).toBe(false);
    expect(parsed.dbWriteApplied).toBe(false);
  });

  it("builds safe JSON file names from raw-looking zip names", () => {
    const koreanName = "\uD55C\uAE00 sample@! raw.zip";
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
      zipPath: `<sample-user-home>\\Desktop\\${koreanName}`,
    });
    const fileName = buildHrcDryRunArtifactFileName(artifact);

    expect(fileName).toMatch(/^hrc-dry-run-20260612-203500-/);
    expect(fileName.endsWith(".json")).toBe(true);
    expect(fileName).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(fileName).not.toContain("\\");
    expect(fileName).not.toContain("/");
    expect(fileName).not.toContain(" ");
    expect(fileName).not.toContain("C:");
    expect(fileName).not.toContain("Users");
    expect(fileName).not.toContain("sample-user");
    expect(fileName).not.toContain("@");
  });

  it("keeps writes inside outputDir even with path traversal fileName input", () => {
    const outputDir = createTempDir();
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
    });
    const result = writeHrcDryRunArtifactReport(artifact, outputDir, {
      fileName: "..\\..\\<sample-user-home>\\evil.json",
    });
    const relativeOutput = relative(outputDir, result.outputPath);

    expect(result.fileName).toBe("evil.json");
    expect(relativeOutput.startsWith("..")).toBe(false);
    expect(isAbsolute(relativeOutput)).toBe(false);
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it("rejects repo artifacts output and does not create repo artifacts", () => {
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
    });
    const repoArtifacts = repoArtifactsDir();

    expect(() =>
      writeHrcDryRunArtifactReport(artifact, repoArtifacts),
    ).toThrow(/test temp only/i);
    expect(existsSync(repoArtifacts)).toBe(false);
  });

  it("does not copy raw zip files or write private values into artifact JSON", () => {
    const outputDir = createTempDir();
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
      zipPath:
        "<sample-user-home>\\Documents\\raw\\hero@example.com.zip",
    });
    const result = writeHrcDryRunArtifactReport(artifact, outputDir);
    const json = readFileSync(result.outputPath, "utf8");
    const outputFiles = readdirSync(outputDir);

    expect(outputFiles.some((fileName) => fileName.endsWith(".zip"))).toBe(
      false,
    );
    expect(json).not.toContain("C:\\Users");
    expect(json).not.toContain("sample-user");
    expect(json).not.toContain("hero@example.com");
    expect(existsSync(repoArtifactsDir())).toBe(false);
  });
});

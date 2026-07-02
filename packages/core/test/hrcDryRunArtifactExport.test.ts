import {
  execFileSync,
} from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  runHrcDryRunArtifactExport,
  resolveAllowedOutputDir,
} from "../../../scripts/hrcDryRunArtifactExport.js";
import type { HrcRawZipDryRunReport } from "./helpers/hrcRawZipDryRunReader.js";

const generatedAt = new Date("2026-06-16T16:30:00.000Z");
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
  return createTempDir("hrc-export-repo-");
}

function createExternalZipPath(fileName = "sample-raw.zip"): string {
  return join(createTempDir("hrc-export-raw-"), fileName);
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

function runExport(input: {
  repoRoot: string;
  zipPath?: string;
  outDir?: string;
  allow?: boolean;
  dryRunReport?: HrcRawZipDryRunReport;
}) {
  const argv = ["--zip", input.zipPath ?? createExternalZipPath()];
  if (input.outDir) {
    argv.push("--out", input.outDir);
  }
  if (input.allow) {
    argv.push("--allow-repo-artifact-write");
  }

  return runHrcDryRunArtifactExport(argv, {
    repoRoot: input.repoRoot,
    now: () => generatedAt,
    buildDryRunReport: () => input.dryRunReport ?? baseDryRunReport(),
  });
}

function repoArtifactDir(repoRoot: string): string {
  return join(repoRoot, "artifacts", "hrc-dry-run-reports");
}

function repoRoot(): string {
  return resolve(process.cwd(), "..", "..");
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

describe("opt-in HRC dry-run artifact export command", () => {
  it("refuses repo artifact writes without the explicit allow flag", () => {
    const tempRepo = createTempRepo();
    const result = runExport({ repoRoot: tempRepo });

    expect(result.status).toBe("ALLOW_FLAG_REQUIRED");
    expect(result.ok).toBe(false);
    expect(result.artifactWritten).toBe(false);
    expect(result.outputPath).toBeNull();
    expect(result.artifactReport?.rawZipCommitted).toBe(false);
    expect(result.artifactReport?.productImportConnected).toBe(false);
    expect(result.artifactReport?.dbWriteApplied).toBe(false);
    expect(result.artifactReport?.apiUsed).toBe(false);
    expect(result.artifactReport?.uiUsed).toBe(false);
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("writes sanitized JSON only when allow-repo-artifact-write is present", () => {
    const tempRepo = createTempRepo();
    const result = runExport({ repoRoot: tempRepo, allow: true });

    expect(result.status).toBe("OK");
    expect(result.ok).toBe(true);
    expect(result.artifactWritten).toBe(true);
    expect(result.outputPath).toContain(repoArtifactDir(tempRepo));
    expect(result.fileName).toMatch(/^hrc-dry-run-20260616-163000-/);
    expect(result.fileName?.endsWith(".json")).toBe(true);
    expect(existsSync(result.outputPath ?? "")).toBe(true);

    const parsed = JSON.parse(readFileSync(result.outputPath ?? "", "utf8"));
    expect(parsed.schemaVersion).toBe("v2.6.0");
    expect(parsed.sourceKind).toBe("HRC_RAW_ZIP_DRY_RUN");
    expect(parsed.rawZipCommitted).toBe(false);
    expect(parsed.productImportConnected).toBe(false);
    expect(parsed.dbWriteApplied).toBe(false);
    expect(parsed.apiUsed).toBe(false);
    expect(parsed.uiUsed).toBe(false);
    expect(parsed.amountSemantics).toEqual({
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      bbConversionApplied: false,
      chipConversionApplied: false,
    });
  });

  it("rejects output paths outside artifacts/hrc-dry-run-reports", () => {
    const tempRepo = createTempRepo();
    const outsideDir = join(createTempDir("hrc-export-outside-"), "reports");
    const result = runExport({
      repoRoot: tempRepo,
      outDir: outsideDir,
      allow: true,
    });

    expect(result.status).toBe("OUTPUT_DIR_NOT_ALLOWED");
    expect(result.artifactWritten).toBe(false);
    expect(existsSync(outsideDir)).toBe(false);
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("rejects path traversal in the output path", () => {
    const tempRepo = createTempRepo();
    const result = runExport({
      repoRoot: tempRepo,
      outDir: "artifacts/hrc-dry-run-reports/../outside",
      allow: true,
    });

    expect(result.status).toBe("OUTPUT_DIR_NOT_ALLOWED");
    expect(result.artifactWritten).toBe(false);
    expect(existsSync(join(tempRepo, "artifacts", "outside"))).toBe(false);
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("rejects raw zip paths inside the repository", () => {
    const tempRepo = createTempRepo();
    const result = runExport({
      repoRoot: tempRepo,
      zipPath: join(tempRepo, "raw.zip"),
      allow: true,
    });

    expect(result.status).toBe("RAW_ZIP_INSIDE_REPO");
    expect(result.artifactWritten).toBe(false);
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("keeps raw paths, user tokens, and emails out of artifact JSON", () => {
    const tempRepo = createTempRepo();
    const sensitiveZipPath =
      "C:\\Users\\sample-user\\Documents\\raw\\hero@example.com.zip";
    const result = runExport({
      repoRoot: tempRepo,
      zipPath: sensitiveZipPath,
      allow: true,
    });
    const json = readFileSync(result.outputPath ?? "", "utf8");

    expect(result.status).toBe("OK");
    expect(json).not.toContain(sensitiveZipPath);
    expect(json).not.toContain("C:\\Users");
    expect(json).not.toContain("sample-user");
    expect(json).not.toContain("hero@example.com");
    expect(json).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  });

  it("does not store raw zip binary or full extraction payloads", () => {
    const tempRepo = createTempRepo();
    const result = runExport({
      repoRoot: tempRepo,
      allow: true,
      dryRunReport: baseDryRunReport({
        entryCount: 2,
        nodeEntriesSample: ["nodes/0.json"],
      }),
    });
    const json = readFileSync(result.outputPath ?? "", "utf8");
    const outputFiles = readdirSync(repoArtifactDir(tempRepo));

    expect(outputFiles).toHaveLength(1);
    expect(outputFiles.some((fileName) => fileName.endsWith(".zip"))).toBe(
      false,
    );
    expect(json).not.toContain("PK\u0003\u0004");
    expect(json).not.toContain("\"settings\":");
    expect(json).not.toContain("\"hands\":");
    expect(json).not.toContain("\"played\":");
    expect(json).not.toContain("\"evs\":");
  });

  it("keeps product runtime disconnected from dry-run export helpers", () => {
    const runtimeRoots = [
      join(repoRoot(), "apps", "server", "src"),
      join(repoRoot(), "apps", "web", "src"),
      join(repoRoot(), "packages", "core", "src"),
    ];
    const forbiddenTokens = [
      "hrcDryRunArtifactExport",
      "hrcDryRunArtifactReport",
      "hrcDryRunArtifactWriter",
      "hrcDryRunArtifactIndex",
      "hrcRawZipDryRunReader",
      "buildHrcRawZipDryRunReport",
      "buildHrcDryRunArtifactReport",
      "writeHrcDryRunArtifactReport",
      "buildHrcDryRunArtifactIndex",
    ];
    const runtimeText = runtimeRoots
      .flatMap(collectRuntimeFiles)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    for (const token of forbiddenTokens) {
      expect(runtimeText).not.toContain(token);
    }
  });

  it("does not create repo zip files or repo artifacts during guard tests", () => {
    const root = repoRoot();
    const trackedZipFiles = execFileSync("git", ["ls-files", "*.zip"], {
      cwd: root,
      encoding: "utf8",
    }).trim();

    expect(existsSync(join(root, "artifacts", "hrc-dry-run-reports"))).toBe(
      false,
    );
    expect(trackedZipFiles).toBe("");
    expect(statSync(join(root, "package.json")).isFile()).toBe(true);
  });

  it("keeps the allowed output directory pinned to repo artifacts", () => {
    const tempRepo = createTempRepo();
    const allowed = resolveAllowedOutputDir(
      "artifacts/hrc-dry-run-reports",
      tempRepo,
    );
    const outside = resolveAllowedOutputDir(
      "artifacts/hrc-dry-run-reports-extra",
      tempRepo,
    );

    expect(allowed.allowed).toBe(true);
    if (allowed.allowed) {
      expect(basename(allowed.outputDir)).toBe("hrc-dry-run-reports");
    }
    expect(outside.allowed).toBe(false);
  });
});

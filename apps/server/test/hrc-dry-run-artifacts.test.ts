import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { LabDatabase } from "../src/db.js";

const tempDirs: string[] = [];

describe("HRC dry-run artifacts read-only API", () => {
  let database: LabDatabase;
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let testRoot: string;
  let artifactsDir: string;

  beforeEach(async () => {
    testRoot = createTempDir("ptl-artifact-api-");
    artifactsDir = join(testRoot, "artifacts", "hrc-dry-run-reports");
    database = new LabDatabase(join(testRoot, "test.db"));
    const server = createApp(database, { hrcDryRunArtifactsDir: artifactsDir }).listen(0);
    await new Promise<void>((resolveListening) => server.once("listening", resolveListening));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to start test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
  });

  afterEach(async () => {
    await closeServer();
    database.close();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns an empty list when the artifacts directory is missing without creating it", async () => {
    const body = await get<{
      directoryExists: boolean;
      baseDir: string;
      items: unknown[];
      invalidItems: unknown[];
      safety: { readOnly: boolean; dbWriteApplied: boolean; batchRunnerExecuted: boolean };
    }>("/api/hrc-dry-run-artifacts");

    expect(body.directoryExists).toBe(false);
    expect(body.baseDir).toBe("artifacts/hrc-dry-run-reports");
    expect(body.items).toEqual([]);
    expect(body.invalidItems).toEqual([]);
    expect(body.safety).toMatchObject({
      readOnly: true,
      dbWriteApplied: false,
      batchRunnerExecuted: false,
    });
    expect(existsSync(artifactsDir)).toBe(false);
  });

  it("returns valid report, index, and comparison summaries with deterministic sorting", async () => {
    mkdirSync(artifactsDir, { recursive: true });
    writeArtifact("z-report.json", buildReportArtifact({ generatedAt: "2026-06-16T02:00:00.000Z", fileName: "z.zip" }));
    writeArtifact("a-index.json", buildIndexArtifact());
    writeArtifact("m-comparison.json", buildComparisonArtifact());
    writeArtifact("bad.json", "{ malformed");

    const body = await get<{
      directoryExists: boolean;
      items: Array<{ fileName: string; kind: string; status: string | null; validatorPass: boolean | null; mismatchCount: number | null }>;
      invalidItems: Array<{ fileName: string; reason: string }>;
    }>("/api/hrc-dry-run-artifacts");

    expect(body.directoryExists).toBe(true);
    expect(body.items.map((item) => `${item.kind}:${item.fileName}`)).toEqual([
      "COMPARISON:m-comparison.json",
      "INDEX:a-index.json",
      "REPORT:z-report.json",
    ]);
    expect(body.items.find((item) => item.kind === "REPORT")).toMatchObject({
      status: "OK",
      validatorPass: true,
      mismatchCount: 0,
    });
    expect(body.invalidItems).toEqual([
      { fileName: "bad.json", reason: "MALFORMED_JSON", error: expect.any(String) },
    ]);
  });

  it("returns detail for a valid report without exposing raw path or privacy strings", async () => {
    mkdirSync(artifactsDir, { recursive: true });
    writeArtifact(
      "report.json",
      buildReportArtifact({
        generatedAt: "2026-06-16T02:00:00.000Z",
        fileName: "safe-source.zip",
        rawLeak: true,
      }),
    );

    const beforeCounts = database.getHealthCounts();
    const response = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/report.json`);
    const text = await response.text();
    const body = JSON.parse(text) as {
      kind: string;
      summary: { fileName: string; privacySafe: boolean };
      detail: {
        adapterReportSummary: { warnings?: string[] };
        validatorResult: { issueMessages?: string[] };
        mismatchSummary: { sample?: string[] };
        privacyWarnings: string[];
        safety: { rawZipRead: boolean; dbWriteApplied: boolean; productImportConnected: boolean; batchRunnerExecuted: boolean };
      };
    };

    expect(response.status).toBe(200);
    expect(body.kind).toBe("REPORT");
    expect(body.summary.fileName).toBe("report.json");
    expect(body.summary.privacySafe).toBe(false);
    expect(body.detail.safety).toMatchObject({
      rawZipRead: false,
      dbWriteApplied: false,
      productImportConnected: false,
      batchRunnerExecuted: false,
    });
    expect(body.detail.privacyWarnings.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/C:\\Users\\/i);
    expect(text).not.toMatch(/\bsample-user\b/i);
    expect(text).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(text).not.toContain("raw/secret.zip");
    expect(database.getHealthCounts()).toEqual(beforeCounts);
  });

  it("returns detail for index and comparison artifacts as safe summaries only", async () => {
    mkdirSync(artifactsDir, { recursive: true });
    writeArtifact("index.json", buildIndexArtifact());
    writeArtifact("comparison.json", buildComparisonArtifact());

    const index = await get<{ kind: string; detail: { indexSummary: { reportCount: number } } }>(
      "/api/hrc-dry-run-artifacts/index.json",
    );
    const comparison = await get<{ kind: string; detail: { comparisonSummary: { reportCount: number; rowsSample: unknown[] } } }>(
      "/api/hrc-dry-run-artifacts/comparison.json",
    );

    expect(index.kind).toBe("INDEX");
    expect(index.detail.indexSummary.reportCount).toBe(1);
    expect(comparison.kind).toBe("COMPARISON");
    expect(comparison.detail.comparisonSummary.reportCount).toBe(1);
    expect(comparison.detail.comparisonSummary.rowsSample).toHaveLength(1);
  });

  it("returns 422 for malformed JSON detail", async () => {
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(join(artifactsDir, "bad.json"), "{ bad", "utf8");

    const response = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/bad.json`);
    const body = (await response.json()) as { error: string; fileName: string; code: string };

    expect(response.status).toBe(422);
    expect(body.fileName).toBe("bad.json");
    expect(body.code).toBe("INVALID_REQUEST");
    expect(body.error).toContain("artifact JSON could not be parsed");
  });

  it("rejects path traversal, absolute paths, zip files, and non-json detail requests", async () => {
    mkdirSync(artifactsDir, { recursive: true });
    writeArtifact("safe.json", buildReportArtifact());

    const traversal = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/${encodeURIComponent("../safe.json")}`);
    const absolute = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/${encodeURIComponent("<sample-user-home>\\safe.json")}`);
    const zip = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/raw.zip`);
    const nonJson = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/readme.txt`);

    expect(traversal.status).toBe(400);
    expect(absolute.status).toBe(400);
    expect(zip.status).toBe(400);
    expect(nonJson.status).toBe(400);
  });

  it("returns 404 for missing artifact detail", async () => {
    const response = await fetch(`${baseUrl}/api/hrc-dry-run-artifacts/missing.json`);
    const body = (await response.json()) as { error: string; fileName: string; code: string };

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "artifact file was not found",
      fileName: "missing.json",
      code: "NOT_FOUND",
    });
  });

  it("does not execute batch runners, product imports, or DB writes", async () => {
    mkdirSync(artifactsDir, { recursive: true });
    writeArtifact("report.json", buildReportArtifact());
    const beforeCounts = database.getHealthCounts();

    const list = await get<{ safety: { batchRunnerExecuted: boolean; dbWriteApplied: boolean; productImportConnected: boolean } }>(
      "/api/hrc-dry-run-artifacts",
    );
    const detail = await get<{ detail: { safety: { batchRunnerExecuted: boolean; dbWriteApplied: boolean; productImportConnected: boolean } } }>(
      "/api/hrc-dry-run-artifacts/report.json",
    );

    expect(list.safety).toMatchObject({
      batchRunnerExecuted: false,
      dbWriteApplied: false,
      productImportConnected: false,
    });
    expect(detail.detail.safety).toMatchObject({
      batchRunnerExecuted: false,
      dbWriteApplied: false,
      productImportConnected: false,
    });
    expect(database.getHealthCounts()).toEqual(beforeCounts);
  });

  it("does not create current-repo dry-run artifacts or zip fixtures during tests", () => {
    const root = currentRepoRoot();
    const trackedZipFiles = execGit(["ls-files", "*.zip"], root).trim();
    const repoZipFiles = collectFiles(root, ".zip");

    expect(existsSync(join(root, "artifacts", "hrc-dry-run-reports"))).toBe(false);
    expect(trackedZipFiles).toBe("");
    expect(repoZipFiles).toEqual([]);
    expect(readdirSync(testRoot)).toContain("test.db");
  });

  async function get<T = unknown>(apiPath: string): Promise<T> {
    const response = await fetch(`${baseUrl}${apiPath}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as T;
  }

  function writeArtifact(fileName: string, value: unknown): void {
    writeFileSync(join(artifactsDir, fileName), typeof value === "string" ? value : JSON.stringify(value, null, 2), "utf8");
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function buildReportArtifact(options: { generatedAt?: string; fileName?: string; rawLeak?: boolean } = {}): Record<string, unknown> {
  const rawLeak = options.rawLeak ? "<sample-user-home>\\Documents\\raw\\secret.zip user@example.com" : null;
  return {
    schemaVersion: "v2.6.0",
    generatedAt: options.generatedAt ?? "2026-06-16T01:00:00.000Z",
    sourceKind: "HRC_RAW_ZIP_DRY_RUN",
    isProductImportCandidate: false,
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
    zipPathMasked: rawLeak ?? "<repo-external>/safe-source.zip",
    zipFileNameSanitized: options.fileName ?? "safe-source.zip",
    entryCount: 2,
    hasSettingsJson: true,
    nodeEntryCount: 1,
    nodeEntriesSample: ["nodes/0.json"],
    selectedNodeEntry: "nodes/0.json",
    selectedNodeReason: "nodes/0.json is present and is the default dry-run node",
    multipleNodeEntriesDetected: false,
    multiNodeAggregationApplied: false,
    status: "OK",
    warnings: rawLeak ? [rawLeak] : [],
    errors: [],
    privacySafe: !rawLeak,
    privacyWarnings: rawLeak ? [`privacy pattern detected: ${rawLeak}`] : [],
    adapterReportSummary: {
      candidateBuilt: true,
      handCount: 169,
      actionCount: 3,
      warnings: rawLeak ? [rawLeak] : [],
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
      issueMessages: rawLeak ? [rawLeak] : [],
      warningMessages: [],
    },
    mismatchSummary: {
      hasMismatch: false,
      mismatchCount: 0,
      categories: [],
      sample: rawLeak ? [rawLeak, "safe second sample", "safe third sample", "extra sample"] : [],
      fatal: false,
    },
    amountSemantics: {
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      bbConversionApplied: false,
      chipConversionApplied: false,
    },
    verificationSummary: {},
    actionCount: 3,
    handCount: 169,
    sequenceLength: 6,
  };
}

function buildIndexArtifact(): Record<string, unknown> {
  return {
    schemaVersion: "v2.6.0",
    generatedAt: "2026-06-16T03:00:00.000Z",
    sourceKind: "HRC_RAW_ZIP_DRY_RUN_INDEX",
    isProductImportCandidate: false,
    reportCount: 1,
    statusCounts: { OK: 1 },
    validatorPassCount: 1,
    validatorFailCount: 0,
    privacySafeCount: 1,
    privacyWarningCount: 0,
    mismatchCountTotal: 0,
    mismatchCategories: [],
    warningCountTotal: 0,
    errorCountTotal: 0,
    amountUnitCounts: { UNKNOWN: 1 },
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
    multiNodeAggregationApplied: false,
  };
}

function buildComparisonArtifact(): Record<string, unknown> {
  return {
    schemaVersion: "v2.6.0",
    generatedAt: "2026-06-16T04:00:00.000Z",
    sourceKind: "HRC_RAW_ZIP_DRY_RUN_COMPARISON",
    reportCount: 1,
    rows: [
      {
        zipFileNameSanitized: "safe-source.zip",
        status: "OK",
        privacySafe: true,
        selectedNodeEntry: "nodes/0.json",
        selectedNodeReason: "nodes/0.json is present",
        multipleNodeEntriesDetected: false,
        multiNodeAggregationApplied: false,
        actionCount: 3,
        handCount: 169,
        sequenceLength: 6,
        validatorPassed: true,
        mismatchCount: 0,
        mismatchCategories: [],
        warningCount: 0,
        errorCount: 0,
        amountUnit: "UNKNOWN",
        amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      },
    ],
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
    multiNodeAggregationApplied: false,
  };
}

function currentRepoRoot(): string {
  return resolve(process.cwd(), "..", "..");
}

function execGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function collectFiles(root: string, extension: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist"].includes(entry.name)) {
      continue;
    }
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, extension));
    } else if (entry.name.endsWith(extension)) {
      results.push(fullPath);
    }
  }
  return results;
}

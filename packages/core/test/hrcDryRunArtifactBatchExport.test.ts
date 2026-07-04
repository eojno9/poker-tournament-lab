import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseHrcDryRunArtifactBatchExportArgs,
  runHrcDryRunArtifactBatchExport,
} from "../../../scripts/hrcDryRunArtifactBatchExport.js";

const tempDirs: string[] = [];
const fixedNow = new Date("2026-06-16T20:45:00.000Z");

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
  return createTempDir("hrc-batch-repo-");
}

function createExternalDir(): string {
  return createTempDir("hrc-batch-external-");
}

function writeDummyZip(dir: string, fileName: string): string {
  const filePath = join(dir, fileName);
  writeFileSync(filePath, "dummy zip placeholder", "utf8");
  return filePath;
}

function writeValidHrcRawZip(dir: string, fileName: string): string {
  const filePath = join(dir, fileName);
  writeStoredZip(filePath, {
    "settings.json": JSON.stringify({
      handdata: {},
      eqmodel: {},
      treeconfig: {},
      engine: {},
    }),
    "nodes/0.json": JSON.stringify({
      player: 6,
      street: 0,
      children: 3,
      sequence: [
        { player: 0, type: "F", amount: 0, street: 0 },
        { player: 1, type: "F", amount: 0, street: 0 },
        { player: 2, type: "F", amount: 0, street: 0 },
        { player: 3, type: "F", amount: 0, street: 0 },
        { player: 4, type: "F", amount: 0, street: 0 },
        { player: 5, type: "F", amount: 0, street: 0 },
      ],
      actions: [
        { type: "F", amount: 0 },
        { type: "C", amount: 10000 },
        { type: "R", amount: 20000 },
      ],
      hands: build169Hands(),
    }),
  });
  return filePath;
}

function repoArtifactDir(repoRoot: string): string {
  return join(repoRoot, "artifacts", "hrc-dry-run-reports");
}

function currentRepoRoot(): string {
  return resolve(process.cwd(), "..", "..");
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
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

describe("HRC dry-run artifact batch export", () => {
  it("parses input-dir arguments", () => {
    const parsed = parseHrcDryRunArtifactBatchExportArgs([
      "--input-dir",
      "C:/external/hrc",
      "--out",
      "artifacts/hrc-dry-run-reports",
      "--max-files",
      "3",
      "--continue-on-error",
      "--write-index",
      "--allow-repo-artifact-write",
      "--plan-only",
    ]);

    expect(parsed).toEqual({
      inputDir: "C:/external/hrc",
      zipListPath: null,
      outDir: "artifacts/hrc-dry-run-reports",
      maxFiles: 3,
      continueOnError: true,
      writeIndex: true,
      allowRepoArtifactWrite: true,
      planOnly: false,
    });
  });

  it("parses zip-list arguments", () => {
    const parsed = parseHrcDryRunArtifactBatchExportArgs([
      "--zip-list=zip-list.txt",
      "--out=artifacts/hrc-dry-run-reports",
    ]);

    expect(parsed.inputDir).toBeNull();
    expect(parsed.zipListPath).toBe("zip-list.txt");
    expect(parsed.outDir).toBe("artifacts/hrc-dry-run-reports");
  });

  it("rejects missing input-dir and zip-list", () => {
    const result = runHrcDryRunArtifactBatchExport([], {
      repoRoot: createTempRepo(),
    });

    expect(result.status).toBe("INVALID_ARGUMENTS");
    expect(result.ok).toBe(false);
    expect(result.artifactWritten).toBe(false);
  });

  it("rejects using input-dir and zip-list together", () => {
    const result = runHrcDryRunArtifactBatchExport(
      ["--input-dir", createExternalDir(), "--zip-list", join(createExternalDir(), "zips.txt")],
      { repoRoot: createTempRepo() },
    );

    expect(result.status).toBe("INVALID_ARGUMENTS");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid max-files values", () => {
    for (const value of ["0", "-1", "abc"]) {
      const result = runHrcDryRunArtifactBatchExport(
        ["--input-dir", createExternalDir(), "--max-files", value],
        { repoRoot: createTempRepo() },
      );

      expect(result.status).toBe("INVALID_ARGUMENTS");
    }
  });

  it("rejects a repo-internal input directory", () => {
    const tempRepo = createTempRepo();
    const inputDir = join(tempRepo, "raw-zips");
    mkdirSync(inputDir, { recursive: true });

    const result = runHrcDryRunArtifactBatchExport(["--input-dir", inputDir], {
      repoRoot: tempRepo,
    });

    expect(result.status).toBe("INPUT_DIR_NOT_ALLOWED");
    expect(result.artifactWritten).toBe(false);
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("skips repo-internal zip candidates from a zip list", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    const repoZip = writeDummyZip(tempRepo, "inside.zip");
    const listFile = join(externalDir, "zips.txt");
    writeFileSync(listFile, `${repoZip}\n`, "utf8");

    const result = runHrcDryRunArtifactBatchExport(["--zip-list", listFile], {
      repoRoot: tempRepo,
    });

    expect(result.status).toBe("OK");
    expect(result.batchSummary?.acceptedCount).toBe(0);
    expect(result.batchSummary?.skippedCount).toBe(1);
    expect(result.batchSummary?.skippedSample[0]?.reason).toBe("REPO_INTERNAL_ZIP");
    expect(result.artifactWritten).toBe(false);
  });

  it("builds zip-list candidates from non-empty non-comment lines", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    const alphaZip = writeValidHrcRawZip(externalDir, "alpha.zip");
    const bravoZip = writeValidHrcRawZip(externalDir, "bravo.zip");
    const listFile = join(externalDir, "zips.txt");
    writeFileSync(
      listFile,
      `\n# ignored comment\n${bravoZip}\n\n${alphaZip}\n`,
      "utf8",
    );

    const result = runHrcDryRunArtifactBatchExport(["--zip-list", listFile], {
      repoRoot: tempRepo,
    });

    expect(result.status).toBe("WRITE_NOT_ALLOWED");
    expect(result.batchSummary?.mode).toBe("ZIP_LIST");
    expect(result.batchSummary?.candidateCount).toBe(2);
    expect(result.batchSummary?.acceptedCount).toBe(2);
    expect(result.batchSummary?.candidatesSample.map((candidate) => candidate.fileName)).toEqual([
      "alpha.zip",
      "bravo.zip",
    ]);
    expect(result.batchSummary?.processedCount).toBe(0);
  });

  it("skips non-zip files from an input directory before write guard checks", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeFileSync(join(externalDir, "notes.txt"), "not a zip", "utf8");
    writeValidHrcRawZip(externalDir, "sample.zip");

    const result = runHrcDryRunArtifactBatchExport(["--input-dir", externalDir], {
      repoRoot: tempRepo,
    });

    expect(result.status).toBe("WRITE_NOT_ALLOWED");
    expect(result.batchSummary?.candidateCount).toBe(2);
    expect(result.batchSummary?.acceptedCount).toBe(1);
    expect(result.batchSummary?.skippedSample[0]?.reason).toBe("NON_ZIP_FILE");
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("lists accepted zip candidates in deterministic filename order", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "bravo.zip");
    writeValidHrcRawZip(externalDir, "alpha.zip");
    writeValidHrcRawZip(externalDir, "charlie.zip");

    const result = runHrcDryRunArtifactBatchExport(["--input-dir", externalDir], {
      repoRoot: tempRepo,
    });

    expect(result.status).toBe("WRITE_NOT_ALLOWED");
    expect(result.batchSummary?.candidatesSample.map((candidate) => candidate.fileName)).toEqual([
      "alpha.zip",
      "bravo.zip",
      "charlie.zip",
    ]);
  });

  it("applies max-files to accepted candidates", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "alpha.zip");
    writeValidHrcRawZip(externalDir, "bravo.zip");
    writeValidHrcRawZip(externalDir, "charlie.zip");

    const result = runHrcDryRunArtifactBatchExport(
      ["--input-dir", externalDir, "--max-files", "2"],
      { repoRoot: tempRepo },
    );

    expect(result.status).toBe("WRITE_NOT_ALLOWED");
    expect(result.batchSummary?.acceptedCount).toBe(2);
    expect(result.batchSummary?.skippedCount).toBe(1);
    expect(result.batchSummary?.maxFilesApplied).toBe(true);
    expect(result.batchSummary?.candidatesSample.map((candidate) => candidate.fileName)).toEqual([
      "alpha.zip",
      "bravo.zip",
    ]);
  });

  it("rejects output paths outside artifacts/hrc-dry-run-reports", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "sample.zip");

    const result = runHrcDryRunArtifactBatchExport(
      ["--input-dir", externalDir, "--out", join(createExternalDir(), "reports")],
      { repoRoot: tempRepo },
    );

    expect(result.status).toBe("OUTPUT_DIR_NOT_ALLOWED");
    expect(result.artifactWritten).toBe(false);
  });

  it("rejects path traversal in the output path", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "sample.zip");

    const result = runHrcDryRunArtifactBatchExport(
      [
        "--input-dir",
        externalDir,
        "--out",
        "artifacts/hrc-dry-run-reports/../outside",
      ],
      { repoRoot: tempRepo },
    );

    expect(result.status).toBe("OUTPUT_DIR_NOT_ALLOWED");
    expect(result.artifactWritten).toBe(false);
    expect(existsSync(join(tempRepo, "artifacts", "outside"))).toBe(false);
  });

  it("requires the allow flag before any accepted candidate writes artifacts", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "sample.zip");

    const result = runHrcDryRunArtifactBatchExport(["--input-dir", externalDir], {
      repoRoot: tempRepo,
    });

    expect(result.status).toBe("WRITE_NOT_ALLOWED");
    expect(result.ok).toBe(false);
    expect(result.batchSummary?.processedCount).toBe(0);
    expect(result.batchSummary?.wroteArtifactCount).toBe(0);
    expect(result.artifactWritten).toBe(false);
    expect(existsSync(repoArtifactDir(tempRepo))).toBe(false);
  });

  it("writes artifact-safe reports for valid temp raw HRC zips when explicitly allowed", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    const zipPath = writeValidHrcRawZip(externalDir, "sample.zip");

    const result = runHrcDryRunArtifactBatchExport(
      ["--input-dir", externalDir, "--allow-repo-artifact-write"],
      { repoRoot: tempRepo, now: () => fixedNow },
    );

    const reportsDir = repoArtifactDir(tempRepo);
    const files = listJsonFiles(reportsDir);
    const artifactJson = readFileSync(join(reportsDir, files[0] ?? ""), "utf8");
    const parsed = JSON.parse(artifactJson);

    expect(result.status).toBe("OK");
    expect(result.artifactWritten).toBe(true);
    expect(result.batchSummary?.processedCount).toBe(1);
    expect(result.batchSummary?.succeededCount).toBe(1);
    expect(result.batchSummary?.wroteArtifactCount).toBe(1);
    expect(result.artifactReports[0]?.status).toBe("OK");
    expect(parsed.status).toBe("OK");
    expect(parsed.handCount).toBe(169);
    expect(parsed.actionCount).toBe(3);
    expect(parsed.sequenceLength).toBe(6);
    expect(parsed.rawZipCommitted).toBe(false);
    expect(parsed.productImportConnected).toBe(false);
    expect(parsed.dbWriteApplied).toBe(false);
    expect(parsed.apiUsed).toBe(false);
    expect(parsed.uiUsed).toBe(false);
    expect(parsed.amountSemantics.amountUnit).toBe("UNKNOWN");
    expect(parsed.amountSemantics.bbConversionApplied).toBe(false);
    expect(artifactJson).not.toContain(zipPath);
    expect(artifactJson).not.toMatch(/C:\\Users\\/i);
    expect(artifactJson).not.toMatch(/\bsample-user\b/i);
    expect(artifactJson).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(artifactJson).not.toContain("PK\u0003\u0004");
  });

  it("writes index and comparison artifacts with deterministic sorting when requested", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "charlie.zip");
    writeValidHrcRawZip(externalDir, "alpha.zip");

    const result = runHrcDryRunArtifactBatchExport(
      [
        "--input-dir",
        externalDir,
        "--allow-repo-artifact-write",
        "--write-index",
      ],
      { repoRoot: tempRepo, now: () => fixedNow },
    );

    const reportsDir = repoArtifactDir(tempRepo);
    const files = listJsonFiles(reportsDir);
    const indexFile = files.find((fileName) => fileName.startsWith("hrc-dry-run-index-"));
    const comparisonFile = files.find((fileName) =>
      fileName.startsWith("hrc-dry-run-comparison-"),
    );
    const index = JSON.parse(readFileSync(join(reportsDir, indexFile ?? ""), "utf8"));
    const comparison = JSON.parse(
      readFileSync(join(reportsDir, comparisonFile ?? ""), "utf8"),
    );

    expect(result.status).toBe("OK");
    expect(result.batchSummary?.wroteArtifactCount).toBe(2);
    expect(result.batchSummary?.wroteIndex).toBe(true);
    expect(result.batchSummary?.wroteComparison).toBe(true);
    expect(files).toHaveLength(4);
    expect(index.reportCount).toBe(2);
    expect(index.reports.map((row: { zipFileNameSanitized: string }) => row.zipFileNameSanitized)).toEqual([
      "alpha.zip",
      "charlie.zip",
    ]);
    expect(comparison.rows.map((row: { zipFileNameSanitized: string }) => row.zipFileNameSanitized)).toEqual([
      "alpha.zip",
      "charlie.zip",
    ]);
    expect(JSON.stringify(index)).not.toMatch(/C:\\Users|sample-user|@/i);
    expect(JSON.stringify(comparison)).not.toMatch(/C:\\Users|sample-user|@/i);
  });

  it("stops on the first invalid zip without continue-on-error", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeDummyZip(externalDir, "alpha-invalid.zip");
    writeValidHrcRawZip(externalDir, "bravo-valid.zip");

    const result = runHrcDryRunArtifactBatchExport(
      ["--input-dir", externalDir, "--allow-repo-artifact-write"],
      { repoRoot: tempRepo, now: () => fixedNow },
    );

    expect(result.status).toBe("DRY_RUN_FAILED");
    expect(result.batchSummary?.processedCount).toBe(1);
    expect(result.batchSummary?.failedCount).toBe(1);
    expect(result.batchSummary?.succeededCount).toBe(0);
    expect(result.batchSummary?.failedSample[0]?.fileName).toBe("alpha-invalid.zip");
    expect(result.batchSummary?.failedSample[0]?.pathMasked).toBe(
      "<repo-external>/alpha-invalid.zip",
    );
    expect(JSON.stringify(result.batchSummary?.failedSample)).not.toContain(externalDir);
  });

  it("continues after invalid zips when continue-on-error is explicit", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeDummyZip(externalDir, "alpha-invalid.zip");
    writeValidHrcRawZip(externalDir, "bravo-valid.zip");

    const result = runHrcDryRunArtifactBatchExport(
      [
        "--input-dir",
        externalDir,
        "--allow-repo-artifact-write",
        "--continue-on-error",
      ],
      { repoRoot: tempRepo, now: () => fixedNow },
    );

    expect(result.status).toBe("OK");
    expect(result.batchSummary?.processedCount).toBe(2);
    expect(result.batchSummary?.failedCount).toBe(1);
    expect(result.batchSummary?.succeededCount).toBe(1);
    expect(result.batchSummary?.wroteArtifactCount).toBe(1);
    expect(listJsonFiles(repoArtifactDir(tempRepo))).toHaveLength(1);
    expect(JSON.stringify(result.batchSummary?.failedSample)).not.toContain(externalDir);
  });

  it("keeps batch summary safety flags false", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "sample.zip");

    const result = runHrcDryRunArtifactBatchExport(["--input-dir", externalDir], {
      repoRoot: tempRepo,
    });

    expect(result.batchSummary?.safety).toEqual({
      rawZipCopied: false,
      rawZipExtracted: false,
      rawZipCommitted: false,
      productImportConnected: false,
      dbWriteApplied: false,
      apiUsed: false,
      uiUsed: false,
    });
    expect(result.rawZipCommitted).toBe(false);
    expect(result.productImportConnected).toBe(false);
    expect(result.dbWriteApplied).toBe(false);
    expect(result.apiUsed).toBe(false);
    expect(result.uiUsed).toBe(false);
  });

  it("does not copy raw zip originals into the temp repo", () => {
    const tempRepo = createTempRepo();
    const externalDir = createExternalDir();
    writeValidHrcRawZip(externalDir, "sample.zip");

    runHrcDryRunArtifactBatchExport(
      ["--input-dir", externalDir, "--allow-repo-artifact-write"],
      { repoRoot: tempRepo, now: () => fixedNow },
    );

    expect(readdirSync(tempRepo)).not.toContain("sample.zip");
  });

  it("keeps product runtime disconnected from batch export helpers", () => {
    const runtimeRoots = [
      join(currentRepoRoot(), "apps", "server", "src"),
      join(currentRepoRoot(), "apps", "web", "src"),
      join(currentRepoRoot(), "packages", "core", "src"),
    ];
    const forbiddenTokens = [
      "hrcDryRunArtifactBatchExport",
      "runHrcDryRunArtifactBatchExport",
      "hrcDryRunArtifactExport",
      "hrcDryRunArtifactIndexExport",
      "hrcRawZipDryRunReader",
      "buildHrcRawZipDryRunReport",
    ];
    const runtimeText = runtimeRoots
      .flatMap(collectRuntimeFiles)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    for (const token of forbiddenTokens) {
      expect(runtimeText).not.toContain(token);
    }
  });

  it("does not create current-repo zip files or artifact reports during tests", () => {
    const root = currentRepoRoot();
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
});

function writeStoredZip(filePath: string, entries: Record<string, string>): void {
  const fileParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const dataBuffer = Buffer.from(text, "utf8");
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuffer.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuffer.copy(centralHeader, 46);

    fileParts.push(localHeader, dataBuffer);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(Object.keys(entries).length, 8);
  endOfCentralDirectory.writeUInt16LE(Object.keys(entries).length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  writeFileSync(filePath, Buffer.concat([...fileParts, centralDirectory, endOfCentralDirectory]));
}

function build169Hands(): Record<string, { weight: number; played: number[]; evs: number[] }> {
  const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  const hands: Record<string, { weight: number; played: number[]; evs: number[] }> = {};

  for (let highIndex = ranks.length - 1; highIndex >= 0; highIndex -= 1) {
    for (let lowIndex = ranks.length - 1; lowIndex >= 0; lowIndex -= 1) {
      const high = ranks[highIndex] ?? "2";
      const low = ranks[lowIndex] ?? "2";
      let hand: string;
      if (highIndex === lowIndex) {
        hand = `${high}${low}`;
      } else if (highIndex > lowIndex) {
        hand = `${low}${high}o`;
      } else {
        hand = `${high}${low}s`;
      }

      hands[hand] = {
        weight: 1,
        played: [1, 0, 0],
        evs: [0, -0.1, 0.2],
      };
    }
  }

  return hands;
}

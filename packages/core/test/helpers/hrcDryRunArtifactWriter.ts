import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { tmpdir } from "node:os";
import {
  sanitizeArtifactFileName,
  type HrcDryRunArtifactReport,
  type HrcDryRunComparisonSummary,
} from "./hrcDryRunArtifactReport.js";

export type HrcDryRunArtifactWriteScope = "TEST_TEMP_ONLY";

export type BuildHrcDryRunArtifactFileNameOptions = {
  fileName?: string;
  prefix?: string;
  generatedAt?: Date | string;
};

export type WriteHrcDryRunArtifactOptions =
  BuildHrcDryRunArtifactFileNameOptions & {
    artifactWriteScope?: HrcDryRunArtifactWriteScope;
  };

export type HrcDryRunArtifactWriteResult = {
  outputPath: string;
  fileName: string;
  bytesWritten: number;
  jsonParseVerified: boolean;
  artifactWriteScope: HrcDryRunArtifactWriteScope;
  repoArtifactsWriteApplied: false;
};

type ArtifactFileNameInput = {
  generatedAt: string;
  zipFileNameSanitized: string;
};

export function buildHrcDryRunArtifactFileName(
  artifactReport: ArtifactFileNameInput,
  options: BuildHrcDryRunArtifactFileNameOptions = {},
): string {
  if (options.fileName) {
    return ensureJsonExtension(sanitizeArtifactFileName(options.fileName));
  }

  const prefix = sanitizeArtifactFileName(options.prefix ?? "hrc-dry-run");
  const timestamp = formatArtifactTimestamp(
    options.generatedAt ?? artifactReport.generatedAt,
  );
  const sourceName = sanitizeArtifactFileName(
    artifactReport.zipFileNameSanitized,
  ).replace(/\.zip$/i, "");

  return ensureJsonExtension(
    sanitizeArtifactFileName(`${prefix}-${timestamp}-${sourceName}`),
  );
}

export function writeHrcDryRunArtifactReport(
  artifactReport: HrcDryRunArtifactReport,
  outputDir: string,
  options: WriteHrcDryRunArtifactOptions = {},
): HrcDryRunArtifactWriteResult {
  const fileName = buildHrcDryRunArtifactFileName(artifactReport, options);

  return writeJsonToTestTempDir(artifactReport, outputDir, fileName, options);
}

export function writeHrcDryRunComparisonSummary(
  comparisonSummary: HrcDryRunComparisonSummary,
  outputDir: string,
  options: WriteHrcDryRunArtifactOptions = {},
): HrcDryRunArtifactWriteResult {
  const fileName = buildHrcDryRunArtifactFileName(comparisonSummary, {
    prefix: "hrc-dry-run-comparison",
    ...options,
  });

  return writeJsonToTestTempDir(comparisonSummary, outputDir, fileName, options);
}

function writeJsonToTestTempDir(
  value: unknown,
  outputDir: string,
  fileName: string,
  options: WriteHrcDryRunArtifactOptions,
): HrcDryRunArtifactWriteResult {
  const artifactWriteScope = options.artifactWriteScope ?? "TEST_TEMP_ONLY";

  if (artifactWriteScope !== "TEST_TEMP_ONLY") {
    throw new Error("HRC dry-run artifact writer only supports TEST_TEMP_ONLY");
  }

  const outputDirPath = resolve(outputDir);
  assertTestTempOutputDir(outputDirPath);

  const safeFileName = ensureJsonExtension(sanitizeArtifactFileName(fileName));
  const outputPath = resolve(join(outputDirPath, safeFileName));

  if (!isPathInside(outputDirPath, outputPath)) {
    throw new Error("HRC dry-run artifact writer blocked path traversal");
  }

  mkdirSync(outputDirPath, { recursive: true });

  const json = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(outputPath, json, "utf8");

  const parsed = JSON.parse(readFileSync(outputPath, "utf8"));
  const jsonParseVerified = parsed !== null && typeof parsed === "object";

  return {
    outputPath,
    fileName: safeFileName,
    bytesWritten: statSync(outputPath).size,
    jsonParseVerified,
    artifactWriteScope,
    repoArtifactsWriteApplied: false,
  };
}

function assertTestTempOutputDir(outputDirPath: string): void {
  const tempRoot = resolve(tmpdir());

  if (!isPathInside(tempRoot, outputDirPath)) {
    throw new Error("HRC dry-run artifact writer must write to test temp only");
  }
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function ensureJsonExtension(fileName: string): string {
  const withoutJsonExtension = fileName.replace(/\.json$/i, "");
  return `${withoutJsonExtension || "hrc-dry-run-artifact"}.json`;
}

function formatArtifactTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date
      .toISOString()
      .slice(0, 19)
      .replace(/[-:]/g, "")
      .replace("T", "-");
  }

  return sanitizeArtifactFileName(String(value)).slice(0, 32) || "unknown-time";
}

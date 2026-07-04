import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHrcDryRunArtifactReport,
  type HrcDryRunArtifactReport,
} from "../packages/core/test/helpers/hrcDryRunArtifactReport.js";
import { buildHrcDryRunArtifactFileName } from "../packages/core/test/helpers/hrcDryRunArtifactWriter.js";
import {
  buildHrcRawZipDryRunReport,
  type HrcRawZipDryRunReport,
} from "../packages/core/test/helpers/hrcRawZipDryRunReader.js";

export type HrcDryRunArtifactExportStatus =
  | "OK"
  | "ARGUMENT_ERROR"
  | "ALLOW_FLAG_REQUIRED"
  | "RAW_ZIP_INSIDE_REPO"
  | "OUTPUT_DIR_NOT_ALLOWED"
  | "ARTIFACT_PRIVACY_VIOLATION"
  | "WRITE_FAILED";

export type HrcDryRunArtifactExportArgs = {
  zipPath: string | null;
  outDir: string;
  allowRepoArtifactWrite: boolean;
};

export type HrcDryRunArtifactExportResult = {
  status: HrcDryRunArtifactExportStatus;
  ok: boolean;
  exitCode: number;
  artifactWritten: boolean;
  outputPath: string | null;
  outputDir: string | null;
  fileName: string | null;
  dryRunStatus: HrcRawZipDryRunReport["status"] | null;
  artifactReport: HrcDryRunArtifactReport | null;
  warnings: string[];
  errors: string[];
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
  apiUsed: false;
  uiUsed: false;
};

export type HrcDryRunArtifactExportDependencies = {
  repoRoot?: string;
  now?: () => Date;
  buildDryRunReport?: (
    zipPath: string,
    repoRoot: string,
  ) => HrcRawZipDryRunReport;
};

const DEFAULT_OUT_DIR = "artifacts/hrc-dry-run-reports";
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function parseHrcDryRunArtifactExportArgs(
  argv: string[],
): HrcDryRunArtifactExportArgs {
  let zipPath: string | null = null;
  let outDir = DEFAULT_OUT_DIR;
  let allowRepoArtifactWrite = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--allow-repo-artifact-write") {
      allowRepoArtifactWrite = true;
      continue;
    }

    if (arg === "--zip") {
      zipPath = readArgValue(argv, index, "--zip");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--zip=")) {
      zipPath = arg.slice("--zip=".length);
      continue;
    }

    if (arg === "--out") {
      outDir = readArgValue(argv, index, "--out");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--out=")) {
      outDir = arg.slice("--out=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    zipPath,
    outDir,
    allowRepoArtifactWrite,
  };
}

export function runHrcDryRunArtifactExport(
  argv: string[],
  dependencies: HrcDryRunArtifactExportDependencies = {},
): HrcDryRunArtifactExportResult {
  const repoRoot = resolve(dependencies.repoRoot ?? process.cwd());
  const now = dependencies.now ?? (() => new Date());
  const buildDryRunReport =
    dependencies.buildDryRunReport ?? buildHrcRawZipDryRunReport;
  let parsed: HrcDryRunArtifactExportArgs;

  try {
    parsed = parseHrcDryRunArtifactExportArgs(argv);
  } catch (error) {
    return result({
      status: "ARGUMENT_ERROR",
      errors: [error instanceof Error ? error.message : "argument parsing failed"],
    });
  }

  if (!parsed.zipPath || parsed.zipPath.trim().length === 0) {
    return result({
      status: "ARGUMENT_ERROR",
      errors: ["--zip is required"],
    });
  }

  const zipPath = resolve(parsed.zipPath);
  if (isPathInside(repoRoot, zipPath)) {
    return result({
      status: "RAW_ZIP_INSIDE_REPO",
      errors: ["raw HRC zip path must be outside the repository"],
    });
  }

  const outputDirCheck = resolveAllowedOutputDir(parsed.outDir, repoRoot);
  if (!outputDirCheck.allowed) {
    return result({
      status: "OUTPUT_DIR_NOT_ALLOWED",
      errors: [outputDirCheck.reason],
    });
  }

  const dryRunReport = buildDryRunReport(zipPath, repoRoot);
  const artifactReport = buildHrcDryRunArtifactReport(dryRunReport, {
    generatedAt: now(),
    zipPath,
  });

  if (!parsed.allowRepoArtifactWrite) {
    return result({
      status: "ALLOW_FLAG_REQUIRED",
      artifactReport,
      outputDir: outputDirCheck.outputDir,
      dryRunStatus: dryRunReport.status,
      warnings: [
        "repo artifact write was not applied; pass --allow-repo-artifact-write to export sanitized JSON",
      ],
      errors: [],
    });
  }

  const fileName = buildHrcDryRunArtifactFileName(artifactReport, {
    generatedAt: artifactReport.generatedAt,
  });
  const outputPath = resolve(join(outputDirCheck.outputDir, fileName));

  if (!isPathInside(outputDirCheck.outputDir, outputPath)) {
    return result({
      status: "OUTPUT_DIR_NOT_ALLOWED",
      artifactReport,
      outputDir: outputDirCheck.outputDir,
      dryRunStatus: dryRunReport.status,
      fileName,
      errors: ["artifact export blocked path traversal"],
    });
  }

  const json = `${JSON.stringify(artifactReport, null, 2)}\n`;
  const privacyError = findArtifactPrivacyViolation(json, zipPath);
  if (privacyError !== null) {
    return result({
      status: "ARTIFACT_PRIVACY_VIOLATION",
      artifactReport,
      outputDir: outputDirCheck.outputDir,
      dryRunStatus: dryRunReport.status,
      fileName,
      errors: [privacyError],
    });
  }

  try {
    mkdirSync(outputDirCheck.outputDir, { recursive: true });
    writeFileSync(outputPath, json, "utf8");
    JSON.parse(readFileSync(outputPath, "utf8"));
  } catch (error) {
    return result({
      status: "WRITE_FAILED",
      artifactReport,
      outputDir: outputDirCheck.outputDir,
      dryRunStatus: dryRunReport.status,
      fileName,
      errors: [
        `artifact export failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    });
  }

  return result({
    status: "OK",
    artifactWritten: true,
    artifactReport,
    outputPath,
    outputDir: outputDirCheck.outputDir,
    fileName,
    dryRunStatus: dryRunReport.status,
    warnings: dryRunReport.warnings,
    errors: [],
  });
}

export function resolveAllowedOutputDir(
  outDir: string,
  repoRoot: string,
): { allowed: true; outputDir: string } | { allowed: false; reason: string } {
  const expectedOutputDir = resolve(repoRoot, DEFAULT_OUT_DIR);
  const candidateOutputDir = resolve(repoRoot, outDir);

  if (candidateOutputDir !== expectedOutputDir) {
    return {
      allowed: false,
      reason: "output directory must be artifacts/hrc-dry-run-reports under the repository root",
    };
  }

  return {
    allowed: true,
    outputDir: expectedOutputDir,
  };
}

function result(
  partial: Partial<HrcDryRunArtifactExportResult> & {
    status: HrcDryRunArtifactExportStatus;
  },
): HrcDryRunArtifactExportResult {
  const ok = partial.status === "OK";

  return {
    ok,
    exitCode: ok ? 0 : 2,
    artifactWritten: partial.artifactWritten ?? false,
    outputPath: partial.outputPath ?? null,
    outputDir: partial.outputDir ?? null,
    fileName: partial.fileName ?? null,
    dryRunStatus: partial.dryRunStatus ?? null,
    artifactReport: partial.artifactReport ?? null,
    warnings: partial.warnings ?? [],
    errors: partial.errors ?? [],
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
    status: partial.status,
  };
}

function readArgValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function findArtifactPrivacyViolation(json: string, rawZipPath: string): string | null {
  const normalizedRawPath = rawZipPath.replace(/\\/g, "/");

  if (rawZipPath.length > 0 && json.includes(rawZipPath)) {
    return "artifact JSON contains the raw zip path";
  }

  if (normalizedRawPath.length > 0 && json.includes(normalizedRawPath)) {
    return "artifact JSON contains the normalized raw zip path";
  }

  if (/C:\\Users\\/i.test(json) || /C:\/Users\//i.test(json)) {
    return "artifact JSON contains a Windows user path";
  }

  if (/\bsample-user\b/i.test(json)) {
    return "artifact JSON contains a local user token";
  }

  if (EMAIL_PATTERN.test(json)) {
    return "artifact JSON contains an email-like value";
  }

  return null;
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function isCliEntryPoint(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  return Boolean(invokedPath) && resolve(invokedPath) === fileURLToPath(moduleUrl);
}

if (isCliEntryPoint(import.meta.url)) {
  const exportResult = runHrcDryRunArtifactExport(process.argv.slice(2));
  const output = {
    status: exportResult.status,
    artifactWritten: exportResult.artifactWritten,
    outputPath: exportResult.outputPath,
    dryRunStatus: exportResult.dryRunStatus,
    rawZipCommitted: exportResult.rawZipCommitted,
    productImportConnected: exportResult.productImportConnected,
    dbWriteApplied: exportResult.dbWriteApplied,
    apiUsed: exportResult.apiUsed,
    uiUsed: exportResult.uiUsed,
    warnings: exportResult.warnings,
    errors: exportResult.errors,
  };

  const text = JSON.stringify(output, null, 2);
  if (exportResult.ok) {
    console.log(text);
  } else {
    console.error(text);
  }
  process.exitCode = exportResult.exitCode;
}

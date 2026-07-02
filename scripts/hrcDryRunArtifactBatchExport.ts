import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHrcDryRunArtifactReport,
  HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
  type HrcDryRunArtifactReport,
} from "../packages/core/test/helpers/hrcDryRunArtifactReport.js";
import {
  buildHrcDryRunArtifactComparisonRows,
  buildHrcDryRunArtifactIndex,
  buildHrcDryRunArtifactIndexFileName,
} from "../packages/core/test/helpers/hrcDryRunArtifactIndex.js";
import { buildHrcDryRunArtifactFileName } from "../packages/core/test/helpers/hrcDryRunArtifactWriter.js";
import {
  buildHrcRawZipDryRunReport,
  type HrcRawZipDryRunReport,
} from "../packages/core/test/helpers/hrcRawZipDryRunReader.js";
import { resolveAllowedOutputDir } from "./hrcDryRunArtifactExport.js";

export type HrcDryRunArtifactBatchExportStatus =
  | "OK"
  | "INVALID_ARGUMENTS"
  | "INPUT_DIR_NOT_ALLOWED"
  | "INPUT_DIR_NOT_FOUND"
  | "ZIP_LIST_NOT_FOUND"
  | "ZIP_LIST_READ_FAILED"
  | "OUTPUT_DIR_NOT_ALLOWED"
  | "WRITE_NOT_ALLOWED"
  | "DRY_RUN_FAILED"
  | "ARTIFACT_PRIVACY_VIOLATION"
  | "WRITE_FAILED";

export type HrcDryRunArtifactBatchMode = "INPUT_DIR" | "ZIP_LIST";

export type HrcDryRunArtifactBatchExportArgs = {
  inputDir: string | null;
  zipListPath: string | null;
  outDir: string;
  maxFiles: number | null;
  continueOnError: boolean;
  writeIndex: boolean;
  allowRepoArtifactWrite: boolean;
  planOnly: boolean;
};

export type HrcDryRunArtifactBatchCandidate = {
  fileName: string;
  pathMasked: string;
  accepted: true;
  sourcePath: string;
};

export type HrcDryRunArtifactBatchCandidateSummary = Omit<
  HrcDryRunArtifactBatchCandidate,
  "sourcePath"
>;

export type HrcDryRunArtifactBatchSkippedCandidate = {
  fileName: string;
  pathMasked: string;
  reason:
    | "NON_ZIP_FILE"
    | "REPO_INTERNAL_ZIP"
    | "PATH_TRAVERSAL_REJECTED"
    | "MISSING_FILE"
    | "DIRECTORY_NOT_FILE";
};

export type HrcDryRunArtifactBatchFailedCandidate = {
  fileName: string;
  pathMasked: string;
  status: HrcRawZipDryRunReport["status"];
  warnings: string[];
  errors: string[];
};

export type HrcDryRunArtifactBatchSummary = {
  mode: HrcDryRunArtifactBatchMode;
  candidateCount: number;
  acceptedCount: number;
  skippedCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  wroteArtifactCount: number;
  wroteIndex: boolean;
  wroteComparison: boolean;
  continueOnError: boolean;
  writeIndexRequested: boolean;
  allowRepoArtifactWrite: boolean;
  maxFilesApplied: boolean;
  outDir: string;
  outputFilesSample: string[];
  candidatesSample: HrcDryRunArtifactBatchCandidateSummary[];
  skippedSample: HrcDryRunArtifactBatchSkippedCandidate[];
  failedSample: HrcDryRunArtifactBatchFailedCandidate[];
  safety: {
    rawZipCopied: false;
    rawZipExtracted: false;
    rawZipCommitted: false;
    productImportConnected: false;
    dbWriteApplied: false;
    apiUsed: false;
    uiUsed: false;
  };
};

export type HrcDryRunArtifactComparisonExport = {
  schemaVersion: typeof HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION;
  generatedAt: string;
  sourceKind: "HRC_RAW_ZIP_DRY_RUN_COMPARISON";
  reportCount: number;
  rows: Array<{
    zipFileNameSanitized: string;
    status: HrcDryRunArtifactReport["status"];
    privacySafe: boolean;
    selectedNodeEntry: string | null;
    selectedNodeReason: string | null;
    multipleNodeEntriesDetected: boolean;
    multiNodeAggregationApplied: false;
    actionCount: number;
    handCount: number;
    sequenceLength: number;
    validatorPassed: boolean;
    mismatchCount: number;
    mismatchCategories: string[];
    warningCount: number;
    errorCount: number;
    amountUnit: "UNKNOWN";
    amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED";
  }>;
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
  apiUsed: false;
  uiUsed: false;
};

export type HrcDryRunArtifactBatchExportResult = {
  status: HrcDryRunArtifactBatchExportStatus;
  ok: boolean;
  exitCode: number;
  batchSummary: HrcDryRunArtifactBatchSummary | null;
  artifactReports: HrcDryRunArtifactReport[];
  indexArtifact: ReturnType<typeof buildHrcDryRunArtifactIndex> | null;
  comparisonArtifact: HrcDryRunArtifactComparisonExport | null;
  artifactWritten: boolean;
  outputDir: string | null;
  warnings: string[];
  errors: string[];
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
  apiUsed: false;
  uiUsed: false;
};

export type HrcDryRunArtifactBatchExportDependencies = {
  repoRoot?: string;
  now?: () => Date;
  buildDryRunReport?: (
    zipPath: string,
    repoRoot: string,
  ) => HrcRawZipDryRunReport;
};

const DEFAULT_OUT_DIR = "artifacts/hrc-dry-run-reports";
const SAMPLE_LIMIT = 5;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function parseHrcDryRunArtifactBatchExportArgs(
  argv: string[],
): HrcDryRunArtifactBatchExportArgs {
  let inputDir: string | null = null;
  let zipListPath: string | null = null;
  let outDir = DEFAULT_OUT_DIR;
  let maxFiles: number | null = null;
  let continueOnError = false;
  let writeIndex = false;
  let allowRepoArtifactWrite = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--continue-on-error") {
      continueOnError = true;
      continue;
    }

    if (arg === "--write-index") {
      writeIndex = true;
      continue;
    }

    if (arg === "--allow-repo-artifact-write") {
      allowRepoArtifactWrite = true;
      continue;
    }

    if (arg === "--plan-only") {
      continue;
    }

    if (arg === "--input-dir") {
      inputDir = readArgValue(argv, index, "--input-dir");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--input-dir=")) {
      inputDir = arg.slice("--input-dir=".length);
      continue;
    }

    if (arg === "--zip-list") {
      zipListPath = readArgValue(argv, index, "--zip-list");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--zip-list=")) {
      zipListPath = arg.slice("--zip-list=".length);
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

    if (arg === "--max-files") {
      maxFiles = parseMaxFiles(readArgValue(argv, index, "--max-files"));
      index += 1;
      continue;
    }

    if (arg?.startsWith("--max-files=")) {
      maxFiles = parseMaxFiles(arg.slice("--max-files=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (inputDir !== null && zipListPath !== null) {
    throw new Error("--input-dir and --zip-list are mutually exclusive");
  }

  if (inputDir === null && zipListPath === null) {
    throw new Error("--input-dir or --zip-list is required");
  }

  return {
    inputDir,
    zipListPath,
    outDir,
    maxFiles,
    continueOnError,
    writeIndex,
    allowRepoArtifactWrite,
    planOnly: false,
  };
}

export function runHrcDryRunArtifactBatchExport(
  argv: string[],
  dependencies: HrcDryRunArtifactBatchExportDependencies = {},
): HrcDryRunArtifactBatchExportResult {
  const repoRoot = resolve(dependencies.repoRoot ?? process.cwd());
  const now = dependencies.now ?? (() => new Date());
  const buildDryRunReport =
    dependencies.buildDryRunReport ?? buildHrcRawZipDryRunReport;
  let parsed: HrcDryRunArtifactBatchExportArgs;

  try {
    parsed = parseHrcDryRunArtifactBatchExportArgs(argv);
  } catch (error) {
    return result({
      status: "INVALID_ARGUMENTS",
      errors: [
        error instanceof Error ? error.message : "argument parsing failed",
      ],
    });
  }

  const outputDirCheck = resolveAllowedOutputDir(parsed.outDir, repoRoot);
  if (!outputDirCheck.allowed) {
    return result({
      status: "OUTPUT_DIR_NOT_ALLOWED",
      errors: [outputDirCheck.reason],
    });
  }

  const listing =
    parsed.inputDir !== null
      ? listBatchCandidatesFromInputDir(parsed.inputDir, repoRoot)
      : listBatchCandidatesFromZipList(parsed.zipListPath ?? "", repoRoot);

  if (!listing.ok) {
    return result({
      status: listing.status,
      outputDir: outputDirCheck.outputDir,
      errors: listing.errors,
    });
  }

  const acceptedBeforeLimit = listing.candidates;
  const limitedCandidates =
    parsed.maxFiles === null
      ? acceptedBeforeLimit
      : acceptedBeforeLimit.slice(0, parsed.maxFiles);
  const maxFilesApplied =
    parsed.maxFiles !== null && acceptedBeforeLimit.length > limitedCandidates.length;
  const skippedCount =
    listing.skipped.length + acceptedBeforeLimit.length - limitedCandidates.length;

  if (limitedCandidates.length > 0 && !parsed.allowRepoArtifactWrite) {
    return result({
      status: "WRITE_NOT_ALLOWED",
      outputDir: outputDirCheck.outputDir,
      batchSummary: createBatchSummary({
        mode: listing.mode,
        candidateCount: listing.candidateCount,
        acceptedCandidates: limitedCandidates,
        skippedCandidates: listing.skipped,
        skippedCount,
        maxFilesApplied,
        parsed,
        outDir: outputDirCheck.outputDir,
        outputFiles: [],
        failedCandidates: [],
        processedCount: 0,
        succeededCount: 0,
        failedCount: 0,
        wroteArtifactCount: 0,
        wroteIndex: false,
        wroteComparison: false,
      }),
      warnings: [
        "batch artifact write was not applied; pass --allow-repo-artifact-write to export sanitized JSON",
      ],
      errors: ["repo artifact write is disabled without --allow-repo-artifact-write"],
    });
  }

  const generatedAt = now().toISOString();
  const artifactReports: HrcDryRunArtifactReport[] = [];
  const outputFiles: string[] = [];
  const failedCandidates: HrcDryRunArtifactBatchFailedCandidate[] = [];
  const warnings: string[] = [];
  let processedCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let wroteArtifactCount = 0;

  for (const candidate of limitedCandidates) {
    processedCount += 1;
    const dryRunReport = buildDryRunReport(candidate.sourcePath, repoRoot);
    const artifactReport = buildHrcDryRunArtifactReport(dryRunReport, {
      generatedAt,
      zipPath: candidate.sourcePath,
    });
    const failure = resolveDryRunFailure(candidate, dryRunReport, artifactReport);

    if (failure !== null) {
      failedCount += 1;
      failedCandidates.push(failure);

      if (!parsed.continueOnError) {
        break;
      }

      continue;
    }

    const fileName = buildHrcDryRunArtifactFileName(artifactReport, {
      generatedAt,
    });
    const writeOutcome = writeRepoArtifactJson({
      value: artifactReport,
      outputDir: outputDirCheck.outputDir,
      fileName,
      rawZipPath: candidate.sourcePath,
    });

    if (!writeOutcome.ok) {
      return result({
        status: writeOutcome.status,
        outputDir: outputDirCheck.outputDir,
        batchSummary: createBatchSummary({
          mode: listing.mode,
          candidateCount: listing.candidateCount,
          acceptedCandidates: limitedCandidates,
          skippedCandidates: listing.skipped,
          skippedCount,
          maxFilesApplied,
          parsed,
          outDir: outputDirCheck.outputDir,
          outputFiles,
          failedCandidates,
          processedCount,
          succeededCount,
          failedCount,
          wroteArtifactCount,
          wroteIndex: false,
          wroteComparison: false,
        }),
        artifactReports,
        warnings,
        errors: [writeOutcome.error],
      });
    }

    artifactReports.push(artifactReport);
    outputFiles.push(writeOutcome.fileName);
    wroteArtifactCount += 1;
    succeededCount += 1;
    warnings.push(...dryRunReport.warnings.map(sanitizeDiagnosticText));
  }

  const stoppedOnFailure = failedCount > 0 && !parsed.continueOnError;
  let indexArtifact: ReturnType<typeof buildHrcDryRunArtifactIndex> | null = null;
  let comparisonArtifact: HrcDryRunArtifactComparisonExport | null = null;
  let wroteIndex = false;
  let wroteComparison = false;

  if (!stoppedOnFailure && parsed.writeIndex && artifactReports.length > 0) {
    indexArtifact = buildHrcDryRunArtifactIndex(artifactReports, { generatedAt });
    comparisonArtifact = buildComparisonExport(artifactReports, generatedAt);

    const indexFileName = buildHrcDryRunArtifactIndexFileName({ generatedAt });
    const comparisonFileName = buildHrcDryRunArtifactIndexFileName({
      generatedAt,
      prefix: "hrc-dry-run-comparison",
    });
    const indexWrite = writeRepoArtifactJson({
      value: indexArtifact,
      outputDir: outputDirCheck.outputDir,
      fileName: indexFileName,
      rawZipPath: "",
    });
    if (!indexWrite.ok) {
      return result({
        status: indexWrite.status,
        outputDir: outputDirCheck.outputDir,
        batchSummary: createBatchSummary({
          mode: listing.mode,
          candidateCount: listing.candidateCount,
          acceptedCandidates: limitedCandidates,
          skippedCandidates: listing.skipped,
          skippedCount,
          maxFilesApplied,
          parsed,
          outDir: outputDirCheck.outputDir,
          outputFiles,
          failedCandidates,
          processedCount,
          succeededCount,
          failedCount,
          wroteArtifactCount,
          wroteIndex,
          wroteComparison,
        }),
        artifactReports,
        indexArtifact,
        comparisonArtifact,
        warnings,
        errors: [indexWrite.error],
      });
    }

    const comparisonWrite = writeRepoArtifactJson({
      value: comparisonArtifact,
      outputDir: outputDirCheck.outputDir,
      fileName: comparisonFileName,
      rawZipPath: "",
    });
    if (!comparisonWrite.ok) {
      return result({
        status: comparisonWrite.status,
        outputDir: outputDirCheck.outputDir,
        batchSummary: createBatchSummary({
          mode: listing.mode,
          candidateCount: listing.candidateCount,
          acceptedCandidates: limitedCandidates,
          skippedCandidates: listing.skipped,
          skippedCount,
          maxFilesApplied,
          parsed,
          outDir: outputDirCheck.outputDir,
          outputFiles: [...outputFiles, indexWrite.fileName],
          failedCandidates,
          processedCount,
          succeededCount,
          failedCount,
          wroteArtifactCount,
          wroteIndex: true,
          wroteComparison,
        }),
        artifactReports,
        indexArtifact,
        comparisonArtifact,
        warnings,
        errors: [comparisonWrite.error],
      });
    }

    outputFiles.push(indexWrite.fileName, comparisonWrite.fileName);
    wroteIndex = true;
    wroteComparison = true;
  }

  return result({
    status: stoppedOnFailure ? "DRY_RUN_FAILED" : "OK",
    outputDir: outputDirCheck.outputDir,
    batchSummary: createBatchSummary({
      mode: listing.mode,
      candidateCount: listing.candidateCount,
      acceptedCandidates: limitedCandidates,
      skippedCandidates: listing.skipped,
      skippedCount,
      maxFilesApplied,
      parsed,
      outDir: outputDirCheck.outputDir,
      outputFiles,
      failedCandidates,
      processedCount,
      succeededCount,
      failedCount,
      wroteArtifactCount,
      wroteIndex,
      wroteComparison,
    }),
    artifactReports,
    indexArtifact,
    comparisonArtifact,
    artifactWritten: outputFiles.length > 0,
    warnings,
    errors: stoppedOnFailure
      ? ["batch stopped after the first dry-run failure"]
      : [],
  });
}

export function listBatchCandidatesFromInputDir(
  inputDir: string,
  repoRoot: string,
):
  | {
      ok: true;
      mode: "INPUT_DIR";
      candidateCount: number;
      candidates: HrcDryRunArtifactBatchCandidate[];
      skipped: HrcDryRunArtifactBatchSkippedCandidate[];
    }
  | { ok: false; status: "INPUT_DIR_NOT_ALLOWED" | "INPUT_DIR_NOT_FOUND"; errors: string[] } {
  const resolvedInputDir = resolve(inputDir);

  if (hasPathTraversal(inputDir)) {
    return {
      ok: false,
      status: "INPUT_DIR_NOT_ALLOWED",
      errors: ["input directory path traversal was rejected"],
    };
  }

  if (isPathInside(repoRoot, resolvedInputDir)) {
    return {
      ok: false,
      status: "INPUT_DIR_NOT_ALLOWED",
      errors: ["input directory must be outside the repository"],
    };
  }

  if (!existsSync(resolvedInputDir) || !statSync(resolvedInputDir).isDirectory()) {
    return {
      ok: false,
      status: "INPUT_DIR_NOT_FOUND",
      errors: ["input directory was not found"],
    };
  }

  const files = readdirSync(resolvedInputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      fileName: entry.name,
      path: resolve(join(resolvedInputDir, entry.name)),
    }))
    .sort(compareCandidatePath);

  const candidates: HrcDryRunArtifactBatchCandidate[] = [];
  const skipped: HrcDryRunArtifactBatchSkippedCandidate[] = [];

  for (const file of files) {
    const skippedReason = classifyCandidateSkipReason(file.path, repoRoot);
    if (skippedReason !== null) {
      skipped.push({
        fileName: file.fileName,
        pathMasked: maskBatchPath(file.path, repoRoot),
        reason: skippedReason,
      });
      continue;
    }

    candidates.push({
      fileName: file.fileName,
      pathMasked: maskBatchPath(file.path, repoRoot),
      accepted: true,
      sourcePath: file.path,
    });
  }

  return {
    ok: true,
    mode: "INPUT_DIR",
    candidateCount: files.length,
    candidates,
    skipped,
  };
}

export function listBatchCandidatesFromZipList(
  zipListPath: string,
  repoRoot: string,
):
  | {
      ok: true;
      mode: "ZIP_LIST";
      candidateCount: number;
      candidates: HrcDryRunArtifactBatchCandidate[];
      skipped: HrcDryRunArtifactBatchSkippedCandidate[];
    }
  | { ok: false; status: "ZIP_LIST_NOT_FOUND" | "ZIP_LIST_READ_FAILED"; errors: string[] } {
  const resolvedListPath = resolve(zipListPath);
  if (!existsSync(resolvedListPath) || !statSync(resolvedListPath).isFile()) {
    return {
      ok: false,
      status: "ZIP_LIST_NOT_FOUND",
      errors: ["zip list file was not found"],
    };
  }

  let lines: string[];
  try {
    lines = readFileSync(resolvedListPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (error) {
    return {
      ok: false,
      status: "ZIP_LIST_READ_FAILED",
      errors: [
        `zip list could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    };
  }

  const rawEntries = lines.map((line) => ({
    fileName: line.split(/[\\/]/).pop() ?? line,
    path: line,
  }));
  const sortedEntries = rawEntries.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const candidates: HrcDryRunArtifactBatchCandidate[] = [];
  const skipped: HrcDryRunArtifactBatchSkippedCandidate[] = [];

  for (const entry of sortedEntries) {
    const resolvedPath = resolve(entry.path);
    const skippedReason = classifyCandidateSkipReason(resolvedPath, repoRoot, {
      originalPath: entry.path,
    });
    if (skippedReason !== null) {
      skipped.push({
        fileName: entry.fileName,
        pathMasked: maskBatchPath(resolvedPath, repoRoot),
        reason: skippedReason,
      });
      continue;
    }

    candidates.push({
      fileName: entry.fileName,
      pathMasked: maskBatchPath(resolvedPath, repoRoot),
      accepted: true,
      sourcePath: resolvedPath,
    });
  }

  return {
    ok: true,
    mode: "ZIP_LIST",
    candidateCount: sortedEntries.length,
    candidates,
    skipped,
  };
}

export function maskBatchPath(filePath: string, repoRoot: string): string {
  const resolvedPath = resolve(filePath);

  if (isPathInside(repoRoot, resolvedPath)) {
    return `<repo>/${relative(repoRoot, resolvedPath).replace(/\\/g, "/")}`;
  }

  return `<repo-external>/${resolvedPath.split(/[\\/]/).pop() ?? "unknown"}`;
}

function createBatchSummary(input: {
  mode: HrcDryRunArtifactBatchMode;
  candidateCount: number;
  acceptedCandidates: HrcDryRunArtifactBatchCandidate[];
  skippedCandidates: HrcDryRunArtifactBatchSkippedCandidate[];
  skippedCount: number;
  maxFilesApplied: boolean;
  parsed: HrcDryRunArtifactBatchExportArgs;
  outDir: string;
  outputFiles: string[];
  failedCandidates: HrcDryRunArtifactBatchFailedCandidate[];
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  wroteArtifactCount: number;
  wroteIndex: boolean;
  wroteComparison: boolean;
}): HrcDryRunArtifactBatchSummary {
  return {
    mode: input.mode,
    candidateCount: input.candidateCount,
    acceptedCount: input.acceptedCandidates.length,
    skippedCount: input.skippedCount,
    processedCount: input.processedCount,
    succeededCount: input.succeededCount,
    failedCount: input.failedCount,
    wroteArtifactCount: input.wroteArtifactCount,
    wroteIndex: input.wroteIndex,
    wroteComparison: input.wroteComparison,
    continueOnError: input.parsed.continueOnError,
    writeIndexRequested: input.parsed.writeIndex,
    allowRepoArtifactWrite: input.parsed.allowRepoArtifactWrite,
    maxFilesApplied: input.maxFilesApplied,
    outDir: input.outDir,
    outputFilesSample: input.outputFiles.slice(0, SAMPLE_LIMIT),
    candidatesSample: input.acceptedCandidates
      .map(toCandidateSummary)
      .slice(0, SAMPLE_LIMIT),
    skippedSample: input.skippedCandidates.slice(0, SAMPLE_LIMIT),
    failedSample: input.failedCandidates.slice(0, SAMPLE_LIMIT),
    safety: {
      rawZipCopied: false,
      rawZipExtracted: false,
      rawZipCommitted: false,
      productImportConnected: false,
      dbWriteApplied: false,
      apiUsed: false,
      uiUsed: false,
    },
  };
}

function resolveDryRunFailure(
  candidate: HrcDryRunArtifactBatchCandidate,
  dryRunReport: HrcRawZipDryRunReport,
  artifactReport: HrcDryRunArtifactReport,
): HrcDryRunArtifactBatchFailedCandidate | null {
  if (
    dryRunReport.status === "OK" &&
    artifactReport.privacySafe &&
    artifactReport.rawZipCommitted === false &&
    artifactReport.productImportConnected === false &&
    artifactReport.dbWriteApplied === false &&
    artifactReport.apiUsed === false &&
    artifactReport.uiUsed === false
  ) {
    return null;
  }

  return {
    fileName: candidate.fileName,
    pathMasked: candidate.pathMasked,
    status: dryRunReport.status,
    warnings: [
      ...dryRunReport.warnings,
      ...artifactReport.privacyWarnings,
    ].map(sanitizeDiagnosticText),
    errors: [
      ...dryRunReport.errors,
      ...(artifactReport.privacySafe ? [] : ["artifact report is not privacy safe"]),
    ].map(sanitizeDiagnosticText),
  };
}

function writeRepoArtifactJson(input: {
  value: unknown;
  outputDir: string;
  fileName: string;
  rawZipPath: string;
}):
  | { ok: true; fileName: string; outputPath: string }
  | {
      ok: false;
      status: "OUTPUT_DIR_NOT_ALLOWED" | "ARTIFACT_PRIVACY_VIOLATION" | "WRITE_FAILED";
      error: string;
    } {
  const safeFileName = input.fileName;
  const outputPath = resolve(join(input.outputDir, safeFileName));

  if (!isPathInside(input.outputDir, outputPath)) {
    return {
      ok: false,
      status: "OUTPUT_DIR_NOT_ALLOWED",
      error: "batch artifact export blocked path traversal",
    };
  }

  const json = `${JSON.stringify(input.value, null, 2)}\n`;
  const privacyError = findArtifactPrivacyViolation(json, input.rawZipPath);
  if (privacyError !== null) {
    return {
      ok: false,
      status: "ARTIFACT_PRIVACY_VIOLATION",
      error: privacyError,
    };
  }

  try {
    mkdirSync(input.outputDir, { recursive: true });
    writeFileSync(outputPath, json, "utf8");
    JSON.parse(readFileSync(outputPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      status: "WRITE_FAILED",
      error: `batch artifact export failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }

  return {
    ok: true,
    fileName: safeFileName,
    outputPath,
  };
}

function buildComparisonExport(
  reports: HrcDryRunArtifactReport[],
  generatedAt: string,
): HrcDryRunArtifactComparisonExport {
  const sortedRows = buildHrcDryRunArtifactComparisonRows(reports);
  const reportBySortKey = new Map(
    reports.map((report) => [
      `${report.zipFileNameSanitized}\n${report.generatedAt}\n${report.selectedNodeEntry ?? ""}`,
      report,
    ]),
  );

  return {
    schemaVersion: HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
    generatedAt,
    sourceKind: "HRC_RAW_ZIP_DRY_RUN_COMPARISON",
    reportCount: sortedRows.length,
    rows: sortedRows.map((row) => {
      const sourceReport = reportBySortKey.get(
        `${row.zipFileNameSanitized}\n${row.generatedAt}\n${row.selectedNodeEntry ?? ""}`,
      );

      return {
        zipFileNameSanitized: row.zipFileNameSanitized,
        status: row.status,
        privacySafe: row.privacySafe,
        selectedNodeEntry: row.selectedNodeEntry,
        selectedNodeReason: sourceReport?.selectedNodeReason ?? null,
        multipleNodeEntriesDetected:
          sourceReport?.multipleNodeEntriesDetected ?? false,
        multiNodeAggregationApplied: false,
        actionCount: row.actionCount,
        handCount: row.handCount,
        sequenceLength: row.sequenceLength,
        validatorPassed: row.validatorPass,
        mismatchCount: row.mismatchCount,
        mismatchCategories: row.mismatchCategories,
        warningCount: row.warningsCount,
        errorCount: row.errorsCount,
        amountUnit: "UNKNOWN",
        amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      };
    }),
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
  };
}

function toCandidateSummary(
  candidate: HrcDryRunArtifactBatchCandidate,
): HrcDryRunArtifactBatchCandidateSummary {
  return {
    fileName: candidate.fileName,
    pathMasked: candidate.pathMasked,
    accepted: true,
  };
}

function classifyCandidateSkipReason(
  candidatePath: string,
  repoRoot: string,
  options: { originalPath?: string } = {},
): HrcDryRunArtifactBatchSkippedCandidate["reason"] | null {
  if (hasPathTraversal(options.originalPath ?? candidatePath)) {
    return "PATH_TRAVERSAL_REJECTED";
  }

  if (extname(candidatePath).toLowerCase() !== ".zip") {
    return "NON_ZIP_FILE";
  }

  if (isPathInside(repoRoot, resolve(candidatePath))) {
    return "REPO_INTERNAL_ZIP";
  }

  if (!existsSync(candidatePath)) {
    return "MISSING_FILE";
  }

  if (!statSync(candidatePath).isFile()) {
    return "DIRECTORY_NOT_FILE";
  }

  return null;
}

function parseMaxFiles(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("--max-files must be a positive integer");
  }

  return Number(value);
}

function compareCandidatePath(
  left: { fileName: string; path: string },
  right: { fileName: string; path: string },
): number {
  const fileNameCompare = left.fileName.localeCompare(right.fileName);
  return fileNameCompare === 0 ? left.path.localeCompare(right.path) : fileNameCompare;
}

function hasPathTraversal(value: string): boolean {
  return value
    .split(/[\\/]+/)
    .some((segment) => segment === "..");
}

function result(
  partial: Partial<HrcDryRunArtifactBatchExportResult> & {
    status: HrcDryRunArtifactBatchExportStatus;
  },
): HrcDryRunArtifactBatchExportResult {
  const ok = partial.status === "OK";

  return {
    status: partial.status,
    ok,
    exitCode: ok ? 0 : 2,
    batchSummary: partial.batchSummary ?? null,
    artifactReports: partial.artifactReports ?? [],
    indexArtifact: partial.indexArtifact ?? null,
    comparisonArtifact: partial.comparisonArtifact ?? null,
    artifactWritten: partial.artifactWritten ?? false,
    outputDir: partial.outputDir ?? null,
    warnings: partial.warnings ?? [],
    errors: partial.errors ?? [],
    rawZipCommitted: false,
    productImportConnected: false,
    dbWriteApplied: false,
    apiUsed: false,
    uiUsed: false,
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

  if (/PK\u0003\u0004/.test(json)) {
    return "artifact JSON contains zip binary content";
  }

  return null;
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users\\[^\s"']*/gi, "<redacted-windows-path>")
    .replace(/C:\/Users\/[^\s"']*/gi, "<redacted-windows-path>")
    .replace(/\bsample-user\b/gi, "<redacted-user>")
    .replace(/\b(AppData|Desktop|Documents)\b/gi, "<redacted-path-token>")
    .replace(/\b(playerName|nickname|screenname|userName)\b/gi, "<redacted-field>");
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
  const exportResult = runHrcDryRunArtifactBatchExport(process.argv.slice(2));
  const output = {
    status: exportResult.status,
    artifactWritten: exportResult.artifactWritten,
    batchSummary: exportResult.batchSummary,
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

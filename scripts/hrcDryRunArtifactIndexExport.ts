import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION,
  HRC_DRY_RUN_ARTIFACT_SOURCE_KIND,
  type HrcDryRunArtifactReport,
} from "../packages/core/test/helpers/hrcDryRunArtifactReport.js";
import {
  buildHrcDryRunArtifactComparisonRows,
  buildHrcDryRunArtifactIndex,
  buildHrcDryRunArtifactIndexFileName,
} from "../packages/core/test/helpers/hrcDryRunArtifactIndex.js";
import { resolveAllowedOutputDir } from "./hrcDryRunArtifactExport.js";

export type HrcDryRunArtifactIndexExportStatus =
  | "OK"
  | "ARGUMENT_ERROR"
  | "ALLOW_FLAG_REQUIRED"
  | "REPORTS_DIR_NOT_ALLOWED"
  | "OUTPUT_DIR_NOT_ALLOWED"
  | "REPORT_FILE_REJECTED"
  | "REPORT_PARSE_ERROR"
  | "REPORT_SCHEMA_INVALID"
  | "REPORT_UNSAFE"
  | "ARTIFACT_PRIVACY_VIOLATION"
  | "WRITE_FAILED";

export type HrcDryRunArtifactIndexExportArgs = {
  reportsDir: string;
  outDir: string;
  allowRepoArtifactWrite: boolean;
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

export type HrcDryRunArtifactIndexExportResult = {
  status: HrcDryRunArtifactIndexExportStatus;
  ok: boolean;
  exitCode: number;
  indexWritten: boolean;
  comparisonWritten: boolean;
  reportsDir: string | null;
  outputDir: string | null;
  indexOutputPath: string | null;
  comparisonOutputPath: string | null;
  indexFileName: string | null;
  comparisonFileName: string | null;
  reportCount: number;
  warnings: string[];
  errors: string[];
  rawZipCommitted: false;
  productImportConnected: false;
  dbWriteApplied: false;
  apiUsed: false;
  uiUsed: false;
};

export type HrcDryRunArtifactIndexExportDependencies = {
  repoRoot?: string;
  now?: () => Date;
};

const DEFAULT_REPORTS_DIR = "artifacts/hrc-dry-run-reports";
const DEFAULT_OUT_DIR = "artifacts/hrc-dry-run-reports";
const COMPARISON_SOURCE_KIND = "HRC_RAW_ZIP_DRY_RUN_COMPARISON";
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function parseHrcDryRunArtifactIndexExportArgs(
  argv: string[],
): HrcDryRunArtifactIndexExportArgs {
  let reportsDir = DEFAULT_REPORTS_DIR;
  let outDir = DEFAULT_OUT_DIR;
  let allowRepoArtifactWrite = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--allow-repo-artifact-write") {
      allowRepoArtifactWrite = true;
      continue;
    }

    if (arg === "--reports") {
      reportsDir = readArgValue(argv, index, "--reports");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--reports=")) {
      reportsDir = arg.slice("--reports=".length);
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
    reportsDir,
    outDir,
    allowRepoArtifactWrite,
  };
}

export function runHrcDryRunArtifactIndexExport(
  argv: string[],
  dependencies: HrcDryRunArtifactIndexExportDependencies = {},
): HrcDryRunArtifactIndexExportResult {
  const repoRoot = resolve(dependencies.repoRoot ?? process.cwd());
  const now = dependencies.now ?? (() => new Date());
  let parsed: HrcDryRunArtifactIndexExportArgs;

  try {
    parsed = parseHrcDryRunArtifactIndexExportArgs(argv);
  } catch (error) {
    return result({
      status: "ARGUMENT_ERROR",
      errors: [error instanceof Error ? error.message : "argument parsing failed"],
    });
  }

  const reportsDirCheck = resolveAllowedReportsDir(parsed.reportsDir, repoRoot);
  if (!reportsDirCheck.allowed) {
    return result({
      status: "REPORTS_DIR_NOT_ALLOWED",
      errors: [reportsDirCheck.reason],
    });
  }

  const outputDirCheck = resolveAllowedOutputDir(parsed.outDir, repoRoot);
  if (!outputDirCheck.allowed) {
    return result({
      status: "OUTPUT_DIR_NOT_ALLOWED",
      errors: [outputDirCheck.reason],
    });
  }

  const loaded = loadArtifactReportsFromDir(reportsDirCheck.reportsDir);
  if (!loaded.ok) {
    return result({
      status: loaded.status,
      reportsDir: reportsDirCheck.reportsDir,
      outputDir: outputDirCheck.outputDir,
      errors: loaded.errors,
    });
  }

  const generatedAt = now().toISOString();
  const index = buildHrcDryRunArtifactIndex(loaded.reports, { generatedAt });
  const comparison = buildComparisonExport(loaded.reports, generatedAt);

  if (!parsed.allowRepoArtifactWrite) {
    return result({
      status: "ALLOW_FLAG_REQUIRED",
      reportsDir: reportsDirCheck.reportsDir,
      outputDir: outputDirCheck.outputDir,
      reportCount: loaded.reports.length,
      warnings: [
        "repo artifact index/comparison write was not applied; pass --allow-repo-artifact-write to export sanitized JSON",
      ],
      errors: [],
    });
  }

  const indexFileName = buildHrcDryRunArtifactIndexFileName({ generatedAt });
  const comparisonFileName = buildHrcDryRunArtifactIndexFileName({
    generatedAt,
    prefix: "hrc-dry-run-comparison",
  });
  const indexOutputPath = resolve(join(outputDirCheck.outputDir, indexFileName));
  const comparisonOutputPath = resolve(
    join(outputDirCheck.outputDir, comparisonFileName),
  );

  if (
    !isPathInside(outputDirCheck.outputDir, indexOutputPath) ||
    !isPathInside(outputDirCheck.outputDir, comparisonOutputPath)
  ) {
    return result({
      status: "OUTPUT_DIR_NOT_ALLOWED",
      reportsDir: reportsDirCheck.reportsDir,
      outputDir: outputDirCheck.outputDir,
      reportCount: loaded.reports.length,
      errors: ["artifact index export blocked path traversal"],
    });
  }

  const indexJson = `${JSON.stringify(index, null, 2)}\n`;
  const comparisonJson = `${JSON.stringify(comparison, null, 2)}\n`;
  const privacyError =
    findArtifactPrivacyViolation(indexJson) ??
    findArtifactPrivacyViolation(comparisonJson);
  if (privacyError !== null) {
    return result({
      status: "ARTIFACT_PRIVACY_VIOLATION",
      reportsDir: reportsDirCheck.reportsDir,
      outputDir: outputDirCheck.outputDir,
      reportCount: loaded.reports.length,
      errors: [privacyError],
    });
  }

  try {
    mkdirSync(outputDirCheck.outputDir, { recursive: true });
    writeFileSync(indexOutputPath, indexJson, "utf8");
    writeFileSync(comparisonOutputPath, comparisonJson, "utf8");
    JSON.parse(readFileSync(indexOutputPath, "utf8"));
    JSON.parse(readFileSync(comparisonOutputPath, "utf8"));
  } catch (error) {
    return result({
      status: "WRITE_FAILED",
      reportsDir: reportsDirCheck.reportsDir,
      outputDir: outputDirCheck.outputDir,
      reportCount: loaded.reports.length,
      errors: [
        `artifact index export failed: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    });
  }

  return result({
    status: "OK",
    indexWritten: true,
    comparisonWritten: true,
    reportsDir: reportsDirCheck.reportsDir,
    outputDir: outputDirCheck.outputDir,
    indexOutputPath,
    comparisonOutputPath,
    indexFileName,
    comparisonFileName,
    reportCount: loaded.reports.length,
  });
}

export function resolveAllowedReportsDir(
  reportsDir: string,
  repoRoot: string,
): { allowed: true; reportsDir: string } | { allowed: false; reason: string } {
  const expectedReportsDir = resolve(repoRoot, DEFAULT_REPORTS_DIR);
  const candidateReportsDir = resolve(repoRoot, reportsDir);

  if (candidateReportsDir !== expectedReportsDir) {
    return {
      allowed: false,
      reason: "reports directory must be artifacts/hrc-dry-run-reports under the repository root",
    };
  }

  return {
    allowed: true,
    reportsDir: expectedReportsDir,
  };
}

function loadArtifactReportsFromDir(
  reportsDir: string,
):
  | { ok: true; reports: HrcDryRunArtifactReport[] }
  | {
      ok: false;
      status:
        | "REPORT_FILE_REJECTED"
        | "REPORT_PARSE_ERROR"
        | "REPORT_SCHEMA_INVALID"
        | "REPORT_UNSAFE";
      errors: string[];
    } {
  let fileNames: string[];
  try {
    fileNames = readdirSync(reportsDir);
  } catch (error) {
    return {
      ok: false,
      status: "REPORT_FILE_REJECTED",
      errors: [
        `reports directory could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
      ],
    };
  }

  const reports: HrcDryRunArtifactReport[] = [];
  for (const fileName of fileNames.sort((left, right) => left.localeCompare(right))) {
    const filePath = resolve(join(reportsDir, fileName));

    if (!isPathInside(reportsDir, filePath)) {
      return {
        ok: false,
        status: "REPORT_FILE_REJECTED",
        errors: [`report path traversal was rejected: ${fileName}`],
      };
    }

    if (extname(fileName).toLowerCase() === ".zip") {
      return {
        ok: false,
        status: "REPORT_FILE_REJECTED",
        errors: [`zip files are not valid dry-run artifact reports: ${fileName}`],
      };
    }

    if (extname(fileName).toLowerCase() !== ".json") {
      return {
        ok: false,
        status: "REPORT_FILE_REJECTED",
        errors: [`non-JSON files are not valid dry-run artifact reports: ${fileName}`],
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, "utf8"));
    } catch {
      return {
        ok: false,
        status: "REPORT_PARSE_ERROR",
        errors: [`artifact report JSON is malformed: ${fileName}`],
      };
    }

    const report = validateArtifactReport(parsed, fileName);
    if (!report.ok) {
      return report;
    }

    reports.push(report.report);
  }

  if (reports.length === 0) {
    return {
      ok: false,
      status: "REPORT_FILE_REJECTED",
      errors: ["no artifact report JSON files were found"],
    };
  }

  return {
    ok: true,
    reports,
  };
}

function validateArtifactReport(
  value: unknown,
  fileName: string,
):
  | { ok: true; report: HrcDryRunArtifactReport }
  | {
      ok: false;
      status: "REPORT_SCHEMA_INVALID" | "REPORT_UNSAFE";
      errors: string[];
    } {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      status: "REPORT_SCHEMA_INVALID",
      errors: [`artifact report must be a JSON object: ${fileName}`],
    };
  }

  if (
    value.schemaVersion !== HRC_DRY_RUN_ARTIFACT_SCHEMA_VERSION ||
    value.sourceKind !== HRC_DRY_RUN_ARTIFACT_SOURCE_KIND
  ) {
    return {
      ok: false,
      status: "REPORT_SCHEMA_INVALID",
      errors: [`artifact report schema/sourceKind is invalid: ${fileName}`],
    };
  }

  const requiredFalseFlags = [
    "rawZipCommitted",
    "productImportConnected",
    "dbWriteApplied",
    "apiUsed",
    "uiUsed",
    "multiNodeAggregationApplied",
  ];
  const unsafeFlag = requiredFalseFlags.find((key) => value[key] !== false);
  if (unsafeFlag) {
    return {
      ok: false,
      status: "REPORT_UNSAFE",
      errors: [`artifact report has unsafe flag ${unsafeFlag}: ${fileName}`],
    };
  }

  if (value.privacySafe !== true) {
    return {
      ok: false,
      status: "REPORT_UNSAFE",
      errors: [`artifact report is not privacy safe: ${fileName}`],
    };
  }

  if (
    Array.isArray(value.privacyWarnings) &&
    value.privacyWarnings.length > 0
  ) {
    return {
      ok: false,
      status: "REPORT_UNSAFE",
      errors: [`artifact report contains privacy warnings: ${fileName}`],
    };
  }

  const privacyError = findArtifactPrivacyViolation(JSON.stringify(value));
  if (privacyError !== null) {
    return {
      ok: false,
      status: "REPORT_UNSAFE",
      errors: [`${privacyError}: ${fileName}`],
    };
  }

  return {
    ok: true,
    report: value as HrcDryRunArtifactReport,
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
    sourceKind: COMPARISON_SOURCE_KIND,
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

function result(
  partial: Partial<HrcDryRunArtifactIndexExportResult> & {
    status: HrcDryRunArtifactIndexExportStatus;
  },
): HrcDryRunArtifactIndexExportResult {
  const ok = partial.status === "OK";

  return {
    ok,
    exitCode: ok ? 0 : 2,
    indexWritten: partial.indexWritten ?? false,
    comparisonWritten: partial.comparisonWritten ?? false,
    reportsDir: partial.reportsDir ?? null,
    outputDir: partial.outputDir ?? null,
    indexOutputPath: partial.indexOutputPath ?? null,
    comparisonOutputPath: partial.comparisonOutputPath ?? null,
    indexFileName: partial.indexFileName ?? null,
    comparisonFileName: partial.comparisonFileName ?? null,
    reportCount: partial.reportCount ?? 0,
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

function findArtifactPrivacyViolation(json: string): string | null {
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

function isPathInside(parentPath: string, childPath: string): boolean {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCliEntryPoint(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  return Boolean(invokedPath) && resolve(invokedPath) === fileURLToPath(moduleUrl);
}

if (isCliEntryPoint(import.meta.url)) {
  const exportResult = runHrcDryRunArtifactIndexExport(process.argv.slice(2));
  const output = {
    status: exportResult.status,
    indexWritten: exportResult.indexWritten,
    comparisonWritten: exportResult.comparisonWritten,
    indexOutputPath: exportResult.indexOutputPath,
    comparisonOutputPath: exportResult.comparisonOutputPath,
    reportCount: exportResult.reportCount,
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

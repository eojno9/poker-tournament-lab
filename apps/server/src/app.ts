import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  HAND_KEYS,
  RESULT_SOURCES,
  diffCanonicalInputs,
  canonicalSpotKey,
  evaluateFallbackIcm,
  classifyHrcDatabaseFile,
  parseCsv,
  parseHrcImport,
  validateSpotShape,
  type AnalyzeRequest,
  type AnalyzeResult,
  type HrcImportPayload,
  type SpotInput
} from "@poker-tournament-lab/core";
import { LabDatabase } from "./db.js";

type ReportStatus = "available" | "missing" | "invalid";

interface LatestReportEnvelope<TSummary> {
  status: ReportStatus;
  fileName: string;
  generatedAt: string | null;
  summary: TSummary | null;
  error: string | null;
}

interface ImportReportSummary {
  importedFiles: number | null;
  skippedFiles: number | null;
  discardedHrczFiles: number | null;
  importedRecords: number | null;
  failedRecords: number | null;
  warnings: string[];
  skippedDetails: Array<{ fileName: string; reason: string }>;
  discardedHrczList: string[];
}

interface VerificationReportSummary {
  exactLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
    failures: Array<{ id: number | null; reason: string }>;
  };
  randomLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
    failures: Array<{ id: number | null; reason: string }>;
  };
  duplicateCanonicalKeyCount: number | null;
  nearMatchFalsePositiveCount: number | null;
  duplicateCanonicalKeyDetails: Array<{ canonicalKey: string; count: number | null }>;
  nearMatchFalsePositives: Array<{
    id: number | null;
    mutation: string | null;
    source: string | null;
    status: number | null;
  }>;
}

interface CanonicalKeyReportSummary {
  mismatchCount: number | null;
  updatedCount: number | null;
  collisionCount: number | null;
  invalidCount: number | null;
}

interface LatestReportsSummary {
  importReport: LatestReportEnvelope<ImportReportSummary>;
  verificationReport: LatestReportEnvelope<VerificationReportSummary>;
  canonicalKeyReport: LatestReportEnvelope<CanonicalKeyReportSummary>;
}

interface DbHealthSummary {
  totalSolutions: number;
  totalStrategyEntries: number;
  distinctCanonicalKeys: number;
  duplicateCanonicalKeyCount: number;
  latestImportStatus: ReportStatus;
  latestVerificationStatus: ReportStatus;
  latestCanonicalKeyReportStatus: ReportStatus;
  exactLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
  };
  randomLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
  };
  nearMatchFalsePositiveCount: number | null;
  discardedHrczCount: number | null;
  skippedFileCount: number | null;
  failedRecordCount: number | null;
  canonicalKey: {
    mismatchCount: number | null;
    updatedCount: number | null;
    collisionCount: number | null;
    invalidCount: number | null;
  };
}

type ValidationStatus = "PASS" | "WARN" | "FAIL";
type ValidationSeverity = "error" | "warning";

interface ImportValidationIssue {
  rowNumber: number | null;
  severity: ValidationSeverity;
  code: string;
  field: string | null;
  message: string;
}

interface DuplicateCanonicalPreview {
  canonicalKey: string;
  rowNumbers: number[];
  count: number;
}

interface ImportValidationSummary {
  status: ValidationStatus;
  format: "json" | "csv";
  totalRows: number;
  validRows: number;
  failedRows: number;
  errorCount: number;
  warningCount: number;
  duplicateCanonicalKeyCount: number;
  duplicateCanonicalKeyPreview: DuplicateCanonicalPreview[];
  issues: ImportValidationIssue[];
  generatedAt: string;
}

export function createApp(database = new LabDatabase()) {
  const app = express();
  app.locals.database = database;
  app.use(cors());
  app.use(express.json({ limit: "30mb" }));

  app.get("/api/health", ((_req, res) => {
    res.json({ ok: true, app: "poker-tournament-lab" });
  }) satisfies RequestHandler);

  app.get("/api/imports", ((_req, res) => {
    res.json({ imports: database.listImports() });
  }) satisfies RequestHandler);

  app.get("/api/solutions", ((req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    const solutions = database.listSolutions(search, Number.isFinite(limit) ? limit : 50).map((solution) => ({
      id: solution.id,
      importId: solution.importId,
      canonicalKey: solution.canonicalKey,
      spot: solution.spot,
      sourceLabel: solution.sourceLabel,
      externalId: solution.externalId,
      importedAt: solution.importedAt,
      fileName: solution.fileName,
      fileHash: solution.fileHash,
      databaseFeatures: solution.databaseFeatures,
      strategy: solution.strategy,
      evSummary: solution.evSummary
    }));
    res.json({ solutions });
  }) satisfies RequestHandler);

  app.get("/api/reports/latest", ((_req, res) => {
    res.json(readLatestReportsSummary());
  }) satisfies RequestHandler);

  app.get("/api/db/health", ((_req, res) => {
    const reports = readLatestReportsSummary();
    const counts = database.getHealthCounts();
    res.json(buildDbHealthSummary(counts, reports));
  }) satisfies RequestHandler);

  app.post("/api/canonical-key/diff", ((req, res) => {
    const payload = req.body as { left?: unknown; right?: unknown };
    if (!payload || payload.left === undefined || payload.right === undefined) {
      res.status(400).json({ error: "left and right inputs are required" });
      return;
    }

    const leftInput = parseCanonicalDiffSide(payload.left, "left");
    const rightInput = parseCanonicalDiffSide(payload.right, "right");
    res.json(diffCanonicalInputs(leftInput, rightInput));
  }) satisfies RequestHandler);

  app.post("/api/imports/validate", ((req, res) => {
    const payload = req.body as Partial<HrcImportPayload>;
    if (payload.format !== "json" && payload.format !== "csv") {
      res.status(400).json({ error: "format must be json or csv" });
      return;
    }
    if (typeof payload.content !== "string" || payload.content.trim().length === 0) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const summary = validateImportPayload({
      format: payload.format,
      content: payload.content
    });
    res.json(summary);
  }) satisfies RequestHandler);

  app.post("/api/imports/hrc", ((req, res) => {
    const payload = req.body as Partial<HrcImportPayload>;
    if (payload.format !== "json" && payload.format !== "csv") {
      res.status(400).json({ error: "format must be json or csv" });
      return;
    }
    if (typeof payload.content !== "string" || payload.content.trim().length === 0) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    const databaseFeatures = typeof payload.fileName === "string" ? classifyHrcDatabaseFile(payload.fileName) : undefined;
    const importPayload: HrcImportPayload = {
      format: payload.format,
      content: payload.content
    };
    if (typeof payload.fileName === "string") {
      importPayload.fileName = payload.fileName;
    }
    if (typeof payload.sourceLabel === "string") {
      importPayload.sourceLabel = payload.sourceLabel;
    }
    if (databaseFeatures) {
      importPayload.databaseFeatures = databaseFeatures;
    }

    const parsed = parseHrcImport(importPayload);
    const storeArgs = {
      format: payload.format,
      content: payload.content,
      records: parsed.records
    };
    const summary = database.storeImport({
      ...storeArgs,
      ...(typeof payload.fileName === "string" ? { fileName: payload.fileName } : {}),
      ...(typeof payload.sourceLabel === "string" ? { sourceLabel: payload.sourceLabel } : {}),
      ...(databaseFeatures ? { databaseFeatures } : {})
    });

    res.status(201).json({
      import: summary,
      canonicalKeys: parsed.canonicalKeys
    });
  }) satisfies RequestHandler);

  app.post("/api/analyze", ((req, res) => {
    const request = req.body as AnalyzeRequest;
    if (!request || !request.spot) {
      res.status(400).json({ error: "spot is required" });
      return;
    }

    const canonicalKey = canonicalSpotKey(request.spot);
    const stored = database.findSolution(canonicalKey);
    if (stored) {
      const result: AnalyzeResult = {
        source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
        sourceLabel: stored.sourceLabel || "HRC precomputed DB",
        canonicalKey,
        assumptions: ["입력 spot의 정규화 canonical key가 imported HRC DB와 정확히 일치했습니다."],
        limitations: ["가까운 spot 또는 허용 오차 매칭은 사용하지 않았습니다."],
        strategy: stored.strategy,
        evSummary: stored.evSummary,
        metadata: {
          importId: stored.importId,
          importedAt: stored.importedAt,
          fileName: stored.fileName,
          fileHash: stored.fileHash,
          externalId: stored.externalId,
          databaseFeatures: stored.databaseFeatures
        }
      };
      res.json(result);
      return;
    }

    res.json(evaluateFallbackIcm(request));
  }) satisfies RequestHandler);

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const message = error instanceof Error ? error.message : "unknown server error";
    res.status(400).json({ error: message });
  };
  app.use(errorHandler);

  return app;
}

function readLatestReportsSummary(): LatestReportsSummary {
  return {
    importReport: readReportFile("latest-import-report.json", parseImportReportSummary, "startedAt"),
    verificationReport: readReportFile("latest-verification-report.json", parseVerificationReportSummary, "generatedAt"),
    canonicalKeyReport: readReportFile("latest-canonical-key-report.json", parseCanonicalKeyReportSummary, "checkedAt")
  };
}

function buildDbHealthSummary(
  counts: { totalSolutions: number; totalStrategyEntries: number; distinctCanonicalKeys: number; duplicateCanonicalKeyCount: number },
  reports: LatestReportsSummary
): DbHealthSummary {
  const importSummary = reports.importReport.summary;
  const verificationSummary = reports.verificationReport.summary;
  const canonicalSummary = reports.canonicalKeyReport.summary;
  return {
    totalSolutions: counts.totalSolutions,
    totalStrategyEntries: counts.totalStrategyEntries,
    distinctCanonicalKeys: counts.distinctCanonicalKeys,
    duplicateCanonicalKeyCount: counts.duplicateCanonicalKeyCount,
    latestImportStatus: reports.importReport.status,
    latestVerificationStatus: reports.verificationReport.status,
    latestCanonicalKeyReportStatus: reports.canonicalKeyReport.status,
    exactLookup: {
      success: verificationSummary?.exactLookup.success ?? null,
      total: verificationSummary?.exactLookup.total ?? null,
      successRatePct: verificationSummary?.exactLookup.successRatePct ?? null
    },
    randomLookup: {
      success: verificationSummary?.randomLookup.success ?? null,
      total: verificationSummary?.randomLookup.total ?? null,
      successRatePct: verificationSummary?.randomLookup.successRatePct ?? null
    },
    nearMatchFalsePositiveCount: verificationSummary?.nearMatchFalsePositiveCount ?? null,
    discardedHrczCount: importSummary?.discardedHrczFiles ?? null,
    skippedFileCount: importSummary?.skippedFiles ?? null,
    failedRecordCount: importSummary?.failedRecords ?? null,
    canonicalKey: {
      mismatchCount: canonicalSummary?.mismatchCount ?? null,
      updatedCount: canonicalSummary?.updatedCount ?? null,
      collisionCount: canonicalSummary?.collisionCount ?? null,
      invalidCount: canonicalSummary?.invalidCount ?? null
    }
  };
}

function parseCanonicalDiffSide(value: unknown, sideLabel: "left" | "right"): { spot: SpotInput; treeConfig?: string | null } {
  const record = toRecord(value);
  if (!record) {
    throw new Error(`${sideLabel} must be a spot object or { spot, treeConfig }`);
  }

  const candidateSpot = "spot" in record ? record.spot : value;
  const spotRecord = toRecord(candidateSpot);
  if (!spotRecord) {
    throw new Error(`${sideLabel}.spot must be an object`);
  }

  const treeConfig = "spot" in record ? readOptionalString(record.treeConfig) : null;
  if (treeConfig) {
    return { spot: candidateSpot as SpotInput, treeConfig };
  }
  return { spot: candidateSpot as SpotInput };
}

const HAND_KEY_SET = new Set(HAND_KEYS);
const HAND_ACTION_SET = new Set(["SHOVE", "FOLD", "MIXED"]);

function validateImportPayload(payload: Pick<HrcImportPayload, "format" | "content">): ImportValidationSummary {
  const issues: ImportValidationIssue[] = [];
  const rowHasError = new Map<number, boolean>();
  const canonicalPreview = new Map<string, number[]>();
  const rows = extractValidationRows(payload, issues, rowHasError);

  for (const row of rows) {
    validateSpotForImport(row.rowNumber, row.spot, issues, rowHasError, canonicalPreview);
    validateStrategyForImport(row.rowNumber, row.strategy, issues, rowHasError);
    validateEvSummaryForImport(row.rowNumber, row.evSummary, issues, rowHasError);
  }

  const duplicateCanonicalKeyPreview: DuplicateCanonicalPreview[] = [];
  let duplicateCanonicalKeyCount = 0;
  for (const [canonicalKey, rowNumbers] of canonicalPreview.entries()) {
    if (rowNumbers.length < 2) {
      continue;
    }
    duplicateCanonicalKeyCount += rowNumbers.length - 1;
    duplicateCanonicalKeyPreview.push({
      canonicalKey,
      rowNumbers: [...rowNumbers],
      count: rowNumbers.length
    });
  }

  if (duplicateCanonicalKeyPreview.length > 0) {
    issues.push({
      rowNumber: null,
      severity: "warning",
      code: "DUPLICATE_CANONICAL_KEY_PREVIEW",
      field: "canonicalKey",
      message: `${duplicateCanonicalKeyPreview.length} duplicate canonical key group(s) detected in this payload.`
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const failedRows = rowHasError.size;
  const validRows = Math.max(0, rows.length - failedRows);
  const status: ValidationStatus = errorCount > 0 ? "FAIL" : warningCount > 0 ? "WARN" : "PASS";

  return {
    status,
    format: payload.format,
    totalRows: rows.length,
    validRows,
    failedRows,
    errorCount,
    warningCount,
    duplicateCanonicalKeyCount,
    duplicateCanonicalKeyPreview,
    issues,
    generatedAt: new Date().toISOString()
  };
}

interface ValidationRow {
  rowNumber: number;
  spot: unknown;
  strategy: unknown;
  evSummary: unknown;
}

function extractValidationRows(
  payload: Pick<HrcImportPayload, "format" | "content">,
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>
): ValidationRow[] {
  if (payload.format === "json") {
    return extractJsonValidationRows(payload.content, issues, rowHasError);
  }
  return extractCsvValidationRows(payload.content, issues, rowHasError);
}

function extractJsonValidationRows(content: string, issues: ImportValidationIssue[], rowHasError: Map<number, boolean>): ValidationRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    pushIssue(issues, rowHasError, {
      rowNumber: null,
      severity: "error",
      code: "INVALID_JSON",
      field: "content",
      message: `invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`
    });
    return [];
  }

  let rawRows: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    rawRows = parsed;
  } else if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.records)) {
      rawRows = record.records;
    } else if (Array.isArray(record.solutions)) {
      rawRows = record.solutions;
    }
  }

  if (!rawRows) {
    pushIssue(issues, rowHasError, {
      rowNumber: null,
      severity: "error",
      code: "INVALID_JSON_SHAPE",
      field: "content",
      message: "JSON import must be an array or an object with records/solutions"
    });
    return [];
  }

  return rawRows.map((rawRow, index) => {
    const rowNumber = index + 1;
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      pushIssue(issues, rowHasError, {
        rowNumber,
        severity: "error",
        code: "MALFORMED_ROW",
        field: "row",
        message: "record must be an object"
      });
      return {
        rowNumber,
        spot: null,
        strategy: null,
        evSummary: null
      };
    }
    const item = rawRow as Record<string, unknown>;
    return {
      rowNumber,
      spot: item.spot,
      strategy: item.strategy,
      evSummary: item.evSummary ?? null
    };
  });
}

function extractCsvValidationRows(content: string, issues: ImportValidationIssue[], rowHasError: Map<number, boolean>): ValidationRow[] {
  const parsedRows = parseCsv(content);
  if (parsedRows.length < 2) {
    pushIssue(issues, rowHasError, {
      rowNumber: null,
      severity: "error",
      code: "INVALID_CSV_SHAPE",
      field: "content",
      message: "CSV import must include a header row and at least one data row"
    });
    return [];
  }
  const [headerRow, ...dataRows] = parsedRows;
  const headers = (headerRow ?? []).map((header) => header.trim());
  const filtered = dataRows.filter((row) => row.some((cell) => cell.trim().length > 0));

  return filtered.map((row, index) => {
    const rowNumber = index + 2;
    const item: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      item[header] = row[columnIndex] ?? "";
    });

    let spot: unknown = null;
    let strategy: unknown = null;
    let evSummary: unknown = null;

    if (!item.spot_json) {
      pushIssue(issues, rowHasError, {
        rowNumber,
        severity: "error",
        code: "MISSING_SPOT_JSON",
        field: "spot_json",
        message: "CSV row is missing spot_json"
      });
    } else {
      try {
        spot = JSON.parse(item.spot_json);
      } catch (error) {
        pushIssue(issues, rowHasError, {
          rowNumber,
          severity: "error",
          code: "INVALID_SPOT_JSON",
          field: "spot_json",
          message: `invalid JSON in spot_json: ${error instanceof Error ? error.message : "unknown parse error"}`
        });
      }
    }

    if (!item.strategy_json) {
      pushIssue(issues, rowHasError, {
        rowNumber,
        severity: "error",
        code: "MISSING_STRATEGY_JSON",
        field: "strategy_json",
        message: "CSV row is missing strategy_json"
      });
    } else {
      try {
        strategy = JSON.parse(item.strategy_json);
      } catch (error) {
        pushIssue(issues, rowHasError, {
          rowNumber,
          severity: "error",
          code: "INVALID_STRATEGY_JSON",
          field: "strategy_json",
          message: `invalid JSON in strategy_json: ${error instanceof Error ? error.message : "unknown parse error"}`
        });
      }
    }

    if (item.ev_summary_json) {
      try {
        evSummary = JSON.parse(item.ev_summary_json);
      } catch (error) {
        pushIssue(issues, rowHasError, {
          rowNumber,
          severity: "error",
          code: "INVALID_EV_SUMMARY_JSON",
          field: "ev_summary_json",
          message: `invalid JSON in ev_summary_json: ${error instanceof Error ? error.message : "unknown parse error"}`
        });
      }
    }

    return { rowNumber, spot, strategy, evSummary };
  });
}

function validateSpotForImport(
  rowNumber: number,
  rawSpot: unknown,
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>,
  canonicalPreview: Map<string, number[]>
): void {
  if (!rawSpot || typeof rawSpot !== "object" || Array.isArray(rawSpot)) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "MISSING_SPOT",
      field: "spot",
      message: "record is missing spot object"
    });
    return;
  }
  const spot = rawSpot as Record<string, unknown>;
  const requiredFields: Array<[string, unknown]> = [
    ["spot.gameType", spot.gameType],
    ["spot.tournamentType", spot.tournamentType],
    ["spot.decisionType", spot.decisionType],
    ["spot.tableSize", spot.tableSize],
    ["spot.heroSeat", spot.heroSeat],
    ["spot.heroPosition", spot.heroPosition],
    ["spot.potBb", spot.potBb],
    ["spot.players", spot.players],
    ["spot.payouts", spot.payouts],
    ["spot.actionPath", spot.actionPath]
  ];

  for (const [field, value] of requiredFields) {
    if (!isPresent(value)) {
      pushIssue(issues, rowHasError, {
        rowNumber,
        severity: "error",
        code: "MISSING_REQUIRED_FIELD",
        field,
        message: `${field} is required`
      });
    }
  }

  const blinds = (spot.blinds && typeof spot.blinds === "object" && !Array.isArray(spot.blinds)
    ? (spot.blinds as Record<string, unknown>)
    : null);
  if (!blinds) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "MISSING_REQUIRED_FIELD",
      field: "spot.blinds",
      message: "spot.blinds is required"
    });
  } else {
    const blindFields: Array<[string, unknown]> = [
      ["spot.blinds.smallBb", blinds.smallBb],
      ["spot.blinds.bigBb", blinds.bigBb],
      ["spot.blinds.anteBb", blinds.anteBb]
    ];
    for (const [field, value] of blindFields) {
      if (!isPresent(value)) {
        pushIssue(issues, rowHasError, {
          rowNumber,
          severity: "error",
          code: "MISSING_REQUIRED_FIELD",
          field,
          message: `${field} is required`
        });
      }
    }
  }

  const shapeErrors = validateSpotShape(rawSpot as SpotInput);
  for (const message of shapeErrors) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "INVALID_SPOT_FIELD",
      field: "spot",
      message
    });
  }

  try {
    const canonicalKey = canonicalSpotKey(rawSpot as SpotInput);
    const rows = canonicalPreview.get(canonicalKey) ?? [];
    rows.push(rowNumber);
    canonicalPreview.set(canonicalKey, rows);
  } catch (error) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "CANONICAL_KEY_FAILED",
      field: "spot",
      message: `canonical key generation failed: ${error instanceof Error ? error.message : "unknown error"}`
    });
  }
}

function validateStrategyForImport(
  rowNumber: number,
  rawStrategy: unknown,
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>
): void {
  if (!rawStrategy || typeof rawStrategy !== "object" || Array.isArray(rawStrategy)) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "MISSING_STRATEGY",
      field: "strategy",
      message: "record is missing strategy object"
    });
    return;
  }

  const strategy = rawStrategy as Record<string, unknown>;
  const strategyKeys = Object.keys(strategy);
  if (strategyKeys.length !== HAND_KEYS.length) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "warning",
      code: "STRATEGY_COUNT_NOT_169",
      field: "strategy",
      message: `strategy contains ${strategyKeys.length} hand keys (expected 169).`
    });
  }

  for (const handKey of strategyKeys) {
    if (!HAND_KEY_SET.has(handKey)) {
      pushIssue(issues, rowHasError, {
        rowNumber,
        severity: "error",
        code: "INVALID_HAND_KEY",
        field: `strategy.${handKey}`,
        message: "hand key is not valid 169-hand notation"
      });
      continue;
    }

    const value = strategy[handKey];
    if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        pushIssue(issues, rowHasError, {
          rowNumber,
          severity: "error",
          code: "INVALID_FREQUENCY_RANGE",
          field: `strategy.${handKey}`,
          message: "frequency must be within 0 and 1"
        });
      }
      continue;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      pushIssue(issues, rowHasError, {
        rowNumber,
        severity: "error",
        code: "INVALID_HAND_ENTRY",
        field: `strategy.${handKey}`,
        message: "hand strategy entry must be a number or object"
      });
      continue;
    }

    const entry = value as Record<string, unknown>;
    if (entry.action !== undefined) {
      const action = typeof entry.action === "string" ? entry.action.toUpperCase() : null;
      if (!action || !HAND_ACTION_SET.has(action)) {
        pushIssue(issues, rowHasError, {
          rowNumber,
          severity: "error",
          code: "INVALID_ACTION",
          field: `strategy.${handKey}.action`,
          message: "action must be SHOVE, FOLD, or MIXED"
        });
      }
    }

    validateNumericRangeField(rowNumber, entry, "frequency", `strategy.${handKey}.frequency`, 0, 1, issues, rowHasError);
    validateNumericRangeField(
      rowNumber,
      entry,
      "shoveFrequency",
      `strategy.${handKey}.shoveFrequency`,
      0,
      1,
      issues,
      rowHasError
    );
    validateNumericField(rowNumber, entry, "evPush", `strategy.${handKey}.evPush`, issues, rowHasError);
    validateNumericField(rowNumber, entry, "evFold", `strategy.${handKey}.evFold`, issues, rowHasError);
    validateNumericField(rowNumber, entry, "equityWhenCalled", `strategy.${handKey}.equityWhenCalled`, issues, rowHasError);
  }
}

function validateEvSummaryForImport(
  rowNumber: number,
  rawEvSummary: unknown,
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>
): void {
  if (rawEvSummary === null || rawEvSummary === undefined) {
    return;
  }
  if (!rawEvSummary || typeof rawEvSummary !== "object" || Array.isArray(rawEvSummary)) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "INVALID_EV_SUMMARY",
      field: "evSummary",
      message: "evSummary must be an object"
    });
    return;
  }
  const evSummary = rawEvSummary as Record<string, unknown>;
  validateNumericField(rowNumber, evSummary, "shoveEv", "evSummary.shoveEv", issues, rowHasError);
  validateNumericField(rowNumber, evSummary, "foldEv", "evSummary.foldEv", issues, rowHasError);
  validateNumericField(rowNumber, evSummary, "deltaEv", "evSummary.deltaEv", issues, rowHasError);
}

function validateNumericField(
  rowNumber: number,
  source: Record<string, unknown>,
  key: string,
  field: string,
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>
): void {
  const value = source[key];
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "INVALID_NUMERIC_VALUE",
      field,
      message: `${field} must be numeric when provided`
    });
  }
}

function validateNumericRangeField(
  rowNumber: number,
  source: Record<string, unknown>,
  key: string,
  field: string,
  min: number,
  max: number,
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>
): void {
  const value = source[key];
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    pushIssue(issues, rowHasError, {
      rowNumber,
      severity: "error",
      code: "INVALID_FREQUENCY_RANGE",
      field,
      message: `${field} must be between ${min} and ${max}`
    });
  }
}

function pushIssue(
  issues: ImportValidationIssue[],
  rowHasError: Map<number, boolean>,
  issue: ImportValidationIssue
): void {
  issues.push(issue);
  if (issue.severity === "error" && issue.rowNumber !== null) {
    rowHasError.set(issue.rowNumber, true);
  }
}

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function readReportFile<TSummary>(
  fileName: string,
  parser: (value: unknown) => TSummary,
  generatedAtKey: string
): LatestReportEnvelope<TSummary> {
  const resolvedPath = resolveArtifactPath(fileName);
  if (!resolvedPath) {
    return {
      status: "missing",
      fileName,
      generatedAt: null,
      summary: null,
      error: null
    };
  }

  try {
    const raw = JSON.parse(readFileSync(resolvedPath, "utf-8")) as unknown;
    const generatedAt = readOptionalString(toRecord(raw)?.[generatedAtKey]) ?? null;
    return {
      status: "available",
      fileName,
      generatedAt,
      summary: parser(raw),
      error: null
    };
  } catch (error) {
    return {
      status: "invalid",
      fileName,
      generatedAt: null,
      summary: null,
      error: error instanceof Error ? error.message : "invalid report json"
    };
  }
}

function parseImportReportSummary(value: unknown): ImportReportSummary {
  const record = toRecord(value);
  const skippedDetails = readSkippedDetails(record?.skippedFiles);
  const discardedHrczList = readStringArray(record?.discardedHrczFiles);
  const warnings = readStringArray(record?.warnings);
  return {
    importedFiles: readOptionalNumber(record?.importedFiles),
    skippedFiles: readOptionalNumber(record?.skippedFiles) ?? skippedDetails.length,
    discardedHrczFiles: readOptionalNumber(record?.discardedHrczFiles) ?? discardedHrczList.length,
    importedRecords: readOptionalNumber(record?.importedRecords),
    failedRecords: readOptionalNumber(record?.failedRecords) ?? readOptionalNumber(record?.failedFiles),
    warnings,
    skippedDetails,
    discardedHrczList
  };
}

function parseVerificationReportSummary(value: unknown): VerificationReportSummary {
  const record = toRecord(value);
  const allExact = toRecord(record?.allExact);
  const randomLookup = toRecord(record?.randomLookup);
  const counts = toRecord(record?.counts);
  const nearResults = Array.isArray(record?.nearResults) ? record.nearResults : [];
  const nearMatchFalsePositives = nearResults
    .map((item) => toRecord(item))
    .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && candidate.forbiddenHrcHit === true))
    .map((candidate) => ({
      id: readOptionalNumber(candidate.id),
      mutation: readOptionalString(candidate.mutation),
      source: readOptionalString(candidate.source),
      status: readOptionalNumber(candidate.status)
    }));
  const nearMatchFalsePositiveCount = nearMatchFalsePositives.length;
  const exactSuccess = readOptionalNumber(allExact?.success);
  const exactTotal = readOptionalNumber(allExact?.total);
  const randomSuccess = readOptionalNumber(randomLookup?.success);
  const randomTotal = readOptionalNumber(randomLookup?.total);
  const duplicateCanonicalKeyDetails = readDuplicateCanonicalKeyDetails(record?.duplicateCanonicalKeys);
  return {
    exactLookup: {
      success: exactSuccess,
      total: exactTotal,
      successRatePct: calculateRatePercent(exactSuccess, exactTotal),
      failures: readFailureList(allExact?.failures)
    },
    randomLookup: {
      success: randomSuccess,
      total: randomTotal,
      successRatePct: calculateRatePercent(randomSuccess, randomTotal),
      failures: readFailureList(randomLookup?.failures)
    },
    duplicateCanonicalKeyCount: readOptionalNumber(counts?.duplicateCanonicalKeyCount),
    nearMatchFalsePositiveCount,
    duplicateCanonicalKeyDetails,
    nearMatchFalsePositives
  };
}

function parseCanonicalKeyReportSummary(value: unknown): CanonicalKeyReportSummary {
  const record = toRecord(value);
  return {
    mismatchCount: readOptionalNumber(record?.mismatchCount),
    updatedCount: readOptionalNumber(record?.updatesApplied),
    collisionCount: readOptionalNumber(record?.collisionCount),
    invalidCount: readOptionalNumber(record?.invalidSpotCount)
  };
}

function resolveArtifactPath(fileName: string): string | null {
  const seen = new Set<string>();
  const candidates: string[] = [];
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.resolve(current, "artifacts", fileName);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function calculateRatePercent(success: number | null, total: number | null): number | null {
  if (typeof success !== "number" || typeof total !== "number" || total <= 0) {
    return null;
  }
  return Math.round((success / total) * 10000) / 100;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readSkippedDetails(value: unknown): Array<{ fileName: string; reason: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const details: Array<{ fileName: string; reason: string }> = [];
  for (const item of value) {
    const record = toRecord(item);
    if (!record) {
      continue;
    }
    const fileName = readOptionalString(record.fileName) ?? "unknown";
    const reason = readOptionalString(record.reason) ?? "unknown";
    details.push({ fileName, reason });
  }
  return details;
}

function readFailureList(value: unknown): Array<{ id: number | null; reason: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const failures: Array<{ id: number | null; reason: string }> = [];
  for (const item of value) {
    if (typeof item === "string") {
      failures.push({ id: null, reason: item });
      continue;
    }
    const record = toRecord(item);
    if (!record) {
      continue;
    }
    const id = readOptionalNumber(record.id);
    const reason =
      readOptionalString(record.reason) ??
      readOptionalString(record.message) ??
      readOptionalString(record.error) ??
      JSON.stringify(record);
    failures.push({ id, reason });
  }
  return failures;
}

function readDuplicateCanonicalKeyDetails(value: unknown): Array<{ canonicalKey: string; count: number | null }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const details: Array<{ canonicalKey: string; count: number | null }> = [];
  for (const item of value) {
    const record = toRecord(item);
    if (!record) {
      continue;
    }
    const canonicalKey = readOptionalString(record.canonicalKey) ?? readOptionalString(record.key);
    if (!canonicalKey) {
      continue;
    }
    details.push({
      canonicalKey,
      count: readOptionalNumber(record.count)
    });
  }
  return details;
}

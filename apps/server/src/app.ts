import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  RESULT_SOURCES,
  canonicalSpotKey,
  evaluateFallbackIcm,
  classifyHrcDatabaseFile,
  parseHrcImport,
  type AnalyzeRequest,
  type AnalyzeResult,
  type HrcImportPayload
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
  };
  randomLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
  };
  duplicateCanonicalKeyCount: number | null;
  nearMatchFalsePositiveCount: number | null;
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
  const nearMatchFalsePositiveCount = nearResults.reduce((count, item) => {
    const candidate = toRecord(item);
    return candidate?.forbiddenHrcHit === true ? count + 1 : count;
  }, 0);
  const exactSuccess = readOptionalNumber(allExact?.success);
  const exactTotal = readOptionalNumber(allExact?.total);
  const randomSuccess = readOptionalNumber(randomLookup?.success);
  const randomTotal = readOptionalNumber(randomLookup?.total);
  return {
    exactLookup: {
      success: exactSuccess,
      total: exactTotal,
      successRatePct: calculateRatePercent(exactSuccess, exactTotal)
    },
    randomLookup: {
      success: randomSuccess,
      total: randomTotal,
      successRatePct: calculateRatePercent(randomSuccess, randomTotal)
    },
    duplicateCanonicalKeyCount: readOptionalNumber(counts?.duplicateCanonicalKeyCount),
    nearMatchFalsePositiveCount
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

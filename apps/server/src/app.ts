import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import cors from "cors";
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
      databaseFeatures: solution.databaseFeatures
    }));
    res.json({ solutions });
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

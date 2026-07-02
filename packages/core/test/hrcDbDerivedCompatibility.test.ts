import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildHrcDbDerivedCompatibilityReport } from "./helpers/hrcDbDerivedCompatibility.js";

const dbPath = join("..", "..", "apps", "server", "data", "poker-tournament-lab.db");
const artifactsRoot = join("..", "..", "artifacts");

describe("HRC DB-derived compatibility report", () => {
  it("opens the existing SQLite DB read-only or reports not_found", () => {
    const report = buildHrcDbDerivedCompatibilityReport(dbPath, artifactsRoot);

    if (!existsSync(dbPath)) {
      expect(report.status).toBe("not_found");
      expect(report.dbFileDetected).toBe(false);
      return;
    }

    expect(report.status).toBe("available");
    expect(report.dbFileDetected).toBe(true);
    expect(report.rawExportCompatibilityStatus).toBe("pending_raw_export_required");
  });

  it("reports imports and solutions schema without raw or blob payload storage", () => {
    const report = buildHrcDbDerivedCompatibilityReport(dbPath, artifactsRoot);
    if (report.status === "not_found") {
      return;
    }

    expect(report.tables.map((table) => table.name)).toEqual(["imports", "solutions"]);
    expect(report.tables.find((table) => table.name === "imports")?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["id", "name", "format", "file_name", "file_hash", "row_count", "metadata_json", "created_at"])
    );
    expect(report.tables.find((table) => table.name === "solutions")?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["id", "import_id", "canonical_key", "spot_json", "strategy_json", "ev_summary_json", "source_label"])
    );
    expect(report.blobColumns).toHaveLength(0);
    expect(report.rawPayloadColumns).toHaveLength(0);
  });

  it("captures current DB-derived HRC candidate coverage", () => {
    const report = buildHrcDbDerivedCompatibilityReport(dbPath, artifactsRoot);
    if (report.status === "not_found") {
      return;
    }

    expect(report.imports.count).toBe(684);
    expect(report.solutions.count).toBe(262);
    expect(report.solutions.literalHrcPrecomputedSourceLabelCount).toBe(0);
    expect(report.hrcDerivedCandidates.count).toBe(262);
    expect(report.hrcDerivedCandidates.criteria).toContain("solutions rows join imports by import_id");
    expect(report.imports.fileNameCount).toBe(684);
    expect(report.imports.fileHashCount).toBe(684);
    expect(report.imports.metadataJsonCount).toBe(683);
  });

  it("summarizes normalized legacy strategy shape and JSON coverage", () => {
    const report = buildHrcDbDerivedCompatibilityReport(dbPath, artifactsRoot);
    if (report.status === "not_found") {
      return;
    }

    expect(report.strategyShape.legacyHandMapCount).toBe(262);
    expect(report.strategyShape.v2ActionsArrayCount).toBe(0);
    expect(report.strategyShape.malformedCount).toBe(0);
    expect(report.strategyShape.allRowsHave169Hands).toBe(true);
    expect(report.strategyShape.minHandCount).toBe(169);
    expect(report.strategyShape.maxHandCount).toBe(169);
    expect(report.jsonCoverage.spotKeys).toEqual(
      expect.arrayContaining(["actionPath", "blinds", "decisionType", "heroPosition", "players", "tableSize"])
    );
    expect(report.jsonCoverage.metadataKeys).toEqual(
      expect.arrayContaining(["actionTags", "calculationModel", "exportShape", "fileName", "spotFamily", "streetScope"])
    );
  });

  it("keeps canonical key and action tree metadata coverage visible", () => {
    const report = buildHrcDbDerivedCompatibilityReport(dbPath, artifactsRoot);
    if (report.status === "not_found") {
      return;
    }

    expect(report.canonicalKeys.presentCount).toBe(262);
    expect(report.canonicalKeys.duplicateCount).toBe(0);
    expect(report.actionTree.metadataSpotFamilyDistribution.length).toBeGreaterThan(0);
    expect(report.actionTree.metadataCalculationModelDistribution).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "ChipEV" })])
    );
    expect(report.actionTree.metadataExportShapeDistribution).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: "complete_export" })])
    );
    expect(report.actionTree.actionTags.length).toBeGreaterThan(0);
    expect(report.actionTree.availableActionsExtractable).toBe(true);
    expect(report.actionTree.availableSizesExtractable).toBe(true);
  });

  it("cross-checks latest reports against the DB-derived compatibility baseline", () => {
    const report = buildHrcDbDerivedCompatibilityReport(dbPath, artifactsRoot);
    if (report.status === "not_found") {
      return;
    }

    expect(report.artifacts.importReport.exists).toBe(true);
    expect(report.artifacts.importReport.targetPathPresent).toBe(true);
    expect(report.artifacts.importReport.fileResultsCount).toBeGreaterThan(0);
    expect(report.artifacts.importReport.importedFileNamesInDbCount).toBeGreaterThan(0);
    expect(report.artifacts.importReport.rawPayloadReferenceFound).toBe(false);
    expect(report.artifacts.verificationReport.exists).toBe(true);
    expect(report.artifacts.verificationReport.exactLookupTotal).toBe(262);
    expect(report.artifacts.verificationReport.exactLookupSuccess).toBe(262);
    expect(report.artifacts.verificationReport.randomLookupTotal).toBe(20);
    expect(report.artifacts.verificationReport.randomLookupSuccess).toBe(20);
    expect(report.artifacts.verificationReport.duplicateCanonicalKeyCount).toBe(0);
    expect(report.artifacts.verificationReport.nearMatchHrcFalsePositiveCount).toBe(0);
    expect(report.artifacts.canonicalKeyReport.exists).toBe(true);
    expect(report.artifacts.canonicalKeyReport.totalSolutions).toBe(262);
    expect(report.artifacts.canonicalKeyReport.collisionCount).toBe(0);
  });
});


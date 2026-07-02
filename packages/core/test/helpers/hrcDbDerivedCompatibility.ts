import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export type HrcDbDerivedCompatibilityStatus = "available" | "not_found";
export type RawHrcExportCompatibilityStatus = "pending_raw_export_required";

export interface HrcDbDerivedCompatibilityReport {
  status: HrcDbDerivedCompatibilityStatus;
  rawExportCompatibilityStatus: RawHrcExportCompatibilityStatus;
  dbPath: string;
  dbFileDetected: boolean;
  tables: TableReport[];
  blobColumns: ColumnRef[];
  rawPayloadColumns: ColumnRef[];
  imports: ImportReport;
  solutions: SolutionReport;
  hrcDerivedCandidates: HrcDerivedCandidateReport;
  strategyShape: StrategyShapeReport;
  jsonCoverage: JsonCoverageReport;
  canonicalKeys: CanonicalKeyReport;
  actionTree: ActionTreeReport;
  artifacts: ArtifactsReport;
}

export interface TableReport {
  name: string;
  schema: string;
  columns: ColumnReport[];
  rowCount: number;
}

export interface ColumnReport {
  name: string;
  type: string;
  notNull: boolean;
  primaryKeyPosition: number;
}

export interface ColumnRef {
  table: string;
  column: string;
  type: string;
}

export interface ImportReport {
  count: number;
  fileNameCount: number;
  fileHashCount: number;
  metadataJsonCount: number;
  metadataKeys: string[];
  fileNameSamples: string[];
}

export interface SolutionReport {
  count: number;
  literalHrcPrecomputedSourceLabelCount: number;
  sourceLabelDistribution: ValueCount[];
  externalIdCount: number;
  evSummaryJsonCount: number;
}

export interface HrcDerivedCandidateReport {
  count: number;
  criteria: string[];
  fileNameSamples: string[];
}

export interface StrategyShapeReport {
  legacyHandMapCount: number;
  v2ActionsArrayCount: number;
  objectWithoutActionsCount: number;
  malformedCount: number;
  allRowsHave169Hands: boolean;
  minHandCount: number;
  maxHandCount: number;
}

export interface JsonCoverageReport {
  spotKeys: string[];
  evSummaryKeys: string[];
  metadataKeys: string[];
}

export interface CanonicalKeyReport {
  presentCount: number;
  duplicateCount: number;
  maxDuplicateGroupSize: number;
}

export interface ActionTreeReport {
  metadataSpotFamilyDistribution: ValueCount[];
  metadataCalculationModelDistribution: ValueCount[];
  metadataExportShapeDistribution: ValueCount[];
  actionTags: string[];
  unknownSpotFamilyCount: number;
  warningsMetadataCount: number;
  availableActionsExtractable: boolean;
  availableSizesExtractable: boolean;
}

export interface ArtifactsReport {
  importReport: ImportArtifactReport;
  verificationReport: VerificationArtifactReport;
  canonicalKeyReport: CanonicalArtifactReport;
}

export interface ImportArtifactReport {
  exists: boolean;
  targetPathPresent: boolean;
  fileResultsCount: number;
  importedFileNamesInDbCount: number;
  discardedHrczFilesCount: number;
  rawPayloadReferenceFound: boolean;
}

export interface VerificationArtifactReport {
  exists: boolean;
  exactLookupTotal: number | null;
  exactLookupSuccess: number | null;
  randomLookupTotal: number | null;
  randomLookupSuccess: number | null;
  duplicateCanonicalKeyCount: number | null;
  nearMatchHrcFalsePositiveCount: number | null;
}

export interface CanonicalArtifactReport {
  exists: boolean;
  totalSolutions: number | null;
  collisionCount: number | null;
  invalidSpotCount: number | null;
}

export interface ValueCount {
  value: string;
  count: number;
}

interface JoinedSolutionRow {
  id: number;
  import_id: number;
  canonical_key: string;
  spot_json: string;
  strategy_json: string;
  ev_summary_json: string | null;
  source_label: string;
  external_id: string | null;
  file_name: string | null;
  file_hash: string;
  metadata_json: string | null;
}

interface ImportRow {
  id: number;
  file_name: string | null;
  file_hash: string;
  metadata_json: string | null;
}

interface SqliteTableRow {
  name: string;
  sql: string;
}

interface SqliteColumnRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

const HRC_DERIVED_CRITERIA = [
  "imports.file_name contains .zip, hrc, export, rfi, chipev, bba, or depth",
  "imports.metadata_json contains fileName",
  "imports.metadata_json contains exportShape",
  "imports.metadata_json contains calculationModel",
  "imports.metadata_json contains spotFamily",
  "solutions rows join imports by import_id"
];

export function buildHrcDbDerivedCompatibilityReport(dbPath: string, artifactsRoot: string): HrcDbDerivedCompatibilityReport {
  if (!existsSync(dbPath)) {
    return emptyReport(dbPath);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON");
    const tables = readTables(db);
    const imports = queryAll<ImportRow>(db, "SELECT id, file_name, file_hash, metadata_json FROM imports ORDER BY id");
    const solutions = queryAll<JoinedSolutionRow>(
      db,
      `SELECT s.id, s.import_id, s.canonical_key, s.spot_json, s.strategy_json, s.ev_summary_json, s.source_label, s.external_id,
              i.file_name, i.file_hash, i.metadata_json
         FROM solutions s
         JOIN imports i ON i.id = s.import_id
        ORDER BY s.id`
    );
    const blobColumns = findColumns(tables, (column) => /BLOB/i.test(column.type) || /blob/i.test(column.name));
    const rawPayloadColumns = findColumns(tables, (column) => /raw|payload|original|blob/i.test(column.name));
    const hrcCandidates = solutions.filter(isHrcDerivedCandidate);

    return {
      status: "available",
      rawExportCompatibilityStatus: "pending_raw_export_required",
      dbPath,
      dbFileDetected: true,
      tables,
      blobColumns,
      rawPayloadColumns,
      imports: buildImportReport(imports),
      solutions: buildSolutionReport(solutions),
      hrcDerivedCandidates: {
        count: hrcCandidates.length,
        criteria: HRC_DERIVED_CRITERIA,
        fileNameSamples: uniqueStrings(hrcCandidates.map((row) => row.file_name).filter(isNonEmptyString)).slice(0, 12)
      },
      strategyShape: buildStrategyShapeReport(hrcCandidates),
      jsonCoverage: buildJsonCoverageReport(hrcCandidates),
      canonicalKeys: buildCanonicalKeyReport(solutions),
      actionTree: buildActionTreeReport(hrcCandidates),
      artifacts: buildArtifactsReport(artifactsRoot, imports)
    };
  } finally {
    db.close();
  }
}

function emptyReport(dbPath: string): HrcDbDerivedCompatibilityReport {
  return {
    status: "not_found",
    rawExportCompatibilityStatus: "pending_raw_export_required",
    dbPath,
    dbFileDetected: false,
    tables: [],
    blobColumns: [],
    rawPayloadColumns: [],
    imports: {
      count: 0,
      fileNameCount: 0,
      fileHashCount: 0,
      metadataJsonCount: 0,
      metadataKeys: [],
      fileNameSamples: []
    },
    solutions: {
      count: 0,
      literalHrcPrecomputedSourceLabelCount: 0,
      sourceLabelDistribution: [],
      externalIdCount: 0,
      evSummaryJsonCount: 0
    },
    hrcDerivedCandidates: {
      count: 0,
      criteria: HRC_DERIVED_CRITERIA,
      fileNameSamples: []
    },
    strategyShape: {
      legacyHandMapCount: 0,
      v2ActionsArrayCount: 0,
      objectWithoutActionsCount: 0,
      malformedCount: 0,
      allRowsHave169Hands: false,
      minHandCount: 0,
      maxHandCount: 0
    },
    jsonCoverage: {
      spotKeys: [],
      evSummaryKeys: [],
      metadataKeys: []
    },
    canonicalKeys: {
      presentCount: 0,
      duplicateCount: 0,
      maxDuplicateGroupSize: 0
    },
    actionTree: {
      metadataSpotFamilyDistribution: [],
      metadataCalculationModelDistribution: [],
      metadataExportShapeDistribution: [],
      actionTags: [],
      unknownSpotFamilyCount: 0,
      warningsMetadataCount: 0,
      availableActionsExtractable: false,
      availableSizesExtractable: false
    },
    artifacts: {
      importReport: {
        exists: false,
        targetPathPresent: false,
        fileResultsCount: 0,
        importedFileNamesInDbCount: 0,
        discardedHrczFilesCount: 0,
        rawPayloadReferenceFound: false
      },
      verificationReport: {
        exists: false,
        exactLookupTotal: null,
        exactLookupSuccess: null,
        randomLookupTotal: null,
        randomLookupSuccess: null,
        duplicateCanonicalKeyCount: null,
        nearMatchHrcFalsePositiveCount: null
      },
      canonicalKeyReport: {
        exists: false,
        totalSolutions: null,
        collisionCount: null,
        invalidSpotCount: null
      }
    }
  };
}

function readTables(db: DatabaseSync): TableReport[] {
  const tableRows = queryAll<SqliteTableRow>(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return tableRows.map((table) => {
    const columns = queryAll<SqliteColumnRow>(db, `PRAGMA table_info(${table.name})`);
    const row = queryOne<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${table.name}`);
    return {
      name: table.name,
      schema: table.sql,
      columns: columns.map((column) => ({
        name: column.name,
        type: column.type,
        notNull: column.notnull === 1,
        primaryKeyPosition: column.pk
      })),
      rowCount: row?.count ?? 0
    };
  });
}

function buildImportReport(imports: ImportRow[]): ImportReport {
  return {
    count: imports.length,
    fileNameCount: imports.filter((row) => isNonEmptyString(row.file_name)).length,
    fileHashCount: imports.filter((row) => isNonEmptyString(row.file_hash)).length,
    metadataJsonCount: imports.filter((row) => isNonEmptyString(row.metadata_json)).length,
    metadataKeys: collectJsonKeys(imports.map((row) => row.metadata_json)),
    fileNameSamples: uniqueStrings(imports.map((row) => row.file_name).filter(isNonEmptyString)).slice(0, 12)
  };
}

function buildSolutionReport(solutions: JoinedSolutionRow[]): SolutionReport {
  return {
    count: solutions.length,
    literalHrcPrecomputedSourceLabelCount: solutions.filter((row) => row.source_label === "HRC_PRECOMPUTED_DB").length,
    sourceLabelDistribution: distribution(solutions.map((row) => row.source_label), 20),
    externalIdCount: solutions.filter((row) => isNonEmptyString(row.external_id)).length,
    evSummaryJsonCount: solutions.filter((row) => isNonEmptyString(row.ev_summary_json)).length
  };
}

function buildStrategyShapeReport(rows: JoinedSolutionRow[]): StrategyShapeReport {
  let legacyHandMapCount = 0;
  let v2ActionsArrayCount = 0;
  let objectWithoutActionsCount = 0;
  let malformedCount = 0;
  const handCounts: number[] = [];

  for (const row of rows) {
    const parsed = parseJson(row.strategy_json);
    if (!isPlainObject(parsed)) {
      malformedCount += 1;
      continue;
    }
    const shape = analyzeStrategyShape(parsed);
    handCounts.push(shape.handCount);
    if (shape.shape === "hand-actions-array") {
      v2ActionsArrayCount += 1;
    } else if (shape.shape === "legacy-hand-map") {
      legacyHandMapCount += 1;
    } else {
      objectWithoutActionsCount += 1;
    }
  }

  return {
    legacyHandMapCount,
    v2ActionsArrayCount,
    objectWithoutActionsCount,
    malformedCount,
    allRowsHave169Hands: handCounts.length > 0 && handCounts.every((count) => count === 169),
    minHandCount: handCounts.length > 0 ? Math.min(...handCounts) : 0,
    maxHandCount: handCounts.length > 0 ? Math.max(...handCounts) : 0
  };
}

function buildJsonCoverageReport(rows: JoinedSolutionRow[]): JsonCoverageReport {
  return {
    spotKeys: collectJsonKeys(rows.map((row) => row.spot_json)),
    evSummaryKeys: collectJsonKeys(rows.map((row) => row.ev_summary_json)),
    metadataKeys: collectJsonKeys(rows.map((row) => row.metadata_json))
  };
}

function buildCanonicalKeyReport(solutions: JoinedSolutionRow[]): CanonicalKeyReport {
  const counts = new Map<string, number>();
  for (const row of solutions) {
    if (isNonEmptyString(row.canonical_key)) {
      counts.set(row.canonical_key, (counts.get(row.canonical_key) ?? 0) + 1);
    }
  }
  const duplicateGroups = Array.from(counts.values()).filter((count) => count > 1);
  return {
    presentCount: Array.from(counts.values()).reduce((sum, count) => sum + count, 0),
    duplicateCount: duplicateGroups.length,
    maxDuplicateGroupSize: duplicateGroups.length > 0 ? Math.max(...duplicateGroups) : 0
  };
}

function buildActionTreeReport(rows: JoinedSolutionRow[]): ActionTreeReport {
  const metadataObjects = rows.map((row) => parseJson(row.metadata_json)).filter(isPlainObject);
  const actionTags = new Set<string>();
  let warningsMetadataCount = 0;

  for (const metadata of metadataObjects) {
    if (Array.isArray(metadata.actionTags)) {
      for (const tag of metadata.actionTags) {
        if (isNonEmptyString(tag)) {
          actionTags.add(tag);
        }
      }
    }
    if (Array.isArray(metadata.warnings) && metadata.warnings.length > 0) {
      warningsMetadataCount += 1;
    }
  }

  return {
    metadataSpotFamilyDistribution: distribution(metadataObjects.map((metadata) => readString(metadata.spotFamily) ?? "Unknown"), 20),
    metadataCalculationModelDistribution: distribution(metadataObjects.map((metadata) => readString(metadata.calculationModel) ?? "Unknown"), 20),
    metadataExportShapeDistribution: distribution(metadataObjects.map((metadata) => readString(metadata.exportShape) ?? "Unknown"), 20),
    actionTags: Array.from(actionTags).sort(),
    unknownSpotFamilyCount: metadataObjects.filter((metadata) => readString(metadata.spotFamily) === "Unknown").length,
    warningsMetadataCount,
    availableActionsExtractable: actionTags.size > 0,
    availableSizesExtractable: metadataObjects.some((metadata) => typeof metadata.stackDepthBb === "number" || /\\d+(?:\\.\\d+)?bb/i.test(String(metadata.fileName ?? "")))
  };
}

function buildArtifactsReport(artifactsRoot: string, imports: ImportRow[]): ArtifactsReport {
  return {
    importReport: buildImportArtifactReport(`${artifactsRoot}/latest-import-report.json`, imports),
    verificationReport: buildVerificationArtifactReport(`${artifactsRoot}/latest-verification-report.json`),
    canonicalKeyReport: buildCanonicalArtifactReport(`${artifactsRoot}/latest-canonical-key-report.json`)
  };
}

function buildImportArtifactReport(path: string, imports: ImportRow[]): ImportArtifactReport {
  const report = readJsonFile(path);
  if (!isPlainObject(report)) {
    return {
      exists: false,
      targetPathPresent: false,
      fileResultsCount: 0,
      importedFileNamesInDbCount: 0,
      discardedHrczFilesCount: 0,
      rawPayloadReferenceFound: false
    };
  }

  const dbFileNames = new Set(imports.map((row) => row.file_name).filter(isNonEmptyString));
  const fileResults = Array.isArray(report.fileResults) ? report.fileResults.filter(isPlainObject) : [];
  const fileNames = fileResults.map((entry) => entry.fileName).filter(isNonEmptyString);
  const rawText = JSON.stringify(report);
  return {
    exists: true,
    targetPathPresent: isNonEmptyString(report.targetPath),
    fileResultsCount: fileResults.length,
    importedFileNamesInDbCount: fileNames.filter((fileName) => dbFileNames.has(fileName)).length,
    discardedHrczFilesCount: Array.isArray(report.discardedHrczFiles) ? report.discardedHrczFiles.length : 0,
    rawPayloadReferenceFound: /payload|raw|original/i.test(rawText)
  };
}

function buildVerificationArtifactReport(path: string): VerificationArtifactReport {
  const report = readJsonFile(path);
  if (!isPlainObject(report)) {
    return {
      exists: false,
      exactLookupTotal: null,
      exactLookupSuccess: null,
      randomLookupTotal: null,
      randomLookupSuccess: null,
      duplicateCanonicalKeyCount: null,
      nearMatchHrcFalsePositiveCount: null
    };
  }

  const nearResults = Array.isArray(report.nearResults) ? report.nearResults.filter(isPlainObject) : [];
  return {
    exists: true,
    exactLookupTotal: readNumber(isPlainObject(report.allExact) ? report.allExact.total : null),
    exactLookupSuccess: readNumber(isPlainObject(report.allExact) ? report.allExact.success : null),
    randomLookupTotal: readNumber(isPlainObject(report.randomLookup) ? report.randomLookup.total : null),
    randomLookupSuccess: readNumber(isPlainObject(report.randomLookup) ? report.randomLookup.success : null),
    duplicateCanonicalKeyCount: readNumber(isPlainObject(report.counts) ? report.counts.duplicateCanonicalKeyCount : null),
    nearMatchHrcFalsePositiveCount: nearResults.filter((item) => item.source === "HRC_PRECOMPUTED_DB").length
  };
}

function buildCanonicalArtifactReport(path: string): CanonicalArtifactReport {
  const report = readJsonFile(path);
  if (!isPlainObject(report)) {
    return {
      exists: false,
      totalSolutions: null,
      collisionCount: null,
      invalidSpotCount: null
    };
  }

  return {
    exists: true,
    totalSolutions: readNumber(report.totalSolutions),
    collisionCount: readNumber(report.collisionCount),
    invalidSpotCount: readNumber(report.invalidSpotCount)
  };
}

function isHrcDerivedCandidate(row: JoinedSolutionRow): boolean {
  const metadata = parseJson(row.metadata_json);
  const fileName = String(row.file_name ?? "");
  return (
    /\\.zip$|hrc|export|rfi|chipev|bba|depth/i.test(fileName) ||
    (isPlainObject(metadata) &&
      (isNonEmptyString(metadata.fileName) ||
        isNonEmptyString(metadata.exportShape) ||
        isNonEmptyString(metadata.calculationModel) ||
        isNonEmptyString(metadata.spotFamily)))
  );
}

function analyzeStrategyShape(strategy: Record<string, unknown>): { shape: "hand-actions-array" | "legacy-hand-map" | "object-without-actions"; handCount: number } {
  const hands = Object.values(strategy);
  const hasActionsArray = hands.some((hand) => isPlainObject(hand) && Array.isArray(hand.actions));
  const hasLegacy = hands.some((hand) => isPlainObject(hand) && ("action" in hand || "frequency" in hand || "ev" in hand));
  return {
    shape: hasActionsArray ? "hand-actions-array" : hasLegacy ? "legacy-hand-map" : "object-without-actions",
    handCount: hands.length
  };
}

function findColumns(tables: TableReport[], predicate: (column: ColumnReport) => boolean): ColumnRef[] {
  return tables.flatMap((table) =>
    table.columns.filter(predicate).map((column) => ({
      table: table.name,
      column: column.name,
      type: column.type
    }))
  );
}

function collectJsonKeys(rawValues: Array<string | null>): string[] {
  const keys = new Set<string>();
  for (const raw of rawValues) {
    const parsed = parseJson(raw);
    if (isPlainObject(parsed)) {
      for (const key of Object.keys(parsed)) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys).sort();
}

function distribution(values: string[], limit: number): ValueCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function queryAll<T>(db: DatabaseSync, sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function queryOne<T>(db: DatabaseSync, sql: string): T | undefined {
  return db.prepare(sql).get() as T | undefined;
}

function parseJson(raw: unknown): unknown {
  if (!isNonEmptyString(raw)) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


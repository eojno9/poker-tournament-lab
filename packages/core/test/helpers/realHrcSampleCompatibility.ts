import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { isMultiActionImportV2Record, validateMultiActionImportV2Record } from "../../src/index.js";

export type RealHrcSampleReportStatus = "not_provided" | "detected";

export interface RealHrcSampleCompatibilityReport {
  status: RealHrcSampleReportStatus;
  sampleDirectory: string;
  sampleCount: number;
  message: string;
  samples: RealHrcSampleFileReport[];
}

export interface RealHrcSampleFileReport {
  fileDetected: boolean;
  fileName: string;
  relativePath: string;
  parseError: string | null;
  topLevelKeys: string[];
  hasSource: boolean;
  hasSourceMetadata: boolean;
  spotFields: string[];
  strategyShape: "missing" | "array" | "hand-actions-array" | "legacy-hand-map" | "object-without-actions";
  handCount: number;
  actionCount: number;
  hasActionsArrayShape: boolean;
  hasLegacyStrategyShape: boolean;
  missingRequiredFields: string[];
  unknownTopLevelFields: string[];
  validator: {
    attempted: boolean;
    isV2Record: boolean;
    valid: boolean;
    issueMessages: string[];
    warningMessages: string[];
  };
  sanitizeMetadata: {
    hasRealHrcSampleKind: boolean;
    hasSanitizedMarker: boolean;
    hasOriginalToolHrc: boolean;
    sampleKind: string | null;
    sanitized: boolean | null;
    originalTool: string | null;
    calculationModel: string | null;
    streetScope: string | null;
  };
}

const KNOWN_TOP_LEVEL_FIELDS = new Set([
  "schemaVersion",
  "strategySchemaVersion",
  "source",
  "sourceLabel",
  "sourceFile",
  "sampleKind",
  "sanitized",
  "originalTool",
  "streetScope",
  "calculationModel",
  "spot",
  "strategy",
  "sourceMetadata",
  "metadata",
  "records",
  "solutions"
]);

export function buildRealHrcSampleCompatibilityReport(sampleDirectory: string): RealHrcSampleCompatibilityReport {
  const files = findSanitizedJsonSampleFiles(sampleDirectory);
  if (files.length === 0) {
    return {
      status: "not_provided",
      sampleDirectory,
      sampleCount: 0,
      message: "real HRC sample fixture not provided",
      samples: []
    };
  }

  const samples = files.map((filePath) => buildFileReport(sampleDirectory, filePath));
  return {
    status: "detected",
    sampleDirectory,
    sampleCount: samples.length,
    message: "sanitized real HRC sample fixture detected",
    samples
  };
}

export function findSanitizedJsonSampleFiles(sampleDirectory: string): string[] {
  if (!existsSync(sampleDirectory)) {
    return [];
  }
  const files: string[] = [];
  walk(sampleDirectory, files);
  return files
    .filter((filePath) => filePath.toLowerCase().endsWith(".json"))
    .filter((filePath) => basename(filePath).toLowerCase() !== "package.json")
    .sort((left, right) => left.localeCompare(right));
}

function buildFileReport(sampleDirectory: string, filePath: string): RealHrcSampleFileReport {
  const relativePath = relative(sampleDirectory, filePath);
  const parsed = readJson(filePath);
  if (!parsed.ok) {
    return emptyFileReport(filePath, relativePath, parsed.error);
  }

  const record = isPlainObject(parsed.value) ? parsed.value : {};
  const topLevelKeys = Object.keys(record).sort();
  const spot = isPlainObject(record.spot) ? record.spot : {};
  const strategy = analyzeStrategyShape(record.strategy);
  const validator = validateMultiActionImportV2Record(record);
  const sourceMetadata = isPlainObject(record.sourceMetadata) ? record.sourceMetadata : {};
  const metadata = mergeMetadata(record, sourceMetadata);

  return {
    fileDetected: true,
    fileName: basename(filePath),
    relativePath,
    parseError: null,
    topLevelKeys,
    hasSource: typeof record.source === "string" || typeof sourceMetadata.source === "string",
    hasSourceMetadata: isPlainObject(record.sourceMetadata),
    spotFields: Object.keys(spot).sort(),
    strategyShape: strategy.shape,
    handCount: strategy.handCount,
    actionCount: strategy.actionCount,
    hasActionsArrayShape: strategy.hasActionsArrayShape,
    hasLegacyStrategyShape: strategy.hasLegacyStrategyShape,
    missingRequiredFields: missingRequiredFields(record),
    unknownTopLevelFields: topLevelKeys.filter((field) => !KNOWN_TOP_LEVEL_FIELDS.has(field)),
    validator: {
      attempted: true,
      isV2Record: isMultiActionImportV2Record(record),
      valid: validator.valid,
      issueMessages: validator.issues.map((issue) => `${issue.path}: ${issue.message}`),
      warningMessages: validator.warnings.map((warning) => `${warning.path}: ${warning.message}`)
    },
    sanitizeMetadata: {
      hasRealHrcSampleKind: readString(metadata.sampleKind) === "REAL_HRC_SAMPLE" || readString(metadata.sampleKind) === "HRC_SAMPLE",
      hasSanitizedMarker: metadata.sanitized === true,
      hasOriginalToolHrc: readString(metadata.originalTool)?.toUpperCase() === "HRC",
      sampleKind: readString(metadata.sampleKind),
      sanitized: typeof metadata.sanitized === "boolean" ? metadata.sanitized : null,
      originalTool: readString(metadata.originalTool),
      calculationModel: readString(metadata.calculationModel),
      streetScope: readString(metadata.streetScope)
    }
  };
}

function emptyFileReport(filePath: string, relativePath: string, parseError: string): RealHrcSampleFileReport {
  return {
    fileDetected: true,
    fileName: basename(filePath),
    relativePath,
    parseError,
    topLevelKeys: [],
    hasSource: false,
    hasSourceMetadata: false,
    spotFields: [],
    strategyShape: "missing",
    handCount: 0,
    actionCount: 0,
    hasActionsArrayShape: false,
    hasLegacyStrategyShape: false,
    missingRequiredFields: ["schemaVersion", "spot", "strategy"],
    unknownTopLevelFields: [],
    validator: {
      attempted: false,
      isV2Record: false,
      valid: false,
      issueMessages: [],
      warningMessages: []
    },
    sanitizeMetadata: {
      hasRealHrcSampleKind: false,
      hasSanitizedMarker: false,
      hasOriginalToolHrc: false,
      sampleKind: null,
      sanitized: null,
      originalTool: null,
      calculationModel: null,
      streetScope: null
    }
  };
}

function walk(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }
}

function readJson(filePath: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, "utf8")) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function analyzeStrategyShape(strategy: unknown): {
  shape: RealHrcSampleFileReport["strategyShape"];
  handCount: number;
  actionCount: number;
  hasActionsArrayShape: boolean;
  hasLegacyStrategyShape: boolean;
} {
  if (Array.isArray(strategy)) {
    return { shape: "array", handCount: strategy.length, actionCount: 0, hasActionsArrayShape: false, hasLegacyStrategyShape: false };
  }
  if (!isPlainObject(strategy)) {
    return { shape: "missing", handCount: 0, actionCount: 0, hasActionsArrayShape: false, hasLegacyStrategyShape: false };
  }

  const hands = Object.values(strategy);
  const actionCounts = hands.map((hand) => (isPlainObject(hand) && Array.isArray(hand.actions) ? hand.actions.length : 0));
  const hasActionsArrayShape = actionCounts.some((count) => count > 0);
  const hasLegacyStrategyShape = hands.some((hand) => isPlainObject(hand) && "action" in hand && !Array.isArray(hand.actions));
  const shape = hasActionsArrayShape ? "hand-actions-array" : hasLegacyStrategyShape ? "legacy-hand-map" : "object-without-actions";

  return {
    shape,
    handCount: hands.length,
    actionCount: actionCounts.reduce((sum, count) => sum + count, 0),
    hasActionsArrayShape,
    hasLegacyStrategyShape
  };
}

function missingRequiredFields(record: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!isMultiActionImportV2Record(record)) {
    missing.push("schemaVersion");
  }
  if (!("spot" in record)) {
    missing.push("spot");
  }
  if (!isPlainObject(record.strategy)) {
    missing.push("strategy");
  }
  return missing;
}

function mergeMetadata(record: Record<string, unknown>, sourceMetadata: Record<string, unknown>): Record<string, unknown> {
  return {
    ...sourceMetadata,
    sampleKind: record.sampleKind ?? sourceMetadata.sampleKind,
    sanitized: record.sanitized ?? sourceMetadata.sanitized,
    originalTool: record.originalTool ?? sourceMetadata.originalTool,
    calculationModel: record.calculationModel ?? sourceMetadata.calculationModel,
    streetScope: record.streetScope ?? sourceMetadata.streetScope
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


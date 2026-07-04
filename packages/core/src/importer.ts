import { canonicalSpotKey, normalizeSpot } from "./canonical.js";
import { normalizeStrategyMatrix } from "./hands.js";
import { assertHrcDatabaseCanContainSpot, classifyHrcDatabaseFile } from "./hrcCatalog.js";
import type { EvSummary, HrcImportPayload, ImportedSolutionRecord, SpotInput } from "./types.js";

export interface ParsedImport {
  records: ImportedSolutionRecord[];
  canonicalKeys: string[];
}

export function parseHrcImport(payload: HrcImportPayload): ParsedImport {
  const records = payload.format === "json" ? parseJson(payload.content) : parseCsvImport(payload.content);
  const normalized = records.map((record, index) => normalizeImportRecord(record, payload.sourceLabel, index));
  const features = payload.databaseFeatures ?? (payload.fileName ? classifyHrcDatabaseFile(payload.fileName) : null);
  if (features) {
    for (const record of normalized) {
      assertHrcDatabaseCanContainSpot(features, record.spot.street);
    }
  }
  return {
    records: normalized,
    canonicalKeys: normalized.map((record) => canonicalSpotKey(record.spot))
  };
}

function parseJson(content: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === "object") {
    const object = parsed as Record<string, unknown>;
    if (Array.isArray(object.records)) {
      return object.records;
    }
    if (Array.isArray(object.solutions)) {
      return object.solutions;
    }
  }

  throw new Error("JSON import must be an array or an object with records/solutions");
}

function parseCsvImport(content: string): unknown[] {
  const rows = parseCsv(content);
  if (rows.length < 2) {
    throw new Error("CSV import must include a header row and at least one data row");
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow!.map((header) => header.trim());

  return dataRows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row, index) => {
      const object: Record<string, string> = {};
      headers.forEach((header, columnIndex) => {
        object[header] = row[columnIndex] ?? "";
      });

      if (!object.spot_json) {
        throw new Error(`CSV row ${index + 2} is missing spot_json`);
      }
      if (!object.strategy_json) {
        throw new Error(`CSV row ${index + 2} is missing strategy_json`);
      }

      return {
        spot: parseJsonCell(object.spot_json, `row ${index + 2} spot_json`),
        strategy: parseJsonCell(object.strategy_json, `row ${index + 2} strategy_json`),
        evSummary: object.ev_summary_json ? parseJsonCell(object.ev_summary_json, `row ${index + 2} ev_summary_json`) : undefined,
        sourceLabel: object.source_label || undefined,
        externalId: object.external_id || undefined
      };
    });
}

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]!;
    const next = content[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== "") {
    rows.push(row);
  }

  return rows;
}

function normalizeImportRecord(raw: unknown, payloadSourceLabel: string | undefined, index: number): ImportedSolutionRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`record ${index + 1} must be an object`);
  }

  const object = raw as Record<string, unknown>;
  const spot = object.spot as SpotInput | undefined;
  if (!spot || typeof spot !== "object") {
    throw new Error(`record ${index + 1} is missing spot`);
  }
  if (!object.strategy) {
    throw new Error(`record ${index + 1} is missing strategy`);
  }

  const record: ImportedSolutionRecord = {
    spot: normalizeSpot(spot),
    strategy: normalizeStrategyMatrix(object.strategy)
  };
  if (object.evSummary) {
    record.evSummary = normalizeEvSummary(object.evSummary);
  }
  const sourceLabel = typeof object.sourceLabel === "string" ? object.sourceLabel : payloadSourceLabel;
  if (sourceLabel) {
    record.sourceLabel = sourceLabel;
  }
  if (typeof object.externalId === "string") {
    record.externalId = object.externalId;
  }
  return record;
}

function normalizeEvSummary(raw: unknown): EvSummary {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { unit: "unknown" };
  }
  const object = raw as Record<string, unknown>;
  const summary: EvSummary = {
    unit: object.unit === "prize" || object.unit === "chips" ? object.unit : "unknown"
  };
  if (typeof object.bestAction === "string") {
    const action = object.bestAction.toUpperCase();
    if (action === "SHOVE" || action === "FOLD" || action === "MIXED") {
      summary.bestAction = action;
    }
  }
  if (typeof object.shoveEv === "number") {
    summary.shoveEv = object.shoveEv;
  }
  if (typeof object.foldEv === "number") {
    summary.foldEv = object.foldEv;
  }
  if (typeof object.deltaEv === "number") {
    summary.deltaEv = object.deltaEv;
  }
  if (Array.isArray(object.notes)) {
    summary.notes = object.notes.filter((item): item is string => typeof item === "string");
  }
  return summary;
}

function parseJsonCell(content: string, label: string): unknown {
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`invalid JSON in ${label}: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}

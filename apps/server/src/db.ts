import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  canonicalSpotKey,
  classifyHrcDatabaseFile,
  type EvSummary,
  type HrcDatabaseFeatures,
  type ImportedSolutionRecord,
  type SpotInput,
  type StrategyMatrix
} from "@poker-tournament-lab/core";

export interface StoredSolution {
  id: number;
  importId: number;
  canonicalKey: string;
  spot: SpotInput;
  strategy: StrategyMatrix;
  evSummary: EvSummary | null;
  sourceLabel: string;
  externalId: string | null;
  importedAt: string;
  fileName: string | null;
  fileHash: string;
  databaseFeatures: HrcDatabaseFeatures | null;
}

export interface ImportSummary {
  id: number;
  name: string;
  format: "json" | "csv";
  fileName: string | null;
  fileHash: string;
  rowCount: number;
  createdAt: string;
  databaseFeatures: HrcDatabaseFeatures | null;
}

export interface StoreImportArgs {
  format: "json" | "csv";
  content: string;
  fileName?: string;
  sourceLabel?: string;
  databaseFeatures?: HrcDatabaseFeatures;
  records: ImportedSolutionRecord[];
}

export type CanonicalKeyReconcileOutcome = "MISMATCH" | "UPDATED" | "INVALID_SPOT_JSON" | "COLLISION";

export interface CanonicalKeyReconcileEntry {
  solutionId: number;
  storedCanonicalKey: string;
  recomputedCanonicalKey: string | null;
  heroPosition: string | null;
  actionPath: string[];
  outcome: CanonicalKeyReconcileOutcome;
  collisionWithSolutionId: number | null;
  parseError: string | null;
}

export interface CanonicalKeyReconcileReport {
  checkedAt: string;
  dryRun: boolean;
  applyRequested: boolean;
  blocked: boolean;
  blockReason: string | null;
  totalSolutions: number;
  mismatchCount: number;
  invalidSpotCount: number;
  collisionCount: number;
  updatesApplied: number;
  entries: CanonicalKeyReconcileEntry[];
}

export interface DbHealthCounts {
  totalSolutions: number;
  totalStrategyEntries: number;
  distinctCanonicalKeys: number;
  duplicateCanonicalKeyCount: number;
}

export class LabDatabase {
  private readonly db: DatabaseSync;

  constructor(path = defaultDbPath()) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  storeImport(args: StoreImportArgs): ImportSummary {
    const createdAt = new Date().toISOString();
    const fileHash = sha256(args.content);
    const sourceName = args.sourceLabel || args.fileName || `HRC import ${createdAt}`;
    const databaseFeatures = args.databaseFeatures ?? (args.fileName ? classifyHrcDatabaseFile(args.fileName) : null);
    const metadataJson = databaseFeatures ? JSON.stringify(databaseFeatures) : null;

    const transaction = this.db.createTagStore();
    const importResult = transaction.run`
      INSERT INTO imports (name, format, file_name, file_hash, row_count, metadata_json, created_at)
      VALUES (${sourceName}, ${args.format}, ${args.fileName ?? null}, ${fileHash}, ${args.records.length}, ${metadataJson}, ${createdAt})
    `;
    const importId = Number(importResult.lastInsertRowid);

    for (const record of args.records) {
      const canonicalKey = canonicalSpotKey(record.spot);
      transaction.run`
        INSERT INTO solutions (
          import_id,
          canonical_key,
          spot_json,
          strategy_json,
          ev_summary_json,
          source_label,
          external_id,
          created_at
        )
        VALUES (
          ${importId},
          ${canonicalKey},
          ${JSON.stringify(record.spot)},
          ${JSON.stringify(record.strategy)},
          ${record.evSummary ? JSON.stringify(record.evSummary) : null},
          ${record.sourceLabel ?? sourceName},
          ${record.externalId ?? null},
          ${createdAt}
        )
        ON CONFLICT(canonical_key) DO UPDATE SET
          import_id = excluded.import_id,
          spot_json = excluded.spot_json,
          strategy_json = excluded.strategy_json,
          ev_summary_json = excluded.ev_summary_json,
          source_label = excluded.source_label,
          external_id = excluded.external_id,
          created_at = excluded.created_at
      `;
    }

    return {
      id: importId,
      name: sourceName,
      format: args.format,
      fileName: args.fileName ?? null,
      fileHash,
      rowCount: args.records.length,
      createdAt,
      databaseFeatures
    };
  }

  findSolution(canonicalKey: string): StoredSolution | null {
    const row = this.db
      .prepare(
        `SELECT
          s.id,
          s.import_id,
          s.canonical_key,
          s.spot_json,
          s.strategy_json,
          s.ev_summary_json,
          s.source_label,
          s.external_id,
          s.created_at,
          i.file_name,
          i.file_hash,
          i.metadata_json
        FROM solutions s
        JOIN imports i ON i.id = s.import_id
        WHERE s.canonical_key = ?`
      )
      .get(canonicalKey) as SolutionRow | undefined;

    return row ? mapSolution(row) : null;
  }

  listSolutions(search = "", limit = 50): StoredSolution[] {
    const normalizedLimit = Math.max(1, Math.min(200, limit));
    const query = `%${search.trim()}%`;
    const rows = this.db
      .prepare(
        `SELECT
          s.id,
          s.import_id,
          s.canonical_key,
          s.spot_json,
          s.strategy_json,
          s.ev_summary_json,
          s.source_label,
          s.external_id,
          s.created_at,
          i.file_name,
          i.file_hash,
          i.metadata_json
        FROM solutions s
        JOIN imports i ON i.id = s.import_id
        WHERE ? = '%%'
          OR s.canonical_key LIKE ?
          OR s.source_label LIKE ?
          OR s.external_id LIKE ?
        ORDER BY s.id DESC
        LIMIT ?`
      )
      .all(query, query, query, query, normalizedLimit) as unknown as SolutionRow[];

    return rows.map(mapSolution);
  }

  listImports(): ImportSummary[] {
    const rows = this.db
      .prepare(
        `SELECT
          id,
          name,
          format,
          file_name,
          file_hash,
          row_count,
          metadata_json,
          created_at
        FROM imports
        ORDER BY id DESC`
      )
      .all() as unknown as ImportRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      format: row.format,
      fileName: row.file_name,
      fileHash: row.file_hash,
      rowCount: row.row_count,
      createdAt: row.created_at,
      databaseFeatures: parseFeatures(row.metadata_json)
    }));
  }

  getHealthCounts(): DbHealthCounts {
    const totalsRow = this.db
      .prepare(
        `SELECT
          COUNT(*) AS total_solutions,
          COUNT(DISTINCT canonical_key) AS distinct_canonical_keys
        FROM solutions`
      )
      .get() as { total_solutions: number; distinct_canonical_keys: number };

    const duplicateRow = this.db
      .prepare(
        `SELECT
          COALESCE(SUM(duplicate_count), 0) AS duplicate_canonical_key_count
        FROM (
          SELECT COUNT(*) - 1 AS duplicate_count
          FROM solutions
          GROUP BY canonical_key
          HAVING COUNT(*) > 1
        )`
      )
      .get() as { duplicate_canonical_key_count: number | null };

    let totalStrategyEntries = 0;
    try {
      const strategyRow = this.db
        .prepare(
          `SELECT
            COALESCE(SUM((SELECT COUNT(*) FROM json_each(strategy_json))), 0) AS total_strategy_entries
          FROM solutions`
        )
        .get() as { total_strategy_entries: number | null };
      totalStrategyEntries = Number(strategyRow.total_strategy_entries ?? 0);
    } catch {
      const rows = this.db.prepare(`SELECT strategy_json FROM solutions`).all() as Array<{ strategy_json: string }>;
      totalStrategyEntries = rows.reduce((sum, row) => {
        try {
          const strategy = JSON.parse(row.strategy_json) as Record<string, unknown>;
          return sum + Object.keys(strategy).length;
        } catch {
          return sum;
        }
      }, 0);
    }

    return {
      totalSolutions: Number(totalsRow.total_solutions ?? 0),
      totalStrategyEntries: Number(totalStrategyEntries ?? 0),
      distinctCanonicalKeys: Number(totalsRow.distinct_canonical_keys ?? 0),
      duplicateCanonicalKeyCount: Number(duplicateRow.duplicate_canonical_key_count ?? 0)
    };
  }

  reconcileCanonicalKeys(options: { apply?: boolean } = {}): CanonicalKeyReconcileReport {
    const applyRequested = Boolean(options.apply);
    const dryRun = !applyRequested;
    const checkedAt = new Date().toISOString();
    const rows = this.db
      .prepare(`SELECT id, canonical_key, spot_json FROM solutions ORDER BY id ASC`)
      .all() as unknown as Array<{ id: number; canonical_key: string; spot_json: string }>;

    const entries: CanonicalKeyReconcileEntry[] = [];
    const mismatchCandidates: Array<{
      solutionId: number;
      storedCanonicalKey: string;
      recomputedCanonicalKey: string;
      heroPosition: string | null;
      actionPath: string[];
    }> = [];

    for (const row of rows) {
      try {
        const spot = JSON.parse(row.spot_json) as SpotInput;
        const recomputedCanonicalKey = canonicalSpotKey(spot);
        if (recomputedCanonicalKey === row.canonical_key) {
          continue;
        }
        const heroPosition = typeof spot.heroPosition === "string" ? spot.heroPosition : null;
        const actionPath = Array.isArray(spot.actionPath) ? spot.actionPath.map((item) => String(item)) : [];
        mismatchCandidates.push({
          solutionId: row.id,
          storedCanonicalKey: row.canonical_key,
          recomputedCanonicalKey,
          heroPosition,
          actionPath
        });
        entries.push({
          solutionId: row.id,
          storedCanonicalKey: row.canonical_key,
          recomputedCanonicalKey,
          heroPosition,
          actionPath,
          outcome: "MISMATCH",
          collisionWithSolutionId: null,
          parseError: null
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        entries.push({
          solutionId: row.id,
          storedCanonicalKey: row.canonical_key,
          recomputedCanonicalKey: null,
          heroPosition: null,
          actionPath: [],
          outcome: "INVALID_SPOT_JSON",
          collisionWithSolutionId: null,
          parseError: message
        });
      }
    }

    const keyToId = new Map<string, number>(rows.map((row) => [row.canonical_key, row.id]));
    const mismatchByNewKey = new Map<string, number[]>();
    for (const item of mismatchCandidates) {
      const ids = mismatchByNewKey.get(item.recomputedCanonicalKey) ?? [];
      ids.push(item.solutionId);
      mismatchByNewKey.set(item.recomputedCanonicalKey, ids);
    }

    for (const entry of entries) {
      if (entry.outcome !== "MISMATCH" || !entry.recomputedCanonicalKey) {
        continue;
      }
      const existingId = keyToId.get(entry.recomputedCanonicalKey);
      if (existingId !== undefined && existingId !== entry.solutionId) {
        entry.outcome = "COLLISION";
        entry.collisionWithSolutionId = existingId;
        continue;
      }
      const ids = mismatchByNewKey.get(entry.recomputedCanonicalKey) ?? [];
      if (ids.length > 1) {
        entry.outcome = "COLLISION";
        entry.collisionWithSolutionId = ids.find((id) => id !== entry.solutionId) ?? null;
      }
    }

    const invalidSpotCount = entries.filter((entry) => entry.outcome === "INVALID_SPOT_JSON").length;
    const collisionCount = entries.filter((entry) => entry.outcome === "COLLISION").length;
    const mismatchCount = entries.filter((entry) => entry.outcome === "MISMATCH").length;
    const blocked = collisionCount > 0;
    const blockReason = blocked ? "collision_detected_for_recomputed_canonical_key" : null;

    let updatesApplied = 0;
    if (applyRequested && !blocked) {
      const update = this.db.prepare(`UPDATE solutions SET canonical_key = ? WHERE id = ?`);
      for (const entry of entries) {
        if (entry.outcome !== "MISMATCH" || !entry.recomputedCanonicalKey) {
          continue;
        }
        update.run(entry.recomputedCanonicalKey, entry.solutionId);
        entry.outcome = "UPDATED";
        updatesApplied += 1;
      }
    }

    return {
      checkedAt,
      dryRun,
      applyRequested,
      blocked,
      blockReason,
      totalSolutions: rows.length,
      mismatchCount,
      invalidSpotCount,
      collisionCount,
      updatesApplied,
      entries
    };
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        format TEXT NOT NULL CHECK (format IN ('json', 'csv')),
        file_name TEXT,
        file_hash TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS solutions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
        canonical_key TEXT NOT NULL UNIQUE,
        spot_json TEXT NOT NULL,
        strategy_json TEXT NOT NULL,
        ev_summary_json TEXT,
        source_label TEXT NOT NULL,
        external_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_solutions_import_id ON solutions(import_id);
      CREATE INDEX IF NOT EXISTS idx_solutions_source_label ON solutions(source_label);
    `);
    this.addColumnIfMissing("imports", "metadata_json", "TEXT");
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

interface SolutionRow {
  id: number;
  import_id: number;
  canonical_key: string;
  spot_json: string;
  strategy_json: string;
  ev_summary_json: string | null;
  source_label: string;
  external_id: string | null;
  created_at: string;
  file_name: string | null;
  file_hash: string;
  metadata_json: string | null;
}

interface ImportRow {
  id: number;
  name: string;
  format: "json" | "csv";
  file_name: string | null;
  file_hash: string;
  row_count: number;
  metadata_json: string | null;
  created_at: string;
}

function mapSolution(row: SolutionRow): StoredSolution {
  return {
    id: row.id,
    importId: row.import_id,
    canonicalKey: row.canonical_key,
    spot: JSON.parse(row.spot_json) as SpotInput,
    strategy: JSON.parse(row.strategy_json) as StrategyMatrix,
    evSummary: row.ev_summary_json ? (JSON.parse(row.ev_summary_json) as EvSummary) : null,
    sourceLabel: row.source_label,
    externalId: row.external_id,
    importedAt: row.created_at,
    fileName: row.file_name,
    fileHash: row.file_hash,
    databaseFeatures: parseFeatures(row.metadata_json)
  };
}

function parseFeatures(raw: string | null): HrcDatabaseFeatures | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as HrcDatabaseFeatures;
  } catch {
    return null;
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function defaultDbPath(): string {
  return process.env.PTL_DB_PATH || join(process.cwd(), "data", "poker-tournament-lab.db");
}

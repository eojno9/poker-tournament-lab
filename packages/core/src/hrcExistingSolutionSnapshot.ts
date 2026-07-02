export interface HrcExistingSolutionSnapshotInputRow {
  id?: string | number;
  canonicalKey?: string | null;
  source?: string | null;
  sourceFile?: string | null;
  treeConfigId?: string | null;
  heroPosition?: string | null;
  tableSize?: number | null;
  remainingPlayers?: number | null;
}

export interface HrcExistingSolutionCanonicalKeyEntry {
  rowId: string;
  canonicalKey: string | null;
  normalizedCanonicalKey: string | null;
  source: string;
  sourceFile: string | null;
  isDuplicate: boolean;
  warnings: string[];
}

export interface HrcExistingSolutionCanonicalKeySnapshot {
  totalRows: number;
  canonicalKeys: string[];
  entries: HrcExistingSolutionCanonicalKeyEntry[];
  missingCanonicalKeyCount: number;
  duplicateCanonicalKeyCount: number;
  uniqueCanonicalKeyCount: number;
  sourceBreakdown: Record<string, number>;
  warnings: string[];
}

export interface HrcExistingSolutionCanonicalKeySummary {
  totalRows: number;
  missingCanonicalKeyCount: number;
  duplicateCanonicalKeyCount: number;
  uniqueCanonicalKeyCount: number;
  sourceBreakdown: Record<string, number>;
  warningCount: number;
}

export function buildHrcExistingSolutionCanonicalKeySnapshot(
  rows: HrcExistingSolutionSnapshotInputRow[]
): HrcExistingSolutionCanonicalKeySnapshot {
  const canonicalKeys: string[] = [];
  const seenCanonicalKeys = new Set<string>();
  const entries: HrcExistingSolutionCanonicalKeyEntry[] = [];
  const sourceBreakdown: Record<string, number> = {};
  const warnings: string[] = [];
  let missingCanonicalKeyCount = 0;
  let duplicateCanonicalKeyCount = 0;

  rows.forEach((row, index) => {
    const rowId = normalizeRowId(row.id, index);
    const canonicalKey = normalizeCanonicalKey(row.canonicalKey);
    const source = sanitizeSource(row.source);
    const sourceFile = sanitizeSourceFile(row.sourceFile);
    const entryWarnings: string[] = [];
    let isDuplicate = false;

    sourceBreakdown[source] = (sourceBreakdown[source] ?? 0) + 1;

    if (canonicalKey === null) {
      missingCanonicalKeyCount += 1;
      entryWarnings.push("missing canonical key");
      warnings.push(`${rowId}: missing canonical key`);
    } else if (seenCanonicalKeys.has(canonicalKey)) {
      duplicateCanonicalKeyCount += 1;
      isDuplicate = true;
      entryWarnings.push("duplicate canonical key");
      warnings.push(`${rowId}: duplicate canonical key ${canonicalKey}`);
    } else {
      seenCanonicalKeys.add(canonicalKey);
      canonicalKeys.push(canonicalKey);
    }

    entries.push({
      rowId,
      canonicalKey,
      normalizedCanonicalKey: canonicalKey,
      source,
      sourceFile,
      isDuplicate,
      warnings: entryWarnings
    });
  });

  return {
    totalRows: rows.length,
    canonicalKeys,
    entries,
    missingCanonicalKeyCount,
    duplicateCanonicalKeyCount,
    uniqueCanonicalKeyCount: canonicalKeys.length,
    sourceBreakdown,
    warnings
  };
}

export function summarizeHrcExistingSolutionCanonicalKeys(
  snapshot: HrcExistingSolutionCanonicalKeySnapshot
): HrcExistingSolutionCanonicalKeySummary {
  return {
    totalRows: snapshot.totalRows,
    missingCanonicalKeyCount: snapshot.missingCanonicalKeyCount,
    duplicateCanonicalKeyCount: snapshot.duplicateCanonicalKeyCount,
    uniqueCanonicalKeyCount: snapshot.uniqueCanonicalKeyCount,
    sourceBreakdown: { ...snapshot.sourceBreakdown },
    warningCount: snapshot.warnings.length
  };
}

export function getHrcExistingCanonicalKeys(snapshot: HrcExistingSolutionCanonicalKeySnapshot): string[] {
  return [...snapshot.canonicalKeys];
}

function normalizeRowId(id: string | number | null | undefined, index: number): string {
  if (typeof id === "string" && id.trim().length > 0) {
    return id.trim();
  }

  if (typeof id === "number" && Number.isFinite(id)) {
    return String(id);
  }

  return `row-${index + 1}`;
}

function normalizeCanonicalKey(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeSource(source: string | null | undefined): string {
  if (typeof source !== "string") {
    return "UNKNOWN";
  }

  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return "UNKNOWN";
  }

  if (containsPrivatePathToken(trimmed)) {
    return "<redacted-source>";
  }

  return trimmed;
}

function sanitizeSourceFile(sourceFile: string | null | undefined): string | null {
  if (typeof sourceFile !== "string") {
    return null;
  }

  const trimmed = sourceFile.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const fileName = trimmed.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  if (!fileName) {
    return "<redacted-source-file>";
  }

  if (containsPrivatePathToken(fileName)) {
    return "<redacted-source-file>";
  }

  return fileName;
}

function containsPrivatePathToken(value: string): boolean {
  return /C:\\Users|sample-user|sample-external-hrc-folder|@privaterelay\.appleid\.com/i.test(value);
}

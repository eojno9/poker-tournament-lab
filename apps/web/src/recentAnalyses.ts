import { RESULT_SOURCES, type AnalyzeResult, type ResultSource } from "@poker-tournament-lab/core";
import type { AnalyzeFormState } from "./analyzeForm.js";
import { resolveStorage, safeReadStorage, safeWriteStorage, type StorageLike } from "./safeStorage.js";

export type { StorageLike } from "./safeStorage.js";

export interface RecentAnalysisSummary {
  heroPosition: string;
  tableSize: number;
  heroStackBb: number | null;
  treeConfig: string;
  resultSource: ResultSource;
}

export interface RecentAnalysisMetadata {
  canonicalKey?: string;
  modelVersion?: string;
  missingRequirements?: string[];
}

export interface RecentAnalysisEntry {
  id: string;
  createdAt: string;
  formState: AnalyzeFormState;
  source: ResultSource;
  sourceLabel: string;
  summary: RecentAnalysisSummary;
  metadata: RecentAnalysisMetadata;
}

const RECENT_ANALYSES_MAX = 20;
export const RECENT_ANALYSES_STORAGE_KEY = "poker-tournament-lab:recent-analyses:v1";

export function loadRecentAnalyses(storage: StorageLike | null = resolveStorage()): RecentAnalysisEntry[] {
  const result = safeReadStorage(storage, RECENT_ANALYSES_STORAGE_KEY);
  if (!result.ok || !result.value) {
    return [];
  }
  try {
    const parsed = JSON.parse(result.value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeEntry).filter((entry): entry is RecentAnalysisEntry => entry !== null).slice(0, RECENT_ANALYSES_MAX);
  } catch {
    return [];
  }
}

export function addRecentAnalysis(
  entry: Omit<RecentAnalysisEntry, "id" | "createdAt">,
  storage: StorageLike | null = resolveStorage(),
  now: Date = new Date()
): RecentAnalysisEntry[] {
  if (!storage) {
    return [];
  }
  const nextEntry: RecentAnalysisEntry = {
    id: createEntryId(),
    createdAt: now.toISOString(),
    formState: cloneFormState(entry.formState),
    source: entry.source,
    sourceLabel: entry.sourceLabel,
    summary: {
      ...entry.summary
    },
    metadata: sanitizeMetadata(entry.metadata)
  };

  const existing = loadRecentAnalyses(storage);
  const next = [nextEntry, ...existing].slice(0, RECENT_ANALYSES_MAX);
  safeWriteStorage(storage, RECENT_ANALYSES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteRecentAnalysis(id: string, storage: StorageLike | null = resolveStorage()): RecentAnalysisEntry[] {
  if (!storage) {
    return [];
  }
  const next = loadRecentAnalyses(storage).filter((entry) => entry.id !== id);
  safeWriteStorage(storage, RECENT_ANALYSES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function clearRecentAnalyses(storage: StorageLike | null = resolveStorage()): void {
  if (!storage) {
    return;
  }
  safeWriteStorage(storage, RECENT_ANALYSES_STORAGE_KEY, "[]");
}

export function buildRecentAnalysisSummary(formState: AnalyzeFormState, result: AnalyzeResult): RecentAnalysisSummary {
  const heroPlayer = formState.players.find((player) => player.seat === formState.heroSeat);
  return {
    heroPosition: formState.heroPosition,
    tableSize: formState.tableSize,
    heroStackBb: typeof heroPlayer?.stackBb === "number" && Number.isFinite(heroPlayer.stackBb) ? heroPlayer.stackBb : null,
    treeConfig: formState.treeConfig,
    resultSource: isKnownSource(result.source) ? result.source : RESULT_SOURCES.NOT_SOLVED
  };
}

function normalizeEntry(candidate: unknown): RecentAnalysisEntry | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const input = candidate as Partial<RecentAnalysisEntry>;
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    return null;
  }
  if (!isKnownSource(input.source)) {
    return null;
  }
  if (typeof input.sourceLabel !== "string" || input.sourceLabel.trim().length === 0) {
    return null;
  }
  if (!input.formState || typeof input.formState !== "object") {
    return null;
  }
  if (!input.summary || typeof input.summary !== "object") {
    return null;
  }
  const summary = input.summary as Partial<RecentAnalysisSummary>;
  if (typeof summary.heroPosition !== "string" || typeof summary.tableSize !== "number" || typeof summary.treeConfig !== "string") {
    return null;
  }
  const heroStackBb =
    typeof summary.heroStackBb === "number" && Number.isFinite(summary.heroStackBb) ? summary.heroStackBb : null;
  const metadata = input.metadata && typeof input.metadata === "object" ? (input.metadata as RecentAnalysisMetadata) : {};
  return {
    id: input.id,
    createdAt: normalizeIso(input.createdAt),
    formState: cloneFormState(input.formState as AnalyzeFormState),
    source: input.source,
    sourceLabel: input.sourceLabel,
    summary: {
      heroPosition: summary.heroPosition,
      tableSize: summary.tableSize,
      heroStackBb,
      treeConfig: summary.treeConfig,
      resultSource: isKnownSource(summary.resultSource) ? summary.resultSource : input.source
    },
    metadata: sanitizeMetadata(metadata)
  };
}

function normalizeIso(value: unknown): string {
  if (typeof value !== "string") {
    return new Date(0).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
}

function isKnownSource(value: unknown): value is ResultSource {
  return (
    value === RESULT_SOURCES.HRC_PRECOMPUTED_DB ||
    value === RESULT_SOURCES.FALLBACK_ICM ||
    value === RESULT_SOURCES.NOT_SOLVED
  );
}

function cloneFormState(formState: AnalyzeFormState): AnalyzeFormState {
  return JSON.parse(JSON.stringify(formState)) as AnalyzeFormState;
}

function createEntryId(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }
  return `recent-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sanitizeMetadata(metadata: RecentAnalysisMetadata): RecentAnalysisMetadata {
  const output: RecentAnalysisMetadata = {};
  if (typeof metadata.canonicalKey === "string" && metadata.canonicalKey.trim().length > 0) {
    output.canonicalKey = metadata.canonicalKey;
  }
  if (typeof metadata.modelVersion === "string" && metadata.modelVersion.trim().length > 0) {
    output.modelVersion = metadata.modelVersion;
  }
  if (Array.isArray(metadata.missingRequirements)) {
    const values = metadata.missingRequirements.filter((item): item is string => typeof item === "string").slice(0, 16);
    if (values.length > 0) {
      output.missingRequirements = values;
    }
  }
  return output;
}

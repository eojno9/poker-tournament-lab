import { RESULT_SOURCES, type HandAction, type ResultSource, type TrainerChoiceAction, type TrainerProblemSpotSummary } from "@poker-tournament-lab/core";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type TrainerMistakeStatus = "unresolved" | "resolved" | "dismissed";

export interface TrainerHistoryEntry {
  id: string;
  createdAt: string;
  canonicalKey: string;
  hand: string;
  selectedAction: TrainerChoiceAction;
  correctAction: HandAction;
  isCorrect: boolean;
  frequency: number;
  ev: number | null;
  evLabel: string;
  source: ResultSource;
  spotSummary: TrainerProblemSpotSummary;
  firstAttemptId?: string;
  latestAttemptId?: string;
  lastReviewedAt?: string;
  retryCount?: number;
  status?: TrainerMistakeStatus;
}

export interface AddTrainerHistoryInput {
  canonicalKey: string;
  hand: string;
  selectedAction: TrainerChoiceAction;
  correctAction: HandAction;
  isCorrect: boolean;
  frequency: number;
  ev: number | null;
  evLabel: string;
  source: ResultSource;
  spotSummary: TrainerProblemSpotSummary;
}

export const TRAINER_RECENT_STORAGE_KEY = "ptl.trainer.recentAttempts.v1";
export const TRAINER_MISTAKES_STORAGE_KEY = "ptl.trainer.mistakes.v1";

const TRAINER_RECENT_MAX = 30;
const TRAINER_MISTAKES_MAX = 50;

export function loadTrainerRecentHistory(storage: StorageLike | null = resolveStorage()): TrainerHistoryEntry[] {
  return loadHistory(TRAINER_RECENT_STORAGE_KEY, TRAINER_RECENT_MAX, storage);
}

export function loadTrainerMistakesHistory(storage: StorageLike | null = resolveStorage()): TrainerHistoryEntry[] {
  return loadHistory(TRAINER_MISTAKES_STORAGE_KEY, TRAINER_MISTAKES_MAX, storage);
}

export function addTrainerRecentHistory(
  entry: AddTrainerHistoryInput,
  storage: StorageLike | null = resolveStorage(),
  now: Date = new Date()
): TrainerHistoryEntry[] {
  return addHistoryEntry(TRAINER_RECENT_STORAGE_KEY, TRAINER_RECENT_MAX, entry, storage, now);
}

export function addTrainerMistakeHistory(
  entry: AddTrainerHistoryInput,
  storage: StorageLike | null = resolveStorage(),
  now: Date = new Date()
): TrainerHistoryEntry[] {
  if (!storage) {
    return [];
  }
  const normalized = normalizeAddInput(entry, now);
  const existing = loadTrainerMistakesHistory(storage);
  const existingIndex = existing.findIndex((item) => isSameMistakeSpot(item, normalized));

  if (entry.isCorrect) {
    if (existingIndex < 0) {
      return existing;
    }
    const existingItem = existing[existingIndex]!;
    const updated: TrainerHistoryEntry = {
      ...existingItem,
      latestAttemptId: normalized.id,
      lastReviewedAt: normalized.createdAt,
      retryCount: (existingItem.retryCount ?? 0) + 1,
      status: "resolved"
    };
    const next = [updated, ...existing.filter((_, index) => index !== existingIndex)].slice(0, TRAINER_MISTAKES_MAX);
    saveHistory(TRAINER_MISTAKES_STORAGE_KEY, next, storage);
    return next;
  }

  if (existingIndex >= 0) {
    const existingItem = existing[existingIndex]!;
    const updated: TrainerHistoryEntry = {
      ...normalized,
      id: existingItem.id,
      createdAt: existingItem.createdAt,
      firstAttemptId: existingItem.firstAttemptId ?? existingItem.latestAttemptId ?? existingItem.id,
      latestAttemptId: normalized.id,
      lastReviewedAt: normalized.createdAt,
      retryCount: (existingItem.retryCount ?? 0) + 1,
      status: "unresolved"
    };
    const next = [updated, ...existing.filter((_, index) => index !== existingIndex)].slice(0, TRAINER_MISTAKES_MAX);
    saveHistory(TRAINER_MISTAKES_STORAGE_KEY, next, storage);
    return next;
  }

  const next = [
    {
      ...normalized,
      firstAttemptId: normalized.id,
      latestAttemptId: normalized.id,
      retryCount: 0,
      status: "unresolved" as const
    },
    ...existing
  ].slice(0, TRAINER_MISTAKES_MAX);
  saveHistory(TRAINER_MISTAKES_STORAGE_KEY, next, storage);
  return next;
}

export function dismissTrainerMistakeHistory(
  id: string,
  storage: StorageLike | null = resolveStorage(),
  now: Date = new Date()
): TrainerHistoryEntry[] {
  if (!storage) {
    return [];
  }
  const existing = loadTrainerMistakesHistory(storage);
  const next = existing.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          lastReviewedAt: normalizeIso(now.toISOString()),
          status: "dismissed" as const
        }
      : entry
  );
  saveHistory(TRAINER_MISTAKES_STORAGE_KEY, next, storage);
  return next;
}

export function clearTrainerRecentHistory(storage: StorageLike | null = resolveStorage()): void {
  if (!storage) {
    return;
  }
  storage.setItem(TRAINER_RECENT_STORAGE_KEY, "[]");
}

export function clearTrainerMistakesHistory(storage: StorageLike | null = resolveStorage()): void {
  if (!storage) {
    return;
  }
  storage.setItem(TRAINER_MISTAKES_STORAGE_KEY, "[]");
}

function addHistoryEntry(
  key: string,
  maxCount: number,
  entry: AddTrainerHistoryInput,
  storage: StorageLike | null,
  now: Date
): TrainerHistoryEntry[] {
  if (!storage) {
    return [];
  }
  const normalized = normalizeAddInput(entry, now);
  const existing = loadHistory(key, maxCount, storage);
  const deduped = existing.filter(
    (item) =>
      !(item.canonicalKey === normalized.canonicalKey && item.hand === normalized.hand && item.selectedAction === normalized.selectedAction)
  );
  const next = [normalized, ...deduped].slice(0, maxCount);
  saveHistory(key, next, storage);
  return next;
}

function loadHistory(key: string, maxCount: number, storage: StorageLike | null): TrainerHistoryEntry[] {
  if (!storage) {
    return [];
  }
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeLoadedEntry).filter((entry): entry is TrainerHistoryEntry => entry !== null).slice(0, maxCount);
  } catch {
    return [];
  }
}

function normalizeAddInput(entry: AddTrainerHistoryInput, now: Date): TrainerHistoryEntry {
  return {
    id: createEntryId(),
    createdAt: normalizeIso(now.toISOString()),
    canonicalKey: entry.canonicalKey,
    hand: entry.hand,
    selectedAction: entry.selectedAction,
    correctAction: entry.correctAction,
    isCorrect: entry.isCorrect,
    frequency: entry.frequency,
    ev: entry.ev,
    evLabel: entry.evLabel,
    source: entry.source,
    spotSummary: cloneSpotSummary(entry.spotSummary)
  };
}

function normalizeLoadedEntry(value: unknown): TrainerHistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Partial<TrainerHistoryEntry>;
  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    return null;
  }
  if (typeof entry.canonicalKey !== "string" || entry.canonicalKey.trim().length === 0) {
    return null;
  }
  if (typeof entry.hand !== "string" || entry.hand.trim().length === 0) {
    return null;
  }
  if (entry.selectedAction !== "SHOVE" && entry.selectedAction !== "FOLD") {
    return null;
  }
  if (entry.correctAction !== "SHOVE" && entry.correctAction !== "FOLD" && entry.correctAction !== "MIXED") {
    return null;
  }
  if (typeof entry.isCorrect !== "boolean") {
    return null;
  }
  if (typeof entry.frequency !== "number" || !Number.isFinite(entry.frequency)) {
    return null;
  }
  if (!isKnownSource(entry.source)) {
    return null;
  }
  if (typeof entry.evLabel !== "string") {
    return null;
  }
  const spotSummary = normalizeSpotSummary(entry.spotSummary);
  if (!spotSummary) {
    return null;
  }

  return {
    id: entry.id,
    createdAt: normalizeIso(entry.createdAt),
    canonicalKey: entry.canonicalKey,
    hand: entry.hand,
    selectedAction: entry.selectedAction,
    correctAction: entry.correctAction,
    isCorrect: entry.isCorrect,
    frequency: entry.frequency,
    ev: typeof entry.ev === "number" && Number.isFinite(entry.ev) ? entry.ev : null,
    evLabel: entry.evLabel,
    source: entry.source,
    spotSummary,
    ...(typeof entry.firstAttemptId === "string" ? { firstAttemptId: entry.firstAttemptId } : {}),
    ...(typeof entry.latestAttemptId === "string" ? { latestAttemptId: entry.latestAttemptId } : {}),
    ...(typeof entry.lastReviewedAt === "string" ? { lastReviewedAt: normalizeIso(entry.lastReviewedAt) } : {}),
    ...(typeof entry.retryCount === "number" && Number.isFinite(entry.retryCount) && entry.retryCount >= 0
      ? { retryCount: Math.trunc(entry.retryCount) }
      : {}),
    ...(isTrainerMistakeStatus(entry.status) ? { status: entry.status } : {})
  };
}

function isSameMistakeSpot(left: TrainerHistoryEntry, right: TrainerHistoryEntry): boolean {
  return (
    left.canonicalKey === right.canonicalKey &&
    left.hand === right.hand &&
    left.spotSummary.heroPosition === right.spotSummary.heroPosition
  );
}

function saveHistory(key: string, entries: TrainerHistoryEntry[], storage: StorageLike): void {
  storage.setItem(key, JSON.stringify(entries));
}

function normalizeSpotSummary(value: unknown): TrainerProblemSpotSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const summary = value as Partial<TrainerProblemSpotSummary>;
  if (typeof summary.heroPosition !== "string") {
    return null;
  }
  if (typeof summary.tableSize !== "number" || !Number.isFinite(summary.tableSize)) {
    return null;
  }
  if (summary.heroStackBb !== null && summary.heroStackBb !== undefined && (typeof summary.heroStackBb !== "number" || !Number.isFinite(summary.heroStackBb))) {
    return null;
  }
  if (summary.treeConfig !== null && summary.treeConfig !== undefined && typeof summary.treeConfig !== "string") {
    return null;
  }
  if (!Array.isArray(summary.actionPath) || !summary.actionPath.every((item) => typeof item === "string")) {
    return null;
  }
  return {
    heroPosition: summary.heroPosition,
    tableSize: summary.tableSize,
    heroStackBb: typeof summary.heroStackBb === "number" ? summary.heroStackBb : null,
    treeConfig: typeof summary.treeConfig === "string" ? summary.treeConfig : null,
    actionPath: [...summary.actionPath]
  };
}

function cloneSpotSummary(value: TrainerProblemSpotSummary): TrainerProblemSpotSummary {
  return {
    heroPosition: value.heroPosition,
    tableSize: value.tableSize,
    heroStackBb: value.heroStackBb,
    treeConfig: value.treeConfig,
    actionPath: [...value.actionPath]
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
  return value === RESULT_SOURCES.HRC_PRECOMPUTED_DB || value === RESULT_SOURCES.FALLBACK_ICM || value === RESULT_SOURCES.NOT_SOLVED;
}

function isTrainerMistakeStatus(value: unknown): value is TrainerMistakeStatus {
  return value === "unresolved" || value === "resolved" || value === "dismissed";
}

function createEntryId(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }
  return `trainer-history-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function resolveStorage(): StorageLike | null {
  const maybeStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  return maybeStorage ?? null;
}

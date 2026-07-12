import type { SolutionListItem } from "./api.js";
import type { StorageLike } from "./trainerHistory.js";

export interface TrainerProblemFilters {
  heroPosition: string;
  tableSize: string;
  treeConfig: string;
  sourceFile: string;
}

export interface TrainerFilterSettings {
  filters: TrainerProblemFilters;
  handInput: string;
  seedInput: string;
}

export const defaultTrainerProblemFilters: TrainerProblemFilters = {
  heroPosition: "",
  tableSize: "",
  treeConfig: "",
  sourceFile: ""
};

export const TRAINER_FILTERS_STORAGE_KEY = "ptl.trainer.filters.v1";

const TRAINER_FILTERS_STORAGE_VERSION = 1;

export const defaultTrainerFilterSettings: TrainerFilterSettings = {
  filters: defaultTrainerProblemFilters,
  handInput: "",
  seedInput: ""
};

export function buildTrainerSourceSolutions(solutions: SolutionListItem[]): SolutionListItem[] {
  return solutions.filter((row) => Boolean(row.strategy) && Object.keys(row.strategy).length > 0);
}

export function filterTrainerSolutions(solutions: SolutionListItem[], filters: TrainerProblemFilters): SolutionListItem[] {
  return solutions.filter((row) => {
    const heroPosition = row.spot.heroPosition ?? "";
    const tableSize = typeof row.spot.tableSize === "number" ? String(row.spot.tableSize) : "";
    const treeConfig = deriveTrainerTreeConfig(row);
    const sourceFile = row.fileName ?? "";

    if (filters.heroPosition && heroPosition !== filters.heroPosition) {
      return false;
    }
    if (filters.tableSize && tableSize !== filters.tableSize) {
      return false;
    }
    if (filters.treeConfig && treeConfig !== filters.treeConfig) {
      return false;
    }
    if (filters.sourceFile && !sourceFile.toLowerCase().includes(filters.sourceFile.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function deriveTrainerTreeConfig(solution: SolutionListItem): string {
  const spotFamily = solution.databaseFeatures?.spotFamily;
  if (typeof spotFamily === "string" && spotFamily.trim().length > 0) {
    return spotFamily;
  }
  if (Array.isArray(solution.spot.actionPath) && solution.spot.actionPath.length > 0) {
    return "open_shove_only";
  }
  return "제공되지 않음";
}

export function normalizeTrainerHandInput(input: string): string | undefined {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseTrainerSeedInput(input: string): number | string | undefined {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }
  return trimmed;
}

export function resolveTrainerSolutionIndex(cursor: number, candidateCount: number, seedInput: string): number {
  if (!Number.isFinite(candidateCount) || candidateCount <= 0) {
    return 0;
  }
  const seed = parseTrainerSeedInput(seedInput);
  const seedOffset = seed === undefined ? 0 : stableSeedToNumber(seed);
  const base = seedOffset + Math.trunc(cursor);
  return normalizeIndex(base, candidateCount);
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function loadTrainerFilterSettings(storage: StorageLike | null = resolveStorage()): TrainerFilterSettings {
  if (!storage) {
    return cloneDefaultTrainerFilterSettings();
  }
  const raw = storage.getItem(TRAINER_FILTERS_STORAGE_KEY);
  if (!raw) {
    return cloneDefaultTrainerFilterSettings();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      safeResetTrainerFilterSettings(storage);
      return cloneDefaultTrainerFilterSettings();
    }
    const payload = parsed as Partial<TrainerFilterSettings> & { version?: unknown };
    if (payload.version !== TRAINER_FILTERS_STORAGE_VERSION) {
      return cloneDefaultTrainerFilterSettings();
    }
    return normalizeTrainerFilterSettings(payload);
  } catch {
    safeResetTrainerFilterSettings(storage);
    return cloneDefaultTrainerFilterSettings();
  }
}

export function saveTrainerFilterSettings(settings: TrainerFilterSettings, storage: StorageLike | null = resolveStorage()): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(
      TRAINER_FILTERS_STORAGE_KEY,
      JSON.stringify({
        version: TRAINER_FILTERS_STORAGE_VERSION,
        ...normalizeTrainerFilterSettings(settings)
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearTrainerFilterSettings(storage: StorageLike | null = resolveStorage()): boolean {
  if (!storage) {
    return false;
  }
  return saveTrainerFilterSettings(cloneDefaultTrainerFilterSettings(), storage);
}

function stableSeedToNumber(seed: number | string): number {
  if (typeof seed === "number") {
    return Math.abs(seed);
  }
  return Math.abs(
    [...seed].reduce((sum, char, index) => {
      return sum + char.charCodeAt(0) * (index + 1);
    }, 0)
  );
}

function normalizeIndex(value: number, count: number): number {
  return ((value % count) + count) % count;
}

function normalizeTrainerFilterSettings(value: Partial<TrainerFilterSettings>): TrainerFilterSettings {
  const filters = value.filters && typeof value.filters === "object" ? value.filters : {};
  return {
    filters: {
      heroPosition: normalizeOptionalText((filters as Partial<TrainerProblemFilters>).heroPosition),
      tableSize: normalizeOptionalText((filters as Partial<TrainerProblemFilters>).tableSize),
      treeConfig: normalizeOptionalText((filters as Partial<TrainerProblemFilters>).treeConfig),
      sourceFile: normalizeOptionalText((filters as Partial<TrainerProblemFilters>).sourceFile)
    },
    handInput: normalizeOptionalText(value.handInput),
    seedInput: normalizeOptionalText(value.seedInput)
  };
}

function cloneDefaultTrainerFilterSettings(): TrainerFilterSettings {
  return {
    filters: { ...defaultTrainerProblemFilters },
    handInput: "",
    seedInput: ""
  };
}

function normalizeOptionalText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeResetTrainerFilterSettings(storage: StorageLike): void {
  try {
    storage.setItem(
      TRAINER_FILTERS_STORAGE_KEY,
      JSON.stringify({
        version: TRAINER_FILTERS_STORAGE_VERSION,
        ...cloneDefaultTrainerFilterSettings()
      })
    );
  } catch {
    // Keep Trainer initialization usable even when localStorage cannot be written.
  }
}

function resolveStorage(): StorageLike | null {
  const maybeStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  return maybeStorage ?? null;
}

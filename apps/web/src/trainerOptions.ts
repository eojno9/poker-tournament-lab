import type { SolutionListItem } from "./api.js";

export interface TrainerProblemFilters {
  heroPosition: string;
  tableSize: string;
  treeConfig: string;
  sourceFile: string;
}

export const defaultTrainerProblemFilters: TrainerProblemFilters = {
  heroPosition: "",
  tableSize: "",
  treeConfig: "",
  sourceFile: ""
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

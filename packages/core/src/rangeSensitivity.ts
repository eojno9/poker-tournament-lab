import type { FallbackVillainRange } from "./types.js";

export const RANGE_SENSITIVITY_KIND = "VILLAIN_RANGE_SENSITIVITY" as const;
export const RANGE_SENSITIVITY_NOT_PROVIDED = "not_provided";

const EPSILON = 0.000001;
const PRESET_ORDER: Record<string, number> = {
  tight: 0,
  standard: 1,
  loose: 2,
  custom: 3
};

export type VillainRangePresetName = "tight" | "standard" | "loose" | "custom" | string;
export type VillainRangeSensitivityLabel = "shove_advantage" | "fold_advantage" | "neutral" | "not_provided";

export interface VillainRangeSensitivityScenarioInput {
  presetName: VillainRangePresetName;
  callRangePct?: number | null;
  shoveEV?: number | null;
  foldEV?: number | null;
  difference?: number | null;
  villainRanges?: FallbackVillainRange[] | null;
  assumptions?: string[] | null;
  limitations?: string[] | null;
}

export interface VillainRangeSensitivityRow {
  presetName: VillainRangePresetName;
  callRangePct: number | null;
  callRangePctLabel: string;
  shoveEV: number | null;
  shoveEVLabel: string;
  foldEV: number | null;
  foldEVLabel: string;
  difference: number | null;
  differenceLabel: string;
  label: VillainRangeSensitivityLabel;
  villainRanges: FallbackVillainRange[];
  assumptions: string[];
  limitations: string[];
}

export interface VillainRangeSensitivityRank {
  presetName: VillainRangePresetName;
  difference: number;
  label: VillainRangeSensitivityLabel;
  callRangePct: number | null;
}

export interface VillainRangeSensitivitySummary {
  kind: typeof RANGE_SENSITIVITY_KIND;
  isNash: false;
  scenarioCount: number;
  bestScenario: VillainRangeSensitivityRank | null;
  worstScenario: VillainRangeSensitivityRank | null;
  rows: VillainRangeSensitivityRow[];
  explanation: string[];
  limitations: string[];
}

export interface VillainRangeSensitivitySummaryInput {
  scenarios: readonly VillainRangeSensitivityScenarioInput[];
  explanation?: string[] | null;
  limitations?: string[] | null;
  notProvidedLabel?: string;
}

export function compareVillainRangeScenarios(
  scenarios: readonly VillainRangeSensitivityScenarioInput[],
  options: { notProvidedLabel?: string } = {}
): VillainRangeSensitivityRow[] {
  const notProvidedLabel = normalizeNotProvidedLabel(options.notProvidedLabel);

  return [...scenarios]
    .map((scenario) => toRow(scenario, notProvidedLabel))
    .sort(compareRows);
}

export function buildVillainRangeSensitivitySummary(
  input: VillainRangeSensitivitySummaryInput
): VillainRangeSensitivitySummary {
  const notProvidedLabel = normalizeNotProvidedLabel(input.notProvidedLabel);
  const rows = compareVillainRangeScenarios(input.scenarios, { notProvidedLabel });
  const ranked = rows.filter((row): row is VillainRangeSensitivityRow & { difference: number } => row.difference !== null);
  const sortedByDifference = [...ranked].sort((left, right) => right.difference - left.difference);

  const bestRow = sortedByDifference[0] ?? null;
  const worstRow = sortedByDifference.at(-1) ?? null;

  const bestScenario = bestRow
    ? {
        presetName: bestRow.presetName,
        difference: bestRow.difference,
        label: bestRow.label,
        callRangePct: bestRow.callRangePct
      }
    : null;
  const worstScenario = worstRow
    ? {
        presetName: worstRow.presetName,
        difference: worstRow.difference,
        label: worstRow.label,
        callRangePct: worstRow.callRangePct
      }
    : null;

  const explanation = uniqueStrings([
    "This table is assumption-based villain range sensitivity, not a Nash solution.",
    ...(input.explanation ?? [])
  ]);
  const rowLimitations = rows.flatMap((row) => row.limitations);
  const limitations = uniqueStrings([
    "Villain calling ranges are assumptions, not solved equilibrium ranges.",
    ...rowLimitations,
    ...(input.limitations ?? [])
  ]);

  return {
    kind: RANGE_SENSITIVITY_KIND,
    isNash: false,
    scenarioCount: rows.length,
    bestScenario,
    worstScenario,
    rows,
    explanation,
    limitations
  };
}

function toRow(
  scenario: VillainRangeSensitivityScenarioInput,
  notProvidedLabel: string
): VillainRangeSensitivityRow {
  const shoveEV = asFiniteNumber(scenario.shoveEV);
  const foldEV = asFiniteNumber(scenario.foldEV);
  const directDifference = asFiniteNumber(scenario.difference);
  const derivedDifference = shoveEV !== null && foldEV !== null ? round(shoveEV - foldEV) : null;
  const difference = directDifference ?? derivedDifference;
  const label = differenceToLabel(difference);

  return {
    presetName: scenario.presetName,
    callRangePct: asFiniteNumber(scenario.callRangePct),
    callRangePctLabel: formatMetric(asFiniteNumber(scenario.callRangePct), notProvidedLabel),
    shoveEV,
    shoveEVLabel: formatMetric(shoveEV, notProvidedLabel),
    foldEV,
    foldEVLabel: formatMetric(foldEV, notProvidedLabel),
    difference,
    differenceLabel: formatMetric(difference, notProvidedLabel),
    label,
    villainRanges: scenario.villainRanges ? [...scenario.villainRanges] : [],
    assumptions: scenario.assumptions ? [...scenario.assumptions] : [],
    limitations: scenario.limitations ? [...scenario.limitations] : []
  };
}

function differenceToLabel(difference: number | null): VillainRangeSensitivityLabel {
  if (difference === null) {
    return "not_provided";
  }
  if (difference > EPSILON) {
    return "shove_advantage";
  }
  if (difference < -EPSILON) {
    return "fold_advantage";
  }
  return "neutral";
}

function compareRows(left: VillainRangeSensitivityRow, right: VillainRangeSensitivityRow): number {
  const leftOrder = PRESET_ORDER[left.presetName] ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = PRESET_ORDER[right.presetName] ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const nameCompare = left.presetName.localeCompare(right.presetName);
  if (nameCompare !== 0) {
    return nameCompare;
  }

  const leftRange = left.callRangePct ?? Number.MAX_SAFE_INTEGER;
  const rightRange = right.callRangePct ?? Number.MAX_SAFE_INTEGER;
  if (leftRange !== rightRange) {
    return leftRange - rightRange;
  }

  return (left.difference ?? Number.MAX_SAFE_INTEGER) - (right.difference ?? Number.MAX_SAFE_INTEGER);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return round(value);
}

function formatMetric(value: number | null, notProvidedLabel: string): string {
  return value === null ? notProvidedLabel : String(value);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function normalizeNotProvidedLabel(value: string | undefined): string {
  if (!value) {
    return RANGE_SENSITIVITY_NOT_PROVIDED;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : RANGE_SENSITIVITY_NOT_PROVIDED;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

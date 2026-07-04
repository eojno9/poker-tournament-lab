import { RESULT_SOURCES, type AnalyzeResult } from "@poker-tournament-lab/core";

export type EvComparisonMetric = "shoveEV" | "foldEV" | "difference";

export interface EvComparisonRow {
  metric: EvComparisonMetric;
  chipEvValue: number | null;
  chipEvLabel: string;
  icmEvValue: number | null;
  icmEvLabel: string;
}

export interface EvComparisonSummary {
  kind: "CHIPEV_VS_ICM_EV";
  source: typeof RESULT_SOURCES.FALLBACK_ICM;
  isReadOnly: true;
  isDerivedFromExistingPayload: true;
  unit: "prize" | "chips" | "unknown";
  rows: EvComparisonRow[];
  notes: string[];
}

const NOT_PROVIDED = "not_provided";

export function buildEvComparisonFromAnalyzeResult(result: AnalyzeResult): EvComparisonSummary | null {
  if (result.source !== RESULT_SOURCES.FALLBACK_ICM) {
    return null;
  }

  const summary = result.evSummary;
  const unit = summary?.unit ?? "unknown";
  const shoveValue = toFinite(summary?.shoveEv);
  const foldValue = toFinite(summary?.foldEv);
  const differenceValue = toFinite(summary?.deltaEv);

  const rows: EvComparisonRow[] = [
    buildRow("shoveEV", shoveValue, unit),
    buildRow("foldEV", foldValue, unit),
    buildRow("difference", differenceValue, unit)
  ];

  return {
    kind: "CHIPEV_VS_ICM_EV",
    source: RESULT_SOURCES.FALLBACK_ICM,
    isReadOnly: true,
    isDerivedFromExistingPayload: true,
    unit,
    rows,
    notes: [
      "새 계산이 아니라 기존 payload 표시입니다.",
      "ChipEV 값이 payload에 없으면 제공되지 않음으로 표시됩니다.",
      "ICM EV 값이 payload에 없으면 제공되지 않음으로 표시됩니다."
    ]
  };
}

function buildRow(metric: EvComparisonMetric, value: number | null, unit: EvComparisonSummary["unit"]): EvComparisonRow {
  const chipEvValue = unit === "chips" ? value : null;
  const icmEvValue = unit === "prize" ? value : null;
  return {
    metric,
    chipEvValue,
    chipEvLabel: toLabel(chipEvValue),
    icmEvValue,
    icmEvLabel: toLabel(icmEvValue)
  };
}

function toFinite(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(4));
}

function toLabel(value: number | null): string {
  return value === null ? NOT_PROVIDED : String(value);
}

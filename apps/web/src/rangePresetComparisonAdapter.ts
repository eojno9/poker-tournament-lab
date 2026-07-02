import { RESULT_SOURCES, type AnalyzeResult, type FallbackVillainRange } from "@poker-tournament-lab/core";

export interface RangePresetComparisonSummary {
  source: typeof RESULT_SOURCES.FALLBACK_ICM;
  rowCount: number;
  rows: FallbackVillainRange[];
  notes: string[];
}

export function buildRangePresetComparisonFromAnalyzeResult(result: AnalyzeResult): RangePresetComparisonSummary | null {
  if (result.source !== RESULT_SOURCES.FALLBACK_ICM) {
    return null;
  }

  const rows = [...(result.fallbackMetadata?.villainRanges ?? [])].sort((left, right) => left.seat - right.seat);
  return {
    source: RESULT_SOURCES.FALLBACK_ICM,
    rowCount: rows.length,
    rows,
    notes: ["range preset 비교는 solver 결과가 아니라 입력/가정 비교입니다."]
  };
}

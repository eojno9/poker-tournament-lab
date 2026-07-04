import {
  RESULT_SOURCES,
  buildVillainRangeSensitivitySummary,
  type AnalyzeResult,
  type FallbackVillainRange,
  type VillainRangeSensitivitySummary
} from "@poker-tournament-lab/core";

export function buildSensitivitySummaryFromAnalyzeResult(result: AnalyzeResult): VillainRangeSensitivitySummary | null {
  if (result.source !== RESULT_SOURCES.FALLBACK_ICM) {
    return null;
  }

  const villainRanges = result.fallbackMetadata?.villainRanges ?? [];
  const callRangePct = averageCallRangePct(villainRanges);
  const presetName = summarizePresetName(villainRanges);
  const limitations = uniqueStrings([...(result.limitations ?? []), ...(result.fallbackMetadata?.limitations ?? [])]);

  return buildVillainRangeSensitivitySummary({
    scenarios: [
      {
        presetName,
        callRangePct,
        shoveEV: result.evSummary?.shoveEv ?? null,
        foldEV: result.evSummary?.foldEv ?? null,
        difference: result.evSummary?.deltaEv ?? null,
        villainRanges,
        assumptions: result.assumptions ?? [],
        limitations
      }
    ],
    explanation: ["Fallback output only: this is assumption-based sensitivity, not an equilibrium solution."],
    limitations
  });
}

function summarizePresetName(villainRanges: FallbackVillainRange[]): string {
  if (villainRanges.length === 0) {
    return "custom";
  }
  const names = Array.from(new Set(villainRanges.map((item) => item.presetName)));
  return names.length === 1 ? names[0]! : "custom";
}

function averageCallRangePct(villainRanges: FallbackVillainRange[]): number | null {
  if (villainRanges.length === 0) {
    return null;
  }
  const sum = villainRanges.reduce((total, item) => total + item.callRangePct, 0);
  return Number((sum / villainRanges.length).toFixed(4));
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

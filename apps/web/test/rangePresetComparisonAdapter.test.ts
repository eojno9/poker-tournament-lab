import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES, type AnalyzeResult } from "@poker-tournament-lab/core";
import { buildRangePresetComparisonFromAnalyzeResult } from "../src/rangePresetComparisonAdapter.js";

function baseResult(source: AnalyzeResult["source"]): AnalyzeResult {
  return {
    source,
    sourceLabel: source,
    canonicalKey: "test-key",
    assumptions: [],
    limitations: [],
    strategy: null,
    evSummary: null
  };
}

test("builds read-only comparison rows from fallbackMetadata.villainRanges", () => {
  const result: AnalyzeResult = {
    ...baseResult(RESULT_SOURCES.FALLBACK_ICM),
    fallbackMetadata: {
      modelVersion: "fallback-icm-monte-carlo-v1",
      villainRanges: [
        {
          seat: 6,
          position: "BB",
          presetName: "custom",
          editedByUser: true,
          callRangePct: 18.5,
          rangeSource: "user_override"
        },
        {
          seat: 2,
          position: "HJ",
          presetName: "tight",
          editedByUser: false,
          callRangePct: 12,
          rangeSource: "preset"
        }
      ],
      limitations: []
    }
  };

  const summary = buildRangePresetComparisonFromAnalyzeResult(result);
  assert.ok(summary);
  assert.equal(summary?.rowCount, 2);
  assert.equal(summary?.rows[0]?.seat, 2);
  assert.equal(summary?.rows[1]?.seat, 6);
  assert.equal(summary?.notes[0], "range preset 비교는 solver 결과가 아니라 입력/가정 비교입니다.");
});

test("returns empty rows when fallbackMetadata.villainRanges is missing", () => {
  const summary = buildRangePresetComparisonFromAnalyzeResult(baseResult(RESULT_SOURCES.FALLBACK_ICM));
  assert.ok(summary);
  assert.equal(summary?.rowCount, 0);
  assert.deepEqual(summary?.rows, []);
});

test("returns null for non-fallback sources", () => {
  assert.equal(buildRangePresetComparisonFromAnalyzeResult(baseResult(RESULT_SOURCES.HRC_PRECOMPUTED_DB)), null);
  assert.equal(buildRangePresetComparisonFromAnalyzeResult(baseResult(RESULT_SOURCES.NOT_SOLVED)), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES, type AnalyzeResult } from "@poker-tournament-lab/core";
import { buildSensitivitySummaryFromAnalyzeResult } from "../src/sensitivityAdapter.js";

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

test("builds sensitivity summary from FALLBACK_ICM result", () => {
  const result: AnalyzeResult = {
    ...baseResult(RESULT_SOURCES.FALLBACK_ICM),
    assumptions: ["seat-level assumptions"],
    limitations: ["Regular NLHE push/fold only."],
    evSummary: {
      unit: "prize",
      shoveEv: 0.12,
      foldEv: 0.05,
      deltaEv: 0.07,
      bestAction: "SHOVE"
    },
    fallbackMetadata: {
      modelVersion: "fallback-icm-monte-carlo-v1",
      villainRanges: [
        {
          seat: 6,
          position: "BB",
          presetName: "standard",
          editedByUser: false,
          callRangePct: 16,
          rangeSource: "preset"
        }
      ],
      limitations: ["This is an ICM EV evaluation, not a Nash solution."]
    }
  };

  const summary = buildSensitivitySummaryFromAnalyzeResult(result);

  assert.ok(summary);
  assert.equal(summary?.kind, "VILLAIN_RANGE_SENSITIVITY");
  assert.equal(summary?.scenarioCount, 1);
  assert.equal(summary?.rows[0]?.presetName, "standard");
  assert.equal(summary?.rows[0]?.difference, 0.07);
});

test("returns not_provided labels when fallback EV fields are missing", () => {
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
        }
      ],
      limitations: []
    },
    evSummary: {
      unit: "prize"
    }
  };

  const summary = buildSensitivitySummaryFromAnalyzeResult(result);
  assert.ok(summary);
  assert.equal(summary?.rows[0]?.differenceLabel, "not_provided");
  assert.equal(summary?.bestScenario, null);
  assert.equal(summary?.worstScenario, null);
});

test("returns null for HRC_PRECOMPUTED_DB", () => {
  const summary = buildSensitivitySummaryFromAnalyzeResult(baseResult(RESULT_SOURCES.HRC_PRECOMPUTED_DB));
  assert.equal(summary, null);
});

test("returns null for NOT_SOLVED", () => {
  const summary = buildSensitivitySummaryFromAnalyzeResult(baseResult(RESULT_SOURCES.NOT_SOLVED));
  assert.equal(summary, null);
});

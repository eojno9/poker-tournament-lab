import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES, type AnalyzeResult } from "@poker-tournament-lab/core";
import { buildEvComparisonFromAnalyzeResult } from "../src/evComparisonAdapter.js";

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

test("builds ICM EV comparison from FALLBACK_ICM payload", () => {
  const result: AnalyzeResult = {
    ...baseResult(RESULT_SOURCES.FALLBACK_ICM),
    evSummary: {
      unit: "prize",
      shoveEv: 0.12,
      foldEv: 0.05,
      deltaEv: 0.07,
      bestAction: "SHOVE"
    }
  };

  const summary = buildEvComparisonFromAnalyzeResult(result);
  assert.ok(summary);
  assert.equal(summary?.rows[0]?.metric, "shoveEV");
  assert.equal(summary?.rows[0]?.icmEvLabel, "0.12");
  assert.equal(summary?.rows[0]?.chipEvLabel, "not_provided");
});

test("returns ChipEV as not_provided when payload has only ICM unit", () => {
  const result: AnalyzeResult = {
    ...baseResult(RESULT_SOURCES.FALLBACK_ICM),
    evSummary: {
      unit: "prize",
      shoveEv: 0.09,
      foldEv: 0.02,
      deltaEv: 0.07
    }
  };

  const summary = buildEvComparisonFromAnalyzeResult(result);
  assert.ok(summary);
  assert.equal(summary?.rows.every((row) => row.chipEvLabel === "not_provided"), true);
});

test("returns not_provided labels when EV values are missing", () => {
  const result: AnalyzeResult = {
    ...baseResult(RESULT_SOURCES.FALLBACK_ICM),
    evSummary: {
      unit: "prize"
    }
  };
  const summary = buildEvComparisonFromAnalyzeResult(result);
  assert.ok(summary);
  assert.equal(summary?.rows.every((row) => row.icmEvLabel === "not_provided"), true);
  assert.equal(summary?.rows.every((row) => row.chipEvLabel === "not_provided"), true);
});

test("returns null for HRC_PRECOMPUTED_DB results", () => {
  const summary = buildEvComparisonFromAnalyzeResult(baseResult(RESULT_SOURCES.HRC_PRECOMPUTED_DB));
  assert.equal(summary, null);
});

test("returns null for NOT_SOLVED results", () => {
  const summary = buildEvComparisonFromAnalyzeResult(baseResult(RESULT_SOURCES.NOT_SOLVED));
  assert.equal(summary, null);
});

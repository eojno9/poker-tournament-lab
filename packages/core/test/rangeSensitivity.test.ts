import { describe, expect, it } from "vitest";
import {
  RANGE_SENSITIVITY_KIND,
  buildVillainRangeSensitivitySummary,
  compareVillainRangeScenarios,
  type VillainRangeSensitivityScenarioInput
} from "../src/index.js";

describe("villain range sensitivity", () => {
  it("returns empty summary for zero scenarios", () => {
    const summary = buildVillainRangeSensitivitySummary({ scenarios: [] });

    expect(summary.kind).toBe(RANGE_SENSITIVITY_KIND);
    expect(summary.isNash).toBe(false);
    expect(summary.scenarioCount).toBe(0);
    expect(summary.rows).toHaveLength(0);
    expect(summary.bestScenario).toBeNull();
    expect(summary.worstScenario).toBeNull();
  });

  it("compares tight/standard/loose rows with deterministic ordering", () => {
    const rows = compareVillainRangeScenarios([
      { presetName: "standard", callRangePct: 16, shoveEV: 0.01, foldEV: 0 },
      { presetName: "loose", callRangePct: 22, shoveEV: -0.02, foldEV: 0 },
      { presetName: "tight", callRangePct: 12, shoveEV: 0.05, foldEV: 0 }
    ]);

    expect(rows.map((row) => row.presetName)).toEqual(["tight", "standard", "loose"]);
    expect(rows.map((row) => row.label)).toEqual(["shove_advantage", "shove_advantage", "fold_advantage"]);
  });

  it("calculates best and worst scenarios from difference values", () => {
    const summary = buildVillainRangeSensitivitySummary({
      scenarios: [
        { presetName: "tight", difference: 0.04 },
        { presetName: "standard", difference: 0.01 },
        { presetName: "loose", difference: -0.03 }
      ]
    });

    expect(summary.bestScenario).toMatchObject({
      presetName: "tight",
      difference: 0.04,
      label: "shove_advantage"
    });
    expect(summary.worstScenario).toMatchObject({
      presetName: "loose",
      difference: -0.03,
      label: "fold_advantage"
    });
  });

  it("returns not_provided labels when EV fields are missing", () => {
    const rows = compareVillainRangeScenarios([{ presetName: "standard", callRangePct: 16 }]);
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row?.shoveEV).toBeNull();
    expect(row?.foldEV).toBeNull();
    expect(row?.difference).toBeNull();
    expect(row?.shoveEVLabel).toBe("not_provided");
    expect(row?.differenceLabel).toBe("not_provided");
    expect(row?.label).toBe("not_provided");
  });

  it("derives difference from shoveEV and foldEV when difference is missing", () => {
    const rows = compareVillainRangeScenarios([{ presetName: "tight", shoveEV: 0.07, foldEV: 0.02 }]);
    expect(rows[0]?.difference).toBe(0.05);
    expect(rows[0]?.label).toBe("shove_advantage");
  });

  it("keeps custom preset and propagates assumptions/limitations", () => {
    const scenarios: VillainRangeSensitivityScenarioInput[] = [
      {
        presetName: "custom",
        callRangePct: 18.5,
        difference: -0.01,
        assumptions: ["custom override"],
        limitations: ["small sample"],
        villainRanges: [
          {
            seat: 6,
            position: "BB",
            presetName: "custom",
            editedByUser: true,
            callRangePct: 18.5,
            rangeSource: "user_override"
          }
        ]
      }
    ];
    const summary = buildVillainRangeSensitivitySummary({ scenarios });
    expect(summary.rows[0]?.presetName).toBe("custom");
    expect(summary.rows[0]?.callRangePct).toBe(18.5);
    expect(summary.rows[0]?.assumptions).toEqual(["custom override"]);
    expect(summary.rows[0]?.limitations).toEqual(["small sample"]);
    expect(summary.rows[0]?.villainRanges[0]?.rangeSource).toBe("user_override");
  });

  it("always includes non-Nash explanation", () => {
    const summary = buildVillainRangeSensitivitySummary({
      scenarios: [{ presetName: "standard", difference: 0 }]
    });
    expect(summary.explanation.join(" ")).toContain("not a Nash solution");
    expect(summary.limitations.join(" ")).toContain("assumptions");
  });

  it("is stable even when input order changes", () => {
    const first = compareVillainRangeScenarios([
      { presetName: "loose", difference: -0.01 },
      { presetName: "tight", difference: 0.02 },
      { presetName: "standard", difference: 0.01 }
    ]);
    const second = compareVillainRangeScenarios([
      { presetName: "standard", difference: 0.01 },
      { presetName: "loose", difference: -0.01 },
      { presetName: "tight", difference: 0.02 }
    ]);

    expect(first).toEqual(second);
  });

  it("builds neutral label when difference is effectively zero", () => {
    const rows = compareVillainRangeScenarios([{ presetName: "standard", difference: 0 }]);
    expect(rows[0]?.label).toBe("neutral");
  });
});

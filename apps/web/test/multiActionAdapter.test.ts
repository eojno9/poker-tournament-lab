import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES, type AnalyzeResult, type HandStrategy } from "@poker-tournament-lab/core";
import type { SolutionListItem } from "../src/api.js";
import {
  buildHandActionDetail,
  buildMultiActionFromAnalyzeResult,
  buildMultiActionFromSolution
} from "../src/multiActionAdapter.js";
import { defaultSpot } from "../src/sampleData.js";

test("converts HRC solution strategy into multi-action view", () => {
  const view = buildMultiActionFromSolution(makeSolutionRow());

  assert.ok(view);
  assert.equal(view.source, RESULT_SOURCES.HRC_PRECOMPUTED_DB);
  assert.equal(view.isReadOnlyLegacyAdapter, true);
  assert.equal(view.hands.length, 2);
  assert.ok(view.actionKinds.includes("ALL_IN"));
});

test("converts fallback result strategy into multi-action view", () => {
  const result = makeAnalyzeResult({
    source: RESULT_SOURCES.FALLBACK_ICM,
    sourceLabel: "Fallback ICM",
    strategy: {
      AA: { action: "SHOVE", frequency: 1, evPush: 0.2 }
    }
  });
  const view = buildMultiActionFromAnalyzeResult(result);

  assert.ok(view);
  assert.equal(view.source, RESULT_SOURCES.FALLBACK_ICM);
  assert.equal(view.hands[0]?.actions[0]?.action, "ALL_IN");
});

test("uses stored multi-action v2 actions directly from solution strategy", () => {
  const view = buildMultiActionFromSolution(
    makeSolutionRow({
      strategy: makeV2Strategy()
    })
  );

  assert.ok(view);
  assert.equal(view.isReadOnlyLegacyAdapter, false);
  assert.equal(view.strategyMode, "multi-action-v2");
  const detail = buildHandActionDetail(view, "AKs");
  assert.equal(detail?.actions.length, 2);
  assert.equal(detail?.actions[0]?.action, "RAISE");
  assert.equal(detail?.actions[0]?.size?.sizeBb, 2.2);
  assert.equal(detail?.actions[0]?.frequency, 0.55);
  assert.equal(detail?.actions[0]?.ev, 0.18);
  assert.equal(detail?.actions[0]?.chipEv, 0.21);
  assert.equal(detail?.actions[0]?.icmEv, 0.18);
  assert.equal(detail?.actions[1]?.action, "ALL_IN");
  assert.equal(detail?.actions[1]?.size?.isAllIn, true);
});

test("uses stored multi-action v2 actions directly from analyze result", () => {
  const result = makeAnalyzeResult({
    source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
    strategy: makeV2Strategy() as AnalyzeResult["strategy"]
  });
  const view = buildMultiActionFromAnalyzeResult(result);

  assert.ok(view);
  assert.equal(view.strategyMode, "multi-action-v2");
  assert.equal(view.hasMixedActions, true);
  assert.ok(view.actionKinds.includes("RAISE"));
  assert.ok(view.actionKinds.includes("ALL_IN"));
});

test("preserves v2 missing EV fields as not provided values", () => {
  const view = buildMultiActionFromSolution(
    makeSolutionRow({
      strategy: makeV2Strategy({
        AQs: {
          hand: "AQs",
          actions: [
            {
              action: "CALL",
              size: null,
              frequency: 1,
              ev: null,
              chipEv: null,
              icmEv: null,
              sourceActionLabel: "Call",
              warnings: ["CALL size is not provided"]
            }
          ],
          totalFrequency: 1,
          warnings: ["CALL size is not provided"]
        }
      })
    })
  );

  assert.ok(view);
  const action = buildHandActionDetail(view, "AQs")?.actions[0];
  assert.equal(action?.action, "CALL");
  assert.equal(action?.ev, null);
  assert.equal(action?.chipEv, null);
  assert.equal(action?.icmEv, null);
  assert.ok(action?.warnings.some((item) => item.includes("size")));
});

test("returns null for NOT_SOLVED", () => {
  const result = makeAnalyzeResult({
    source: RESULT_SOURCES.NOT_SOLVED,
    sourceLabel: "Not solved",
    strategy: null
  });

  assert.equal(buildMultiActionFromAnalyzeResult(result), null);
});

test("converts single action entry into one actions item", () => {
  const view = buildMultiActionFromSolution(
    makeSolutionRow({
      strategy: {
        AKo: { action: "FOLD", frequency: 1, evFold: 0.01 }
      }
    })
  );

  assert.ok(view);
  const detail = buildHandActionDetail(view, "AKo");
  assert.equal(detail?.actions.length, 1);
  assert.equal(detail?.actions[0]?.action, "FOLD");
  assert.equal(detail?.actions[0]?.ev, 0.01);
});

test("preserves missing EV as not provided label", () => {
  const view = buildMultiActionFromSolution(
    makeSolutionRow({
      strategy: {
        KQo: { action: "FOLD", frequency: 1 }
      }
    })
  );

  assert.ok(view);
  const action = buildHandActionDetail(view, "KQo")?.actions[0];
  assert.equal(action?.ev, null);
  assert.equal(action?.evLabel, "제공되지 않음");
});

test("adds size missing warning for call action", () => {
  const view = buildMultiActionFromSolution(
    makeSolutionRow({
      strategy: {
        AQs: { action: "CALL", frequency: 1 } as HandStrategy
      }
    })
  );

  assert.ok(view);
  const action = buildHandActionDetail(view, "AQs")?.actions[0];
  assert.equal(action?.action, "CALL");
  assert.ok(action?.warnings.some((item) => item.includes("size")));
});

test("maps all-in action with all-in size", () => {
  const view = buildMultiActionFromSolution(makeSolutionRow());

  assert.ok(view);
  const action = buildHandActionDetail(view, "AA")?.actions[0];
  assert.equal(action?.action, "ALL_IN");
  assert.equal(action?.size?.isAllIn, true);
});

test("uses raise size label detected from solution metadata", () => {
  const view = buildMultiActionFromSolution(
    makeSolutionRow({
      spot: {
        ...defaultSpot,
        actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"]
      },
      strategy: {
        AJs: { action: "RAISE", frequency: 1 } as HandStrategy
      }
    })
  );

  assert.ok(view);
  const action = buildHandActionDetail(view, "AJs")?.actions[0];
  assert.equal(action?.action, "RAISE");
  assert.equal(action?.size?.rawSizeLabel, "2.2bb");
});

test("finds hand detail case-insensitively", () => {
  const view = buildMultiActionFromSolution(makeSolutionRow());

  assert.ok(view);
  assert.equal(buildHandActionDetail(view, "aa")?.hand, "AA");
  assert.equal(buildHandActionDetail(view, "missing"), null);
});

function makeSolutionRow(overrides: Partial<SolutionListItem> = {}): SolutionListItem {
  const base: SolutionListItem = {
    id: 1,
    importId: 1,
    canonicalKey: "canonical-test",
    sourceLabel: "HRC",
    externalId: null,
    importedAt: "2026-06-04T00:00:00.000Z",
    fileName: "mtt_6p_rfi_20bb.zip",
    fileHash: "hash",
    databaseFeatures: {
      fileName: "mtt_6p_rfi_20bb.zip",
      playerCount: 6,
      stackDepthBb: 20,
      treeDepth: 4,
      calculationModel: "ChipEV",
      spotFamily: "RFI",
      actionTags: ["RFI"],
      streetScope: "PREFLOP_ONLY",
      preflopOnly: true,
      preflopOnlyReason: null,
      exportShape: "complete_export",
      warnings: []
    },
    spot: defaultSpot,
    strategy: {
      AA: { action: "SHOVE", frequency: 1, evPush: 0.12 },
      "22": { action: "FOLD", frequency: 1, evFold: 0 }
    },
    evSummary: null
  };
  return { ...base, ...overrides };
}

function makeAnalyzeResult(overrides: Partial<AnalyzeResult>): AnalyzeResult {
  return {
    source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
    sourceLabel: "HRC",
    canonicalKey: "canonical-test",
    assumptions: [],
    limitations: [],
    strategy: {
      AA: { action: "SHOVE", frequency: 1, evPush: 0.1 }
    },
    evSummary: null,
    ...overrides
  };
}

function makeV2Strategy(overrides: Record<string, unknown> = {}): SolutionListItem["strategy"] {
  return {
    AKs: {
      hand: "AKs",
      actions: [
        {
          action: "RAISE",
          size: { sizeBb: 2.2, rawSizeLabel: "2.2bb" },
          frequency: 0.55,
          ev: 0.18,
          chipEv: 0.21,
          icmEv: 0.18,
          sourceActionLabel: "Raise 2.2bb",
          warnings: []
        },
        {
          action: "ALL_IN",
          size: { isAllIn: true },
          frequency: 0.45,
          ev: 0.16,
          chipEv: 0.19,
          icmEv: 0.16,
          sourceActionLabel: "Jam",
          warnings: []
        }
      ],
      totalFrequency: 1,
      warnings: []
    },
    ...overrides
  } as unknown as SolutionListItem["strategy"];
}

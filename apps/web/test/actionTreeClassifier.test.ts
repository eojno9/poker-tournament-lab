import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActionTreeBreadcrumb,
  classifyActionTreeSpot,
  extractAvailableActionKinds,
  extractAvailableSizeLabels
} from "../src/actionTreeClassifier.js";
import { actionTreeClassifierSamples } from "./fixtures/actionTreeSampleV2Fixtures.js";

function assertIncludesAll(actual: readonly string[], expected: readonly string[]): void {
  for (const value of expected) {
    assert.ok(actual.includes(value), `Expected ${JSON.stringify(actual)} to include ${value}`);
  }
}

test("classifies OPEN_SHOVE_ONLY as push/fold open shove", () => {
  const result = classifyActionTreeSpot({
    treeConfig: "OPEN_SHOVE_ONLY",
    actions: [
      { action: "FOLD", frequency: 0.4 },
      { action: "SHOVE", frequency: 0.6 }
    ]
  });

  assert.equal(result.spotType, "PUSH_FOLD");
  assert.equal(result.actionNode, "OPEN_SHOVE");
  assert.deepEqual(result.availableActions, ["FOLD", "ALL_IN"]);
});

test("classifies RFI tree config as open raise", () => {
  const result = classifyActionTreeSpot({
    source: "MTT ICM",
    heroPosition: "BTN",
    tableSize: 6,
    heroStackBb: 25,
    treeConfig: "RFI_OPEN_RAISE",
    actions: [{ action: "RAISE", size: { sizeBb: 2.2 }, frequency: 0.55 }]
  });

  assert.equal(result.spotType, "RFI");
  assert.equal(result.actionNode, "OPEN_RAISE");
  assert.deepEqual(result.availableSizes, ["2.2bb"]);
  assert.deepEqual(result.breadcrumbItems, ["MTT ICM", "6-max", "BTN", "25bb", "RFI 2.2bb"]);
});

test("keeps RFI when source metadata has incidental limp keyword", () => {
  const result = classifyActionTreeSpot({
    treeConfig: "RFI",
    sourceMetadata: {
      spotFamily: "RFI",
      actionTags: ["RFI", "OPEN"],
      preflopOnlyReason: "file_name_limp_keyword"
    },
    actions: [{ action: "RAISE", sizeBb: 2.2, frequency: 1 }]
  });

  assert.equal(result.spotType, "RFI");
  assert.equal(result.actionNode, "OPEN_RAISE");
});

test("classifies LIMP action kind without merging it into CALL", () => {
  const result = classifyActionTreeSpot({
    actionPath: ["FIRST_IN_LIMP"],
    actions: [
      { action: "LIMP", frequency: 0.3 },
      { action: "RAISE", sizeBb: 2.5, frequency: 0.7 }
    ]
  });

  assert.equal(result.spotType, "LIMP");
  assert.equal(result.actionNode, "OPEN_LIMP");
  assert.deepEqual(result.availableActions, ["LIMP", "RAISE"]);
});

test("keeps CALL distinct from LIMP when only facing-open metadata exists", () => {
  const result = classifyActionTreeSpot({
    actionPath: ["FACING_OPEN", "BTN_OPEN_2.2BB"],
    actions: [{ action: "CALL", rawSizeLabel: "call amount", frequency: 0.5 }]
  });

  assert.equal(result.spotType, "FACING_OPEN");
  assert.equal(result.actionNode, "VS_OPEN");
  assert.deepEqual(result.availableActions, ["CALL"]);
  assert.equal(result.warnings.some((warning) => warning.includes("LIMP")), false);
});

test("marks CALL-only first-in limp metadata as LIMP candidate with warning", () => {
  const result = classifyActionTreeSpot({
    treeConfig: "OPEN_LIMP",
    actions: [{ action: "CALL", frequency: 1 }]
  });

  assert.equal(result.spotType, "LIMP");
  assert.equal(result.actionNode, "OPEN_LIMP");
  assert.deepEqual(result.availableActions, ["CALL"]);
  assert.ok(result.warnings.some((warning) => warning.includes("LIMP 후보")));
});

test("classifies facing open from action path", () => {
  const result = classifyActionTreeSpot({
    actionPath: ["BB", "DEFEND_VS_OPEN"],
    actions: [{ action: "CALL", rawSizeLabel: "call amount", frequency: 0.4 }]
  });

  assert.equal(result.spotType, "FACING_OPEN");
  assert.equal(result.actionNode, "VS_OPEN");
});

test("classifies facing limp from action path", () => {
  const result = classifyActionTreeSpot({
    actionPath: ["BTN_LIMP", "ISO_VS_LIMP"],
    actions: [{ action: "RAISE", sizeBb: 3.5, frequency: 0.8 }]
  });

  assert.equal(result.spotType, "FACING_LIMP");
  assert.equal(result.actionNode, "VS_LIMP");
});

test("classifies 3bet and vs 3bet signals without treating them as plain raise", () => {
  const threeBet = classifyActionTreeSpot({
    treeConfig: "CO_OPEN_BTN_3BET",
    actions: [{ action: "RAISE", sizeBb: 7.5, frequency: 0.25 }]
  });
  const vsThreeBet = classifyActionTreeSpot({
    treeConfig: "FACING_3BET",
    actions: [{ action: "CALL", rawSizeLabel: "call 7.5bb", frequency: 0.2 }]
  });

  assert.equal(threeBet.spotType, "THREE_BET");
  assert.equal(threeBet.actionNode, "THREE_BET");
  assert.equal(vsThreeBet.spotType, "VS_THREE_BET");
  assert.equal(vsThreeBet.actionNode, "VS_THREE_BET");
});

test("dedupes available actions from strategy", () => {
  const actions = extractAvailableActionKinds({
    strategy: {
      AKo: { actions: [{ action: "RAISE" }, { action: "RAISE" }, { action: "ALL_IN" }] },
      KQo: { action: "FOLD" }
    }
  });

  assert.deepEqual(actions, ["FOLD", "RAISE", "ALL_IN"]);
});

test("extracts available sizes from explicit action sizes", () => {
  const sizes = extractAvailableSizeLabels({
    actions: [
      { action: "RAISE", sizeBb: 2.2 },
      { action: "RAISE", size: { sizeBb: 2.2 } },
      { action: "BET", sizePctPot: 50 },
      { action: "ALL_IN" }
    ]
  });

  assert.deepEqual(sizes, ["2.2bb", "50% pot", "all-in"]);
});

test("keeps ALL_IN valid without explicit size", () => {
  const result = classifyActionTreeSpot({
    actions: [{ action: "ALL_IN", frequency: 1 }]
  });

  assert.deepEqual(result.availableActions, ["ALL_IN"]);
  assert.deepEqual(result.availableSizes, ["all-in"]);
  assert.equal(result.warnings.some((warning) => warning.includes("size")), false);
});

test("adds missing size warning for RAISE BET and CALL", () => {
  const result = classifyActionTreeSpot({
    treeConfig: "RFI_OPEN_RAISE",
    actions: [{ action: "RAISE" }, { action: "BET" }, { action: "CALL" }]
  });

  assert.ok(result.availableSizes.includes("사이즈 미지정"));
  assert.ok(result.warnings.some((warning) => warning.includes("RAISE size")));
  assert.ok(result.warnings.some((warning) => warning.includes("BET size")));
  assert.ok(result.warnings.some((warning) => warning.includes("CALL size")));
});

test("adds warning for unknown classification and unknown action", () => {
  const result = classifyActionTreeSpot({
    actions: [{ action: "mystery" }]
  });

  assert.equal(result.spotType, "UNKNOWN");
  assert.equal(result.actionNode, "UNKNOWN");
  assert.deepEqual(result.availableActions, ["UNKNOWN"]);
  assert.ok(result.warnings.some((warning) => warning.includes("분류 신호")));
  assert.ok(result.warnings.some((warning) => warning.includes("UNKNOWN action")));
});

test("builds breadcrumb from available metadata", () => {
  const breadcrumb = buildActionTreeBreadcrumb({
    source: "MTT ICM",
    tableSize: 6,
    heroPosition: "BTN",
    heroStackBb: 25,
    treeConfig: "RFI_OPEN_RAISE",
    actions: [{ action: "RAISE", sizeBb: 2.2 }]
  });

  assert.deepEqual(breadcrumb, ["MTT ICM", "6-max", "BTN", "25bb", "RFI 2.2bb"]);
});

test("handles empty input safely", () => {
  const result = classifyActionTreeSpot();

  assert.equal(result.spotType, "UNKNOWN");
  assert.equal(result.actionNode, "UNKNOWN");
  assert.deepEqual(result.availableActions, []);
  assert.deepEqual(result.availableSizes, []);
  assert.deepEqual(result.breadcrumbItems, ["UNKNOWN"]);
  assert.ok(result.warnings.some((warning) => warning.includes("분류 신호")));
});
for (const sample of actionTreeClassifierSamples) {
  test(`classifies TEST_ONLY action tree sample: ${sample.name}`, () => {
    const result = classifyActionTreeSpot(sample.input);

    assert.equal(result.spotType, sample.expectedSpotType);
    assert.equal(result.actionNode, sample.expectedActionNode);
    assertIncludesAll(result.availableActions, sample.expectedActions);
    assertIncludesAll(result.availableSizes, sample.expectedSizes);
    assert.ok(result.breadcrumbItems.length > 0);
    assert.notEqual(result.breadcrumbItems[0], "UNKNOWN");
  });
}

test("keeps TEST_ONLY metadata explicit on action tree samples", () => {
  for (const sample of actionTreeClassifierSamples) {
    const sourceMetadata = sample.input.sourceMetadata;

    assert.equal(sourceMetadata.isSample, true);
    assert.equal(sourceMetadata.testOnly, true);
    assert.equal(sourceMetadata.calculationModel, "TEST_ONLY_SAMPLE");
    assert.equal(sourceMetadata.streetScope, "PREFLOP");
    assert.equal(sourceMetadata.exportShape, "MULTI_ACTION_V2_SAMPLE");
    assert.ok(sample.input.source.includes("SAMPLE_TEST_ONLY"));
    assertIncludesAll(sourceMetadata.actionTags, ["SAMPLE", "TEST_ONLY"]);
  }
});

test("keeps TEST_ONLY LIMP sample separate from CALL", () => {
  const sample = actionTreeClassifierSamples.find((candidate) => candidate.name === "Limp");
  if (!sample) {
    throw new Error("Missing TEST_ONLY Limp sample fixture");
  }

  const result = classifyActionTreeSpot(sample.input);

  assert.equal(result.spotType, "LIMP");
  assert.equal(result.actionNode, "OPEN_LIMP");
  assert.ok(result.availableActions.includes("LIMP"));
  assert.equal(result.availableActions.includes("CALL"), false);
});

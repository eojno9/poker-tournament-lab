import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrowserV2HandCell,
  buildBrowserV2Model,
  formatBrowserEv,
  formatBrowserFrequency,
  getPrimaryBrowserAction,
  groupBrowserActionsByKind,
  groupBrowserActionsBySize,
  summarizeBrowserV2Actions
} from "../src/browserV2Model.js";
import { browserV2LegacyStrategySample, browserV2StrategySample } from "./fixtures/browserV2Strategy.sample.js";

test("builds a mixed action cell from v2 RAISE 55% plus ALL_IN 45%", () => {
  const model = buildBrowserV2Model(browserV2StrategySample);
  const hand = model.hands.find((item) => item.hand === "AKo");

  assert.ok(hand);
  assert.equal(model.strategyMode, "multi-action-v2");
  assert.equal(hand.isMixedAction, true);
  assert.equal(hand.actionCount, 2);
  assert.equal(hand.primaryAction, "RAISE");
  assert.equal(hand.primaryActionLabel, "RAISE");
  assert.equal(hand.primaryFrequency, 0.55);
  assert.equal(hand.primaryFrequencyLabel, "55%");
  assert.equal(hand.totalFrequencyLabel, "100%");
  assert.equal(hand.actions[0]?.sizeLabel, "2.2bb");
  assert.equal(hand.actions[1]?.sizeLabel, "all-in");
});

test("selects the primary action by largest known frequency", () => {
  const hand = buildBrowserV2HandCell("AQs", [
    { action: "CALL", size: { rawSizeLabel: "call amount" }, frequency: 0.35, ev: 0.03 },
    { action: "RAISE", size: { sizeBb: 2.2 }, frequency: 0.65, ev: 0.04 }
  ]);

  assert.equal(getPrimaryBrowserAction(hand.actions), "RAISE");
  assert.equal(hand.primaryAction, "RAISE");
});

test("extracts available action kinds and size labels", () => {
  const model = buildBrowserV2Model(browserV2StrategySample);

  assert.deepEqual(model.availableActionKinds, ["FOLD", "RAISE", "ALL_IN"]);
  assert.deepEqual(model.availableSizeLabels, ["2.2bb", "2.5bb", "all-in", "none"]);
});

test("groups actions by kind and size", () => {
  const model = buildBrowserV2Model(browserV2StrategySample);
  const actionSummary = groupBrowserActionsByKind(model.hands.flatMap((hand) => hand.actions));
  const sizeSummary = groupBrowserActionsBySize(model.hands.flatMap((hand) => hand.actions));

  assert.equal(actionSummary.find((row) => row.key === "RAISE")?.count, 2);
  assert.equal(sizeSummary.find((row) => row.key === "2.2bb")?.count, 1);
  assert.equal(sizeSummary.find((row) => row.key === "all-in")?.count, 1);
});

test("formats missing frequency and EV as not provided", () => {
  assert.equal(formatBrowserFrequency(null), "제공되지 않음");
  assert.equal(formatBrowserEv(null), "제공되지 않음");

  const hand = buildBrowserV2HandCell("KJs", [{ action: "FOLD", frequency: null, ev: null }]);
  const action = hand.actions[0];
  assert.equal(action?.frequencyLabel, "제공되지 않음");
  assert.equal(action?.evLabel, "제공되지 않음");
  assert.equal(action?.missingEv, true);
});

test("adds missing size warning for RAISE BET and CALL", () => {
  const hand = buildBrowserV2HandCell("AQo", [
    { action: "CALL", frequency: 1, ev: 0.01 },
    { action: "BET", frequency: 0.5, ev: 0.02 },
    { action: "RAISE", frequency: 0.5, ev: 0.03 }
  ]);

  assert.equal(hand.missingSize, true);
  assert.equal(hand.actions[0]?.sizeLabel, "사이즈 미지정");
  assert.ok(hand.actions[0]?.warnings.some((warning) => warning.includes("size")));
  assert.ok(hand.actions[1]?.warnings.some((warning) => warning.includes("size")));
  assert.ok(hand.actions[2]?.warnings.some((warning) => warning.includes("size")));
});

test("keeps ALL_IN valid without explicit size", () => {
  const hand = buildBrowserV2HandCell("AA", [{ action: "ALL_IN", frequency: 1, ev: 0.2 }]);
  const action = hand.actions[0];

  assert.equal(action?.action, "ALL_IN");
  assert.equal(action?.sizeLabel, "all-in");
  assert.equal(action?.missingSize, false);
  assert.equal(action?.warnings.some((warning) => warning.includes("size")), false);
});

test("marks UNKNOWN actions with warning", () => {
  const hand = buildBrowserV2HandCell("JTs", [{ action: "mystery", frequency: 1, ev: 0 }]);

  assert.equal(hand.unknownAction, true);
  assert.equal(hand.actions[0]?.action, "UNKNOWN");
  assert.ok(hand.actions[0]?.warnings.some((warning) => warning.includes("UNKNOWN")));
});

test("reports frequency total above one", () => {
  const hand = buildBrowserV2HandCell("QQ", [
    { action: "RAISE", size: { sizeBb: 2.2 }, frequency: 0.7, ev: 0.2 },
    { action: "ALL_IN", frequency: 0.6, ev: 0.1 }
  ]);

  assert.ok(hand.totalFrequency !== null && Math.abs(hand.totalFrequency - 1.3) < 0.000001);
  assert.ok(hand.frequencyWarnings.some((warning) => warning.includes("exceeds 1")));
});

test("chooses bestEvAction only from actions with actual EV", () => {
  const hand = buildBrowserV2HandCell("K9s", [
    { action: "FOLD", frequency: 0.5, ev: null },
    { action: "CALL", size: { rawSizeLabel: "call amount" }, frequency: 0.25, ev: 0.03 },
    { action: "RAISE", size: { sizeBb: 2.5 }, frequency: 0.25, ev: 0.05 }
  ]);

  assert.equal(hand.bestEvAction?.action, "RAISE");
  assert.equal(hand.bestEvAction?.ev, 0.05);
});

test("handles v1 legacy one-action strategy", () => {
  const model = buildBrowserV2Model(browserV2LegacyStrategySample);

  assert.equal(model.strategyMode, "legacy-adapter");
  assert.equal(model.handCount, 2);
  assert.equal(model.hands.find((hand) => hand.hand === "AA")?.primaryAction, "ALL_IN");
  assert.equal(model.hands.find((hand) => hand.hand === "72o")?.primaryAction, "FOLD");
});

test("handles empty actions without inventing values", () => {
  const hand = buildBrowserV2HandCell("T9s", []);
  const model = buildBrowserV2Model({});
  const summary = summarizeBrowserV2Actions(hand.actions);

  assert.equal(hand.actionCount, 0);
  assert.equal(hand.primaryAction, "UNKNOWN");
  assert.equal(hand.bestEvAction, null);
  assert.equal(model.strategyMode, "empty");
  assert.equal(summary.actionKinds.length, 0);
});

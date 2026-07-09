import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES } from "@poker-tournament-lab/core";
import { buildTrainerSummary } from "../src/trainerSummary.js";
import type { TrainerHistoryEntry } from "../src/trainerHistory.js";

function makeEntry(index: number, overrides: Partial<TrainerHistoryEntry> = {}): TrainerHistoryEntry {
  const isCorrect = overrides.isCorrect ?? true;
  return {
    id: `entry-${index}`,
    createdAt: new Date(Date.UTC(2026, 5, 1, 0, index, 0)).toISOString(),
    canonicalKey: overrides.canonicalKey ?? `key-${index}`,
    hand: overrides.hand ?? "AKo",
    selectedAction: overrides.selectedAction ?? "SHOVE",
    correctAction: overrides.correctAction ?? (isCorrect ? "SHOVE" : "FOLD"),
    isCorrect,
    frequency: overrides.frequency ?? 0.5,
    ev: overrides.ev ?? null,
    evLabel: overrides.evLabel ?? "제공되지 않음",
    source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
    spotSummary: overrides.spotSummary ?? {
      heroPosition: "BTN",
      tableSize: 6,
      heroStackBb: 18,
      treeConfig: "open_shove_only",
      actionPath: ["FOLD", "HERO_DECISION"]
    },
    ...overrides
  };
}

test("returns empty summary for no records", () => {
  const summary = buildTrainerSummary([], []);
  assert.equal(summary.totalAttempts, 0);
  assert.equal(summary.correctCount, 0);
  assert.equal(summary.incorrectCount, 0);
  assert.equal(summary.accuracyPct, null);
  assert.equal(summary.recentWindowAttempts, 0);
  assert.equal(summary.recentWindowAccuracyPct, null);
  assert.equal(summary.mistakeCount, 0);
  assert.equal(summary.unresolvedMistakeCount, 0);
  assert.equal(summary.resolvedMistakeCount, 0);
  assert.equal(summary.dismissedMistakeCount, 0);
  assert.equal(summary.latestResult, null);
  assert.equal(summary.mostRecentMistake, null);
  assert.deepEqual(summary.byHand, []);
  assert.deepEqual(summary.byPosition, []);
  assert.deepEqual(summary.byAction, []);
});

test("calculates all-correct accuracy", () => {
  const recent = [makeEntry(0), makeEntry(1), makeEntry(2)];
  const summary = buildTrainerSummary(recent, []);
  assert.equal(summary.totalAttempts, 3);
  assert.equal(summary.correctCount, 3);
  assert.equal(summary.incorrectCount, 0);
  assert.equal(summary.accuracyPct, 100);
  assert.equal(summary.mistakeCount, 0);
});

test("calculates mixed accuracy and recent-window accuracy", () => {
  const recent = [
    makeEntry(0, { isCorrect: true, hand: "AKo" }),
    makeEntry(1, { isCorrect: false, hand: "AKo" }),
    makeEntry(2, { isCorrect: true, hand: "K8s" }),
    makeEntry(3, { isCorrect: false, hand: "K8s" }),
    makeEntry(4, { isCorrect: true, hand: "22" })
  ];
  const mistakes = [recent[1]!, recent[3]!];
  const summary = buildTrainerSummary(recent, mistakes, { recentWindowSize: 3 });

  assert.equal(summary.totalAttempts, 5);
  assert.equal(summary.correctCount, 3);
  assert.equal(summary.incorrectCount, 2);
  assert.equal(summary.accuracyPct, 60);
  assert.equal(summary.recentWindowAttempts, 3);
  assert.equal(summary.recentWindowAccuracyPct, 66.67);
  assert.equal(summary.mistakeCount, 2);
  assert.equal(summary.unresolvedMistakeCount, 2);
});

test("picks latest result and most recent mistake", () => {
  const first = makeEntry(0, { isCorrect: true, hand: "AKo" });
  const second = makeEntry(1, { isCorrect: false, hand: "KQo" });
  const third = makeEntry(2, { isCorrect: true, hand: "K8s" });
  const summary = buildTrainerSummary([first, second, third], [second]);

  assert.equal(summary.latestResult?.id, first.id);
  assert.equal(summary.mostRecentMistake?.id, second.id);
});

test("builds byHand aggregates", () => {
  const recent = [
    makeEntry(0, { hand: "AKo", isCorrect: true }),
    makeEntry(1, { hand: "AKo", isCorrect: false }),
    makeEntry(2, { hand: "AKo", isCorrect: true }),
    makeEntry(3, { hand: "K8s", isCorrect: false }),
    makeEntry(4, { hand: "22", isCorrect: true })
  ];
  const summary = buildTrainerSummary(recent, [], { maxByHandRows: 3 });

  assert.equal(summary.byHand.length, 3);
  assert.equal(summary.byHand[0]?.hand, "AKo");
  assert.equal(summary.byHand[0]?.attempts, 3);
  assert.equal(summary.byHand[0]?.correctCount, 2);
  assert.equal(summary.byHand[0]?.incorrectCount, 1);
  assert.equal(summary.byHand[0]?.accuracyPct, 66.67);
});

test("counts mistake statuses safely", () => {
  const unresolved = makeEntry(0, { isCorrect: false, status: "unresolved" });
  const resolved = makeEntry(1, { isCorrect: false, status: "resolved" });
  const dismissed = makeEntry(2, { isCorrect: false, status: "dismissed" });
  const legacy = makeEntry(3, { isCorrect: false });

  const summary = buildTrainerSummary([], [unresolved, resolved, dismissed, legacy]);

  assert.equal(summary.mistakeCount, 4);
  assert.equal(summary.unresolvedMistakeCount, 2);
  assert.equal(summary.resolvedMistakeCount, 1);
  assert.equal(summary.dismissedMistakeCount, 1);
});

test("builds byPosition and byAction local stat buckets", () => {
  const recent = [
    makeEntry(0, { isCorrect: true, selectedAction: "SHOVE", spotSummary: { heroPosition: "BTN", tableSize: 6, heroStackBb: 18, treeConfig: "open_shove_only", actionPath: [] } }),
    makeEntry(1, { isCorrect: false, selectedAction: "SHOVE", spotSummary: { heroPosition: "BTN", tableSize: 6, heroStackBb: 18, treeConfig: "open_shove_only", actionPath: [] } }),
    makeEntry(2, { isCorrect: true, selectedAction: "FOLD", spotSummary: { heroPosition: "SB", tableSize: 6, heroStackBb: 12, treeConfig: "open_shove_only", actionPath: [] } })
  ];

  const summary = buildTrainerSummary(recent, []);

  assert.equal(summary.byPosition[0]?.label, "BTN");
  assert.equal(summary.byPosition[0]?.attempts, 2);
  assert.equal(summary.byPosition[0]?.accuracyPct, 50);
  assert.equal(summary.byAction[0]?.label, "SHOVE");
  assert.equal(summary.byAction[0]?.attempts, 2);
  assert.equal(summary.byAction[0]?.accuracyPct, 50);
});

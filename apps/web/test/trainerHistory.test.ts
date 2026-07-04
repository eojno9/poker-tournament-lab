import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES, type TrainerProblemSpotSummary } from "@poker-tournament-lab/core";
import {
  TRAINER_MISTAKES_STORAGE_KEY,
  TRAINER_RECENT_STORAGE_KEY,
  addTrainerMistakeHistory,
  addTrainerRecentHistory,
  clearTrainerMistakesHistory,
  clearTrainerRecentHistory,
  loadTrainerMistakesHistory,
  loadTrainerRecentHistory,
  type StorageLike
} from "../src/trainerHistory.js";

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const summary: TrainerProblemSpotSummary = {
  heroPosition: "BTN",
  tableSize: 6,
  heroStackBb: 18,
  treeConfig: "open_shove_only",
  actionPath: ["FOLD", "FOLD", "HERO_DECISION"]
};

test("stores trainer recent in newest-first order and dedupes same key/hand/action", () => {
  const storage = new MemoryStorage();

  addTrainerRecentHistory(
    {
      canonicalKey: "key-a",
      hand: "K8s",
      selectedAction: "SHOVE",
      correctAction: "SHOVE",
      isCorrect: true,
      frequency: 0.45,
      ev: 0.02,
      evLabel: "0.02",
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      spotSummary: summary
    },
    storage,
    new Date("2026-06-01T00:00:00.000Z")
  );

  addTrainerRecentHistory(
    {
      canonicalKey: "key-a",
      hand: "K8s",
      selectedAction: "FOLD",
      correctAction: "SHOVE",
      isCorrect: false,
      frequency: 0.45,
      ev: null,
      evLabel: "제공되지 않음",
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      spotSummary: summary
    },
    storage,
    new Date("2026-06-01T00:01:00.000Z")
  );

  const next = addTrainerRecentHistory(
    {
      canonicalKey: "key-a",
      hand: "K8s",
      selectedAction: "SHOVE",
      correctAction: "SHOVE",
      isCorrect: true,
      frequency: 0.45,
      ev: 0.03,
      evLabel: "0.03",
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      spotSummary: summary
    },
    storage,
    new Date("2026-06-01T00:02:00.000Z")
  );

  assert.equal(next.length, 2);
  assert.equal(next[0]?.selectedAction, "SHOVE");
  assert.equal(next[0]?.evLabel, "0.03");
  assert.equal(next[1]?.selectedAction, "FOLD");
});

test("keeps maximum 30 trainer recent entries", () => {
  const storage = new MemoryStorage();
  for (let i = 0; i < 35; i += 1) {
    addTrainerRecentHistory(
      {
        canonicalKey: `key-${i}`,
        hand: "AJo",
        selectedAction: "SHOVE",
        correctAction: "SHOVE",
        isCorrect: true,
        frequency: 1,
        ev: 0.1,
        evLabel: "0.1",
        source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
        spotSummary: summary
      },
      storage,
      new Date(`2026-06-01T00:${String(i).padStart(2, "0")}:00.000Z`)
    );
  }
  const loaded = loadTrainerRecentHistory(storage);
  assert.equal(loaded.length, 30);
  assert.equal(loaded[0]?.canonicalKey, "key-34");
  assert.equal(loaded[29]?.canonicalKey, "key-5");
});

test("stores only incorrect answers in mistakes and keeps maximum 50", () => {
  const storage = new MemoryStorage();
  addTrainerMistakeHistory(
    {
      canonicalKey: "correct-entry",
      hand: "ATs",
      selectedAction: "SHOVE",
      correctAction: "SHOVE",
      isCorrect: true,
      frequency: 0.9,
      ev: 0.11,
      evLabel: "0.11",
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      spotSummary: summary
    },
    storage
  );
  assert.equal(loadTrainerMistakesHistory(storage).length, 0);

  for (let i = 0; i < 55; i += 1) {
    addTrainerMistakeHistory(
      {
        canonicalKey: `mistake-${i}`,
        hand: "KTo",
        selectedAction: "FOLD",
        correctAction: "SHOVE",
        isCorrect: false,
        frequency: 0.4,
        ev: null,
        evLabel: "제공되지 않음",
        source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
        spotSummary: summary
      },
      storage,
      new Date(`2026-06-01T01:${String(i).padStart(2, "0")}:00.000Z`)
    );
  }

  const mistakes = loadTrainerMistakesHistory(storage);
  assert.equal(mistakes.length, 50);
  assert.equal(mistakes[0]?.canonicalKey, "mistake-54");
  assert.equal(mistakes[49]?.canonicalKey, "mistake-5");
});

test("returns safe fallback for corrupted localStorage payload", () => {
  const storage = new MemoryStorage();
  storage.setItem(TRAINER_RECENT_STORAGE_KEY, "{broken");
  storage.setItem(TRAINER_MISTAKES_STORAGE_KEY, "{broken");
  assert.deepEqual(loadTrainerRecentHistory(storage), []);
  assert.deepEqual(loadTrainerMistakesHistory(storage), []);
});

test("clear functions reset both histories", () => {
  const storage = new MemoryStorage();
  addTrainerRecentHistory(
    {
      canonicalKey: "clear-test-recent",
      hand: "QTs",
      selectedAction: "SHOVE",
      correctAction: "SHOVE",
      isCorrect: true,
      frequency: 0.6,
      ev: 0.01,
      evLabel: "0.01",
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      spotSummary: summary
    },
    storage
  );
  addTrainerMistakeHistory(
    {
      canonicalKey: "clear-test-mistake",
      hand: "QTo",
      selectedAction: "FOLD",
      correctAction: "SHOVE",
      isCorrect: false,
      frequency: 0.6,
      ev: null,
      evLabel: "제공되지 않음",
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      spotSummary: summary
    },
    storage
  );

  clearTrainerRecentHistory(storage);
  clearTrainerMistakesHistory(storage);
  assert.deepEqual(loadTrainerRecentHistory(storage), []);
  assert.deepEqual(loadTrainerMistakesHistory(storage), []);
});

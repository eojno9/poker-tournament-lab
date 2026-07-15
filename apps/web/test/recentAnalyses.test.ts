import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_SOURCES } from "@poker-tournament-lab/core";
import { defaultAnalyzeFormState } from "../src/analyzeForm.js";
import { defaultSpot } from "../src/sampleData.js";
import {
  RECENT_ANALYSES_STORAGE_KEY,
  addRecentAnalysis,
  clearRecentAnalyses,
  deleteRecentAnalysis,
  loadRecentAnalyses,
  type StorageLike
} from "../src/recentAnalyses.js";

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("storage_read_failed");
  }

  setItem(): void {
    throw new Error("storage_write_failed");
  }
}

test("stores and loads recent analyses in latest-first order", () => {
  const storage = new MemoryStorage();
  const formState = defaultAnalyzeFormState(defaultSpot);
  formState.heroPosition = "BTN";

  addRecentAnalysis(
    {
      formState,
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      sourceLabel: "HRC precomputed DB",
      summary: {
        heroPosition: "BTN",
        tableSize: 6,
        heroStackBb: 18,
        treeConfig: "open_shove_only",
        resultSource: RESULT_SOURCES.HRC_PRECOMPUTED_DB
      },
      metadata: {
        canonicalKey: "recent-key-1"
      }
    },
    storage,
    new Date("2026-06-01T00:00:00.000Z")
  );

  const next = addRecentAnalysis(
    {
      formState,
      source: RESULT_SOURCES.FALLBACK_ICM,
      sourceLabel: "Fallback ICM EV evaluator",
      summary: {
        heroPosition: "BTN",
        tableSize: 6,
        heroStackBb: 18,
        treeConfig: "open_shove_only",
        resultSource: RESULT_SOURCES.FALLBACK_ICM
      },
      metadata: {
        modelVersion: "fallback-icm-v1"
      }
    },
    storage,
    new Date("2026-06-01T01:00:00.000Z")
  );

  assert.equal(next.length, 2);
  assert.equal(next[0]?.source, RESULT_SOURCES.FALLBACK_ICM);
  assert.equal(next[1]?.source, RESULT_SOURCES.HRC_PRECOMPUTED_DB);
  assert.equal(next[0]?.metadata.modelVersion, "fallback-icm-v1");
});

test("deletes single entry and clears all entries", () => {
  const storage = new MemoryStorage();
  const formState = defaultAnalyzeFormState(defaultSpot);

  const list = addRecentAnalysis(
    {
      formState,
      source: RESULT_SOURCES.NOT_SOLVED,
      sourceLabel: "NOT_SOLVED",
      summary: {
        heroPosition: "CO",
        tableSize: 6,
        heroStackBb: 12,
        treeConfig: "open_shove_only",
        resultSource: RESULT_SOURCES.NOT_SOLVED
      },
      metadata: {
        missingRequirements: ["payouts required"]
      }
    },
    storage,
    new Date("2026-06-01T00:00:00.000Z")
  );
  assert.equal(list.length, 1);

  const deleted = deleteRecentAnalysis(list[0]!.id, storage);
  assert.equal(deleted.length, 0);

  addRecentAnalysis(
    {
      formState,
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      sourceLabel: "HRC precomputed DB",
      summary: {
        heroPosition: "CO",
        tableSize: 6,
        heroStackBb: 12,
        treeConfig: "open_shove_only",
        resultSource: RESULT_SOURCES.HRC_PRECOMPUTED_DB
      },
      metadata: {}
    },
    storage
  );

  clearRecentAnalyses(storage);
  assert.deepEqual(loadRecentAnalyses(storage), []);
});

test("keeps maximum 20 recent entries", () => {
  const storage = new MemoryStorage();
  const formState = defaultAnalyzeFormState(defaultSpot);

  for (let i = 0; i < 25; i += 1) {
    addRecentAnalysis(
      {
        formState,
        source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
        sourceLabel: "HRC precomputed DB",
        summary: {
          heroPosition: "CO",
          tableSize: 6,
          heroStackBb: 12,
          treeConfig: "open_shove_only",
          resultSource: RESULT_SOURCES.HRC_PRECOMPUTED_DB
        },
        metadata: {
          canonicalKey: `recent-${i}`
        }
      },
      storage,
      new Date(`2026-06-01T00:${String(i).padStart(2, "0")}:00.000Z`)
    );
  }

  const loaded = loadRecentAnalyses(storage);
  assert.equal(loaded.length, 20);
  assert.equal(loaded[0]?.metadata.canonicalKey, "recent-24");
  assert.equal(loaded[19]?.metadata.canonicalKey, "recent-5");
});

test("returns safe fallback for corrupted localStorage", () => {
  const storage = new MemoryStorage();
  storage.setItem(RECENT_ANALYSES_STORAGE_KEY, "{broken");
  assert.deepEqual(loadRecentAnalyses(storage), []);
});

test("contains storage I/O failures without interrupting analysis", () => {
  const storage = new ThrowingStorage();
  const formState = defaultAnalyzeFormState(defaultSpot);

  assert.deepEqual(loadRecentAnalyses(storage), []);
  assert.doesNotThrow(() =>
    addRecentAnalysis(
      {
        formState,
        source: RESULT_SOURCES.NOT_SOLVED,
        sourceLabel: "NOT_SOLVED",
        summary: {
          heroPosition: "BTN",
          tableSize: 6,
          heroStackBb: 18,
          treeConfig: "open_shove_only",
          resultSource: RESULT_SOURCES.NOT_SOLVED
        },
        metadata: {}
      },
      storage
    )
  );
  assert.doesNotThrow(() => clearRecentAnalyses(storage));
});

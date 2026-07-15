import assert from "node:assert/strict";
import test from "node:test";
import { defaultAnalyzeFormState } from "../src/analyzeForm.js";
import {
  ANALYZE_PRESETS_STORAGE_KEY,
  applyAnalyzePreset,
  deleteAnalyzePreset,
  loadAnalyzePresets,
  saveAnalyzePreset,
  type StorageLike
} from "../src/analyzePresets.js";
import { defaultSpot } from "../src/sampleData.js";

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

test("saves, applies, and deletes analyze presets", () => {
  const storage = new MemoryStorage();
  const formState = defaultAnalyzeFormState(defaultSpot);
  formState.heroPosition = "BTN";
  formState.tableSize = 6;

  const saved = saveAnalyzePreset({ name: "6max BTN 18bb", formState }, storage, new Date("2026-06-01T00:00:00.000Z"));
  const loaded = loadAnalyzePresets(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.name, "6max BTN 18bb");
  assert.equal(loaded[0]?.id, saved.id);

  const applied = applyAnalyzePreset(saved.id, storage);
  assert.ok(applied);
  assert.equal(applied?.formState.heroPosition, "BTN");

  if (applied) {
    applied.formState.heroPosition = "SB";
  }
  const loadedAgain = loadAnalyzePresets(storage);
  assert.equal(loadedAgain[0]?.formState.heroPosition, "BTN");

  const afterDelete = deleteAnalyzePreset(saved.id, storage);
  assert.equal(afterDelete.length, 0);
});

test("allows duplicate preset names and keeps separate records", () => {
  const storage = new MemoryStorage();
  const formA = defaultAnalyzeFormState(defaultSpot);
  const formB = defaultAnalyzeFormState(defaultSpot);
  formB.heroSeat = 2;

  const first = saveAnalyzePreset({ name: "RFI 20bb", formState: formA }, storage, new Date("2026-06-01T00:00:00.000Z"));
  const second = saveAnalyzePreset({ name: "RFI 20bb", formState: formB }, storage, new Date("2026-06-01T01:00:00.000Z"));

  const loaded = loadAnalyzePresets(storage);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]?.name, "RFI 20bb");
  assert.equal(loaded[1]?.name, "RFI 20bb");
  assert.notEqual(first.id, second.id);
});

test("returns safe fallback when localStorage payload is broken", () => {
  const storage = new MemoryStorage();
  storage.setItem(ANALYZE_PRESETS_STORAGE_KEY, "{broken-json");
  assert.deepEqual(loadAnalyzePresets(storage), []);
  assert.equal(applyAnalyzePreset("missing-id", storage), null);
});

test("contains storage read failures and reports preset write failure safely", () => {
  const storage = new ThrowingStorage();
  assert.deepEqual(loadAnalyzePresets(storage), []);
  assert.throws(
    () => saveAnalyzePreset({ name: "safe preset", formState: defaultAnalyzeFormState(defaultSpot) }, storage),
    /localStorage_unavailable/
  );
});

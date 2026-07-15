import assert from "node:assert/strict";
import test from "node:test";
import {
  safeReadStorage,
  safeRemoveStorage,
  safeWriteStorage,
  type StorageLike
} from "../src/safeStorage.js";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error("private storage read detail");
  }

  setItem(): void {
    throw new Error("private storage write detail");
  }

  removeItem(): void {
    throw new Error("private storage remove detail");
  }
}

test("safe storage reads existing and missing values", () => {
  const storage = new MemoryStorage();
  storage.setItem("saved", "value");

  assert.deepEqual(safeReadStorage(storage, "saved"), { ok: true, value: "value" });
  assert.deepEqual(safeReadStorage(storage, "missing"), { ok: true, value: null });
});

test("safe storage catches read failures and unavailable storage", () => {
  assert.deepEqual(safeReadStorage(new ThrowingStorage(), "saved"), { ok: false, value: null });
  assert.deepEqual(safeReadStorage(null, "saved"), { ok: false, value: null });
});

test("safe storage reports write success and failure without throwing", () => {
  const storage = new MemoryStorage();
  assert.equal(safeWriteStorage(storage, "saved", "value"), true);
  assert.equal(storage.getItem("saved"), "value");
  assert.equal(safeWriteStorage(new ThrowingStorage(), "saved", "value"), false);
  assert.equal(safeWriteStorage(null, "saved", "value"), false);
});

test("safe storage reports remove success and failure without throwing", () => {
  const storage = new MemoryStorage();
  storage.setItem("saved", "value");
  assert.equal(safeRemoveStorage(storage, "saved"), true);
  assert.equal(storage.getItem("saved"), null);
  assert.equal(safeRemoveStorage(new ThrowingStorage(), "saved"), false);
  assert.equal(safeRemoveStorage({ getItem: () => null, setItem: () => undefined }, "saved"), false);
  assert.equal(safeRemoveStorage(null, "saved"), false);
});

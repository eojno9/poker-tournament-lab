export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type StorageReadResult =
  | { ok: true; value: string | null }
  | { ok: false; value: null };

export function resolveStorage(): StorageLike | null {
  try {
    const maybeStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
    return maybeStorage ?? null;
  } catch {
    return null;
  }
}

export function safeReadStorage(storage: StorageLike | null, key: string): StorageReadResult {
  if (!storage) {
    return { ok: false, value: null };
  }
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false, value: null };
  }
}

export function safeWriteStorage(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveStorage(storage: StorageLike | null, key: string): boolean {
  if (!storage?.removeItem) {
    return false;
  }
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

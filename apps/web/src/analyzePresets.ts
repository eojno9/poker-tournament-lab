import type { AnalyzeFormState } from "./analyzeForm.js";

export interface AnalyzePreset {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  formState: AnalyzeFormState;
}

export interface AnalyzePresetDraft {
  name: string;
  formState: AnalyzeFormState;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface AnalyzePresetEnvelope {
  version: number;
  presets: AnalyzePreset[];
}

const ANALYZE_PRESETS_VERSION = 1;
export const ANALYZE_PRESETS_STORAGE_KEY = "poker-tournament-lab:analyze-presets:v1";

export function loadAnalyzePresets(storage: StorageLike | null = resolveStorage()): AnalyzePreset[] {
  if (!storage) {
    return [];
  }
  const raw = storage.getItem(ANALYZE_PRESETS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as AnalyzePresetEnvelope).presets)
        ? (parsed as AnalyzePresetEnvelope).presets
        : [];
    return candidates.map(normalizePreset).filter((preset): preset is AnalyzePreset => preset !== null);
  } catch {
    return [];
  }
}

export function saveAnalyzePreset(
  draft: AnalyzePresetDraft,
  storage: StorageLike | null = resolveStorage(),
  now: Date = new Date()
): AnalyzePreset {
  if (!storage) {
    throw new Error("localStorage_unavailable");
  }
  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    throw new Error("preset_name_required");
  }

  const timestamp = now.toISOString();
  const preset: AnalyzePreset = {
    id: createPresetId(),
    name: trimmedName,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: ANALYZE_PRESETS_VERSION,
    formState: cloneFormState(draft.formState)
  };

  const existing = loadAnalyzePresets(storage);
  writePresets(storage, [preset, ...existing]);
  return preset;
}

export function deleteAnalyzePreset(id: string, storage: StorageLike | null = resolveStorage()): AnalyzePreset[] {
  if (!storage) {
    return [];
  }
  const next = loadAnalyzePresets(storage).filter((preset) => preset.id !== id);
  writePresets(storage, next);
  return next;
}

export function applyAnalyzePreset(id: string, storage: StorageLike | null = resolveStorage()): AnalyzePreset | null {
  const presets = loadAnalyzePresets(storage);
  return presets.find((preset) => preset.id === id) ?? null;
}

function writePresets(storage: StorageLike, presets: AnalyzePreset[]): void {
  const envelope: AnalyzePresetEnvelope = {
    version: ANALYZE_PRESETS_VERSION,
    presets
  };
  storage.setItem(ANALYZE_PRESETS_STORAGE_KEY, JSON.stringify(envelope));
}

function normalizePreset(candidate: unknown): AnalyzePreset | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  const input = candidate as Partial<AnalyzePreset>;
  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    return null;
  }
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return null;
  }
  if (!input.formState || typeof input.formState !== "object") {
    return null;
  }

  const createdAt = normalizeIsoTimestamp(input.createdAt);
  const updatedAt = normalizeIsoTimestamp(input.updatedAt ?? input.createdAt);

  return {
    id: input.id,
    name: input.name.trim(),
    createdAt,
    updatedAt,
    version: typeof input.version === "number" && Number.isFinite(input.version) ? input.version : ANALYZE_PRESETS_VERSION,
    formState: cloneFormState(input.formState as AnalyzeFormState)
  };
}

function normalizeIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    return new Date(0).toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function cloneFormState(state: AnalyzeFormState): AnalyzeFormState {
  return JSON.parse(JSON.stringify(state)) as AnalyzeFormState;
}

function createPresetId(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function resolveStorage(): StorageLike | null {
  const maybeStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  return maybeStorage ?? null;
}

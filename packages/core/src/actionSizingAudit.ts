import { canonicalSpotKey } from "./canonical.js";
import type { SpotInput, StrategyMatrix } from "./types.js";

export type DetectedAction = "FOLD" | "CALL" | "RAISE" | "SHOVE" | "ALL_IN" | "UNKNOWN";
export type SizeSource = "EXPLICIT_FIELD" | "ACTION_PATH_TOKEN" | "TREE_CONFIG_TOKEN" | "SOURCE_METADATA_TOKEN";

export interface SizeSignal {
  source: SizeSource;
  valueBb: number | null;
  raw: string;
  confidence: "high" | "medium" | "low";
}

export interface ActionSizingAuditInput {
  spot: SpotInput;
  treeConfig?: string | null;
  strategy?: StrategyMatrix | null;
  sourceMetadata?: Record<string, unknown> | null;
}

export interface CanonicalSensitivityReport {
  baseCanonicalKey: string;
  actionPathVariantCanonicalKey: string;
  actionPathAffectsCanonicalKey: boolean;
  treeConfigAffectsCanonicalKey: boolean;
  sizeTokenInActionPathAffectsCanonicalKey: boolean;
  sizeTokenInTreeConfigAffectsCanonicalKey: boolean;
  warnings: string[];
}

export interface ActionSizingAuditReport {
  detectedActions: DetectedAction[];
  sizeSignals: SizeSignal[];
  explicitSizeFieldPaths: string[];
  canonicalSensitivity: CanonicalSensitivityReport;
  risks: string[];
}

export function buildActionSizingAudit(input: ActionSizingAuditInput): ActionSizingAuditReport {
  const detectedActions = detectActions(input.spot.actionPath, input.strategy);
  const explicitSizeFields = collectExplicitSizeFields(input.spot);
  const actionPathSignals = parseSizeSignalsFromTokens(input.spot.actionPath, "ACTION_PATH_TOKEN");
  const treeConfigSignals = parseSizeSignalsFromTreeConfig(input.treeConfig);
  const metadataSignals = parseSizeSignalsFromMetadata(input.sourceMetadata);

  const sizeSignals = dedupeSizeSignals([
    ...explicitSizeFields.signals,
    ...actionPathSignals,
    ...treeConfigSignals,
    ...metadataSignals
  ]);

  const canonicalSensitivity = auditCanonicalSensitivity(input.spot, input.treeConfig);
  const risks: string[] = [];

  if (sizeSignals.length === 0) {
    risks.push("size-related signal was not found in explicit fields/actionPath/treeConfig/source metadata");
  }
  if (!canonicalSensitivity.treeConfigAffectsCanonicalKey) {
    risks.push("treeConfig differences are not represented in canonical key");
  }
  if (!canonicalSensitivity.sizeTokenInTreeConfigAffectsCanonicalKey) {
    risks.push("size tokens inside treeConfig are not represented in canonical key");
  }

  return {
    detectedActions,
    sizeSignals,
    explicitSizeFieldPaths: explicitSizeFields.paths,
    canonicalSensitivity,
    risks
  };
}

export function auditCanonicalSensitivity(spot: SpotInput, treeConfig?: string | null): CanonicalSensitivityReport {
  const baseCanonicalKey = canonicalSpotKey(spot);

  const actionPathVariant = {
    ...spot,
    actionPath: mutateActionPath(spot.actionPath)
  };
  const actionPathVariantCanonicalKey = canonicalSpotKey(actionPathVariant);
  const actionPathAffectsCanonicalKey = actionPathVariantCanonicalKey !== baseCanonicalKey;

  const sizePathVariant = {
    ...spot,
    actionPath: mutateActionPathSizeToken(spot.actionPath)
  };
  const sizeTokenInActionPathAffectsCanonicalKey = canonicalSpotKey(sizePathVariant) !== baseCanonicalKey;

  // Current canonicalSpotKey is spot-only and does not include treeConfig.
  const baseTreeConfig = normalizeTreeConfig(treeConfig);
  const treeConfigVariant = baseTreeConfig === "OPEN_SHOVE_ONLY" ? "OPEN_2.2BB" : "OPEN_SHOVE_ONLY";
  const treeConfigAffectsCanonicalKey = baseCanonicalKey !== canonicalSpotKey(spot);
  const sizeTokenInTreeConfigAffectsCanonicalKey = baseCanonicalKey !== canonicalSpotKey(spot);

  const warnings: string[] = [];
  if (!treeConfigAffectsCanonicalKey) {
    warnings.push("treeConfig is currently outside canonical key input");
  }
  if (hasTreeConfigSizeToken(baseTreeConfig) || hasTreeConfigSizeToken(treeConfigVariant)) {
    warnings.push("treeConfig size token changes are currently outside canonical key input");
  }

  return {
    baseCanonicalKey,
    actionPathVariantCanonicalKey,
    actionPathAffectsCanonicalKey,
    treeConfigAffectsCanonicalKey,
    sizeTokenInActionPathAffectsCanonicalKey,
    sizeTokenInTreeConfigAffectsCanonicalKey,
    warnings
  };
}

function detectActions(actionPath: string[], strategy: StrategyMatrix | null | undefined): DetectedAction[] {
  const actions = new Set<DetectedAction>();
  for (const token of actionPath) {
    actions.add(normalizeActionToken(token));
  }
  if (strategy) {
    for (const hand of Object.keys(strategy)) {
      const action = strategy[hand]?.action;
      if (action === "SHOVE") {
        actions.add("SHOVE");
      } else if (action === "FOLD") {
        actions.add("FOLD");
      } else if (action === "MIXED") {
        actions.add("UNKNOWN");
      }
    }
  }
  if (actions.size === 0) {
    actions.add("UNKNOWN");
  }
  return Array.from(actions);
}

function normalizeActionToken(rawToken: string): DetectedAction {
  const token = String(rawToken ?? "").toUpperCase();
  if (token.includes("SHOVE")) {
    return "SHOVE";
  }
  if (token.includes("ALLIN") || token.includes("ALL_IN") || token.includes("ALL-IN") || token.includes("JAM")) {
    return "ALL_IN";
  }
  if (token.includes("RAISE") || token.includes("OPEN") || token.includes("3BET") || token.includes("4BET")) {
    return "RAISE";
  }
  if (token.includes("CALL")) {
    return "CALL";
  }
  if (token.includes("FOLD")) {
    return "FOLD";
  }
  return "UNKNOWN";
}

function collectExplicitSizeFields(input: unknown): { paths: string[]; signals: SizeSignal[] } {
  const paths: string[] = [];
  const signals: SizeSignal[] = [];
  walk(input, "", (path, key, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }
    const normalizedKey = key.toLowerCase();
    if (!isSizeFieldName(normalizedKey)) {
      return;
    }
    paths.push(path);
    signals.push({
      source: "EXPLICIT_FIELD",
      valueBb: Number(value.toFixed(3)),
      raw: `${path}=${value}`,
      confidence: "high"
    });
  });
  return { paths, signals };
}

function parseSizeSignalsFromTokens(actionPath: string[], source: "ACTION_PATH_TOKEN"): SizeSignal[] {
  const signals: SizeSignal[] = [];
  for (const token of actionPath) {
    signals.push(...extractSizeSignalsFromText(token, source));
  }
  return signals;
}

function parseSizeSignalsFromTreeConfig(treeConfig?: string | null): SizeSignal[] {
  if (!treeConfig) {
    return [];
  }
  return extractSizeSignalsFromText(treeConfig, "TREE_CONFIG_TOKEN");
}

function parseSizeSignalsFromMetadata(sourceMetadata?: Record<string, unknown> | null): SizeSignal[] {
  if (!sourceMetadata) {
    return [];
  }
  const signals: SizeSignal[] = [];
  walk(sourceMetadata, "", (path, key, value) => {
    if (typeof value === "string") {
      for (const signal of extractSizeSignalsFromText(value, "SOURCE_METADATA_TOKEN")) {
        signals.push({
          ...signal,
          raw: `${path}:${signal.raw}`
        });
      }
      return;
    }
    if (typeof value === "number" && Number.isFinite(value) && isSizeFieldName(key.toLowerCase())) {
      signals.push({
        source: "SOURCE_METADATA_TOKEN",
        valueBb: Number(value.toFixed(3)),
        raw: `${path}=${value}`,
        confidence: "medium"
      });
    }
  });
  return signals;
}

function extractSizeSignalsFromText(rawText: string, source: SizeSource): SizeSignal[] {
  const text = String(rawText ?? "");
  const signals: SizeSignal[] = [];
  const matches = text.matchAll(/(\d+(?:\.\d+)?)\s*(?:BB|bb)\b/g);
  for (const match of matches) {
    const rawValue = match[1];
    if (!rawValue) {
      continue;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    signals.push({
      source,
      valueBb: Number(parsed.toFixed(3)),
      raw: match[0],
      confidence: source === "ACTION_PATH_TOKEN" ? "high" : "medium"
    });
  }
  if (signals.length === 0 && /ALL[_-]?IN|JAM|SHOVE/i.test(text)) {
    signals.push({
      source,
      valueBb: null,
      raw: "all-in token",
      confidence: "low"
    });
  }
  return signals;
}

function dedupeSizeSignals(signals: SizeSignal[]): SizeSignal[] {
  const map = new Map<string, SizeSignal>();
  for (const signal of signals) {
    const key = `${signal.source}|${signal.valueBb ?? "null"}|${signal.raw}`;
    if (!map.has(key)) {
      map.set(key, signal);
    }
  }
  return Array.from(map.values());
}

function mutateActionPath(actionPath: string[]): string[] {
  if (actionPath.length === 0) {
    return ["HERO_DECISION_VARIANT"];
  }
  return actionPath.map((token, index) => (index === actionPath.length - 1 ? `${token}_VARIANT` : token));
}

function mutateActionPathSizeToken(actionPath: string[]): string[] {
  if (actionPath.length === 0) {
    return ["OPEN_2.2BB", "HERO_DECISION"];
  }
  const updated = [...actionPath];
  const index = updated.findIndex((token) => /\d+(?:\.\d+)?\s*(?:BB|bb)\b/.test(token));
  if (index >= 0) {
    updated[index] = updated[index]!.replace(/(\d+(?:\.\d+)?)\s*(BB|bb)\b/, (_m, n, unit) => {
      const current = Number(n);
      const next = Number.isFinite(current) ? (current + 0.1).toFixed(1) : "2.3";
      return `${next}${unit}`;
    });
    return updated;
  }
  updated[0] = `${updated[0]}_2.2BB`;
  return updated;
}

function normalizeTreeConfig(input: string | null | undefined): string {
  return String(input ?? "").trim().toUpperCase();
}

function hasTreeConfigSizeToken(treeConfig: string): boolean {
  return /\d+(?:\.\d+)?\s*(?:BB|bb)\b/.test(treeConfig);
}

function isSizeFieldName(key: string): boolean {
  return (
    key === "sizebb" ||
    key === "raisebb" ||
    key === "raisesize" ||
    key === "raisesizebb" ||
    key === "opensize" ||
    key === "opensizebb" ||
    key === "callamount" ||
    key === "callamountbb" ||
    key === "allin" ||
    key === "allinbb"
  );
}

function walk(
  value: unknown,
  currentPath: string,
  visitor: (path: string, key: string, leafValue: unknown) => void
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${currentPath}[${index}]`, visitor));
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    const child = object[key];
    visitor(nextPath, key, child);
    walk(child, nextPath, visitor);
  }
}

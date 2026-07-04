import {
  buildMultiActionHandStrategy,
  buildMultiActionStrategyMatrix,
  normalizeMultiActionKind,
  RESULT_SOURCES,
  type AnalyzeResult,
  type HandStrategy,
  type MultiActionHandStrategy,
  type MultiActionHandStrategyInput,
  type MultiActionKind,
  type MultiActionOptionInput,
  type MultiActionSizeInput,
  type ResultSource,
  type StrategyMatrix
} from "@poker-tournament-lab/core";
import type { SolutionListItem } from "./api.js";
import { buildDatabaseActionSizingSummary } from "./databaseActionSizingSummary.js";

export interface MultiActionStrategyViewModel {
  source: ResultSource;
  sourceLabel: string;
  canonicalKey: string | null;
  hands: MultiActionHandStrategy[];
  actionKinds: MultiActionKind[];
  hasMixedActions: boolean;
  warnings: string[];
  isReadOnlyLegacyAdapter: boolean;
  strategyMode: "legacy-adapter" | "multi-action-v2";
}

export function buildMultiActionFromSolution(solution: SolutionListItem): MultiActionStrategyViewModel | null {
  if (!hasStrategyEntries(solution.strategy)) {
    return null;
  }

  const sizingSummary = buildDatabaseActionSizingSummary(solution);
  return buildViewModel({
    source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
    sourceLabel: solution.sourceLabel,
    canonicalKey: solution.canonicalKey,
    strategy: solution.strategy,
    ...(sizingSummary.detectedRaiseSizes[0]?.sizeLabel
      ? { raiseSizeLabel: sizingSummary.detectedRaiseSizes[0].sizeLabel }
      : {}),
    inheritedWarnings: sizingSummary.hasUnknownUnspecified
      ? ["size signal is UNKNOWN/UNSPECIFIED in imported DB metadata"]
      : []
  });
}

export function buildMultiActionFromAnalyzeResult(result: AnalyzeResult): MultiActionStrategyViewModel | null {
  if (result.source === RESULT_SOURCES.NOT_SOLVED || !hasStrategyEntries(result.strategy)) {
    return null;
  }

  return buildViewModel({
    source: result.source,
    sourceLabel: result.sourceLabel,
    canonicalKey: result.canonicalKey,
    strategy: result.strategy,
    inheritedWarnings: result.limitations
  });
}

export function buildHandActionDetail(
  strategy: MultiActionStrategyViewModel | MultiActionHandStrategy[] | null,
  hand: string
): MultiActionHandStrategy | null {
  const hands = Array.isArray(strategy) ? strategy : strategy?.hands;
  if (!hands) {
    return null;
  }
  const normalizedHand = hand.trim().toUpperCase();
  return hands.find((item) => item.hand.toUpperCase() === normalizedHand) ?? null;
}

function buildViewModel(input: {
  source: ResultSource;
  sourceLabel: string;
  canonicalKey: string | null;
  strategy: unknown;
  raiseSizeLabel?: string;
  inheritedWarnings?: string[];
}): MultiActionStrategyViewModel {
  const v2 = multiActionV2Entries(input.strategy);
  const entries =
    v2?.entries ??
    Object.entries(input.strategy as StrategyMatrix).map(([hand, strategy]) =>
      legacyEntryToMultiActionInput(hand, strategy, input.raiseSizeLabel)
    );
  const matrix = buildMultiActionStrategyMatrix(entries);
  const warnings = Array.from(new Set([...(input.inheritedWarnings ?? []), ...(v2?.warnings ?? []), ...matrix.warnings]));
  const strategyMode = v2 ? "multi-action-v2" : "legacy-adapter";

  return {
    source: input.source,
    sourceLabel: input.sourceLabel,
    canonicalKey: input.canonicalKey,
    hands: matrix.hands,
    actionKinds: matrix.actionKinds,
    hasMixedActions: matrix.hasMixedActions,
    warnings,
    isReadOnlyLegacyAdapter: strategyMode === "legacy-adapter",
    strategyMode
  };
}

function multiActionV2Entries(strategy: unknown): { entries: MultiActionHandStrategyInput[]; warnings: string[] } | null {
  if (!isRecord(strategy)) {
    return null;
  }

  const entries: MultiActionHandStrategyInput[] = [];
  const warnings = new Set<string>();

  for (const [handKey, rawHand] of Object.entries(strategy)) {
    if (!isRecord(rawHand) || !Array.isArray(rawHand.actions)) {
      continue;
    }

    const hand = typeof rawHand.hand === "string" && rawHand.hand.trim().length > 0 ? rawHand.hand : handKey;
    const actions = rawHand.actions.map((rawAction) => v2ActionToInput(rawAction));
    for (const warning of readStringArray(rawHand.warnings)) {
      warnings.add(warning);
    }
    entries.push({ hand, actions });
  }

  return entries.length > 0 ? { entries, warnings: Array.from(warnings) } : null;
}

function v2ActionToInput(rawAction: unknown): MultiActionOptionInput {
  if (!isRecord(rawAction)) {
    return {
      action: "UNKNOWN",
      frequency: null,
      ev: null,
      chipEv: null,
      icmEv: null,
      warnings: ["multi-action v2 action row is not an object"]
    };
  }

  const input: MultiActionOptionInput = {
    action: rawAction.action,
    frequency: readNumberOrNull(rawAction.frequency),
    ev: readNumberOrNull(rawAction.ev),
    chipEv: readNumberOrNull(rawAction.chipEv ?? rawAction.chipEV),
    icmEv: readNumberOrNull(rawAction.icmEv ?? rawAction.icmEV),
    sourceActionLabel: readOptionalString(rawAction.sourceActionLabel),
    warnings: readStringArray(rawAction.warnings)
  };
  const size = readV2ActionSize(rawAction);
  if (size) {
    input.size = size;
  }
  return input;
}

function readV2ActionSize(rawAction: Record<string, unknown>): MultiActionSizeInput | null {
  const rawSize = isRecord(rawAction.size) ? rawAction.size : null;
  const size: MultiActionSizeInput = {};
  const sizeBb = readNumberOrNull(rawAction.sizeBb ?? rawSize?.sizeBb);
  const sizePctPot = readNumberOrNull(rawAction.sizePctPot ?? rawSize?.sizePctPot);
  const isAllIn = readBooleanOrNull(rawAction.isAllIn ?? rawSize?.isAllIn);
  const rawSizeLabel = readOptionalString(rawAction.rawSizeLabel ?? rawSize?.rawSizeLabel);

  if (sizeBb !== null) {
    size.sizeBb = sizeBb;
  }
  if (sizePctPot !== null) {
    size.sizePctPot = sizePctPot;
  }
  if (isAllIn !== null) {
    size.isAllIn = isAllIn;
  }
  if (rawSizeLabel !== null) {
    size.rawSizeLabel = rawSizeLabel;
  }

  return Object.keys(size).length > 0 ? size : null;
}

function legacyEntryToMultiActionInput(
  hand: string,
  strategy: HandStrategy,
  raiseSizeLabel: string | undefined
): MultiActionHandStrategyInput {
  const action = normalizeMultiActionKind(strategy.action);
  const ev = deriveLegacyEv(strategy);
  const input: MultiActionHandStrategyInput = {
    hand,
    action: strategy.action,
    frequency: strategy.frequency,
    ev,
    evLabel: strategy.label ?? null,
    sourceActionLabel: strategy.action
  };

  if (action === "ALL_IN") {
    input.isAllIn = true;
  }
  const canUseRaiseSizeLabel = action === "RAISE" || action === "BET";
  const needsExplicitSize = action === "RAISE" || action === "BET" || action === "CALL";

  if (canUseRaiseSizeLabel && raiseSizeLabel) {
    input.rawSizeLabel = raiseSizeLabel;
  }

  if (needsExplicitSize && !(canUseRaiseSizeLabel && raiseSizeLabel)) {
    input.warnings = ["size is not specified in legacy strategy metadata"];
  }

  return input;
}

function deriveLegacyEv(strategy: HandStrategy): number | null {
  if (strategy.action === "SHOVE" && typeof strategy.evPush === "number") {
    return strategy.evPush;
  }
  if (strategy.action === "FOLD" && typeof strategy.evFold === "number") {
    return strategy.evFold;
  }
  if (typeof strategy.evPush === "number") {
    return strategy.evPush;
  }
  if (typeof strategy.evFold === "number") {
    return strategy.evFold;
  }
  return null;
}

function hasStrategyEntries(strategy: unknown): boolean {
  return isRecord(strategy) && Object.keys(strategy).length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

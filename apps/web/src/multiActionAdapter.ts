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
}

export function buildMultiActionFromSolution(solution: SolutionListItem): MultiActionStrategyViewModel | null {
  if (!solution.strategy || Object.keys(solution.strategy).length === 0) {
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
  if (result.source === RESULT_SOURCES.NOT_SOLVED || !result.strategy || Object.keys(result.strategy).length === 0) {
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
  strategy: StrategyMatrix;
  raiseSizeLabel?: string;
  inheritedWarnings?: string[];
}): MultiActionStrategyViewModel {
  const entries = Object.entries(input.strategy).map(([hand, strategy]) =>
    legacyEntryToMultiActionInput(hand, strategy, input.raiseSizeLabel)
  );
  const matrix = buildMultiActionStrategyMatrix(entries);
  const warnings = Array.from(new Set([...(input.inheritedWarnings ?? []), ...matrix.warnings]));

  return {
    source: input.source,
    sourceLabel: input.sourceLabel,
    canonicalKey: input.canonicalKey,
    hands: matrix.hands,
    actionKinds: matrix.actionKinds,
    hasMixedActions: matrix.hasMixedActions,
    warnings,
    isReadOnlyLegacyAdapter: true
  };
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

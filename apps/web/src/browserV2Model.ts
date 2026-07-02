import {
  buildMultiActionHandStrategy,
  normalizeActionSize,
  normalizeMultiActionKind,
  type HandStrategy,
  type MultiActionHandStrategyInput,
  type MultiActionKind,
  type MultiActionOption,
  type MultiActionOptionInput,
  type MultiActionSize,
  type MultiActionSizeInput
} from "@poker-tournament-lab/core";

export type BrowserV2StrategyMode = "empty" | "legacy-adapter" | "multi-action-v2" | "mixed";
export type BrowserV2EvMode = "EV" | "CHIP_EV" | "ICM_EV";

export interface BrowserV2ModelOptions {
  evMode?: BrowserV2EvMode;
}

export interface BrowserV2ActionView {
  action: MultiActionKind;
  actionLabel: string;
  size: MultiActionSize | null;
  sizeLabel: string;
  sizeGroupLabel: string;
  frequency: number | null;
  frequencyLabel: string;
  ev: number | null;
  chipEv: number | null;
  icmEv: number | null;
  evLabel: string;
  chipEvLabel: string;
  icmEvLabel: string;
  sourceActionLabel: string | null;
  missingEv: boolean;
  missingSize: boolean;
  unknownAction: boolean;
  warnings: string[];
}

export interface BrowserV2HandCell {
  hand: string;
  actions: BrowserV2ActionView[];
  primaryAction: MultiActionKind;
  primaryActionLabel: string;
  primaryFrequency: number | null;
  primaryFrequencyLabel: string;
  isMixedAction: boolean;
  actionCount: number;
  totalFrequency: number | null;
  totalFrequencyLabel: string;
  frequencyWarnings: string[];
  availableActionKinds: MultiActionKind[];
  availableSizeLabels: string[];
  bestEvAction: BrowserV2ActionView | null;
  missingEv: boolean;
  missingSize: boolean;
  unknownAction: boolean;
  warnings: string[];
}

export interface BrowserV2SummaryRow {
  key: string;
  label: string;
  count: number;
  totalFrequency: number | null;
  totalFrequencyLabel: string;
}

export interface BrowserV2Model {
  hands: BrowserV2HandCell[];
  handCount: number;
  totalActionCount: number;
  mixedHandCount: number;
  availableActionKinds: MultiActionKind[];
  availableSizeLabels: string[];
  actionKindSummary: BrowserV2SummaryRow[];
  sizeSummary: BrowserV2SummaryRow[];
  warnings: string[];
  evMode: BrowserV2EvMode;
  strategyMode: BrowserV2StrategyMode;
}

interface BrowserV2Entry {
  input: MultiActionHandStrategyInput;
  mode: Exclude<BrowserV2StrategyMode, "empty" | "mixed">;
}

export function buildBrowserV2Model(strategy: unknown, options: BrowserV2ModelOptions = {}): BrowserV2Model {
  const entries = strategyToBrowserEntries(strategy);
  const hands = entries.map((entry) => buildBrowserV2HandCell(entry.input.hand, entry.input.actions ?? [entry.input]));
  const warnings = Array.from(new Set(hands.flatMap((hand) => hand.warnings)));
  const availableActionKinds = uniqueActionKinds(hands.flatMap((hand) => hand.availableActionKinds));
  const availableSizeLabels = uniqueStrings(hands.flatMap((hand) => hand.availableSizeLabels));
  const modes = new Set(entries.map((entry) => entry.mode));

  return {
    hands,
    handCount: hands.length,
    totalActionCount: hands.reduce((sum, hand) => sum + hand.actionCount, 0),
    mixedHandCount: hands.filter((hand) => hand.isMixedAction).length,
    availableActionKinds,
    availableSizeLabels,
    actionKindSummary: groupBrowserActionsByKind(hands.flatMap((hand) => hand.actions)),
    sizeSummary: groupBrowserActionsBySize(hands.flatMap((hand) => hand.actions)),
    warnings,
    evMode: options.evMode ?? "EV",
    strategyMode: modes.size === 0 ? "empty" : modes.size > 1 ? "mixed" : modes.values().next().value ?? "empty"
  };
}

export function buildBrowserV2HandCell(hand: string, actions: unknown): BrowserV2HandCell {
  const rawActions = Array.isArray(actions) ? actions : [];
  if (rawActions.length === 0) {
    const warnings = ["actions[] is empty"];
    return {
      hand,
      actions: [],
      primaryAction: "UNKNOWN",
      primaryActionLabel: "UNKNOWN",
      primaryFrequency: null,
      primaryFrequencyLabel: formatBrowserFrequency(null),
      isMixedAction: false,
      actionCount: 0,
      totalFrequency: null,
      totalFrequencyLabel: formatBrowserFrequency(null),
      frequencyWarnings: [],
      availableActionKinds: [],
      availableSizeLabels: [],
      bestEvAction: null,
      missingEv: true,
      missingSize: false,
      unknownAction: false,
      warnings
    };
  }

  const normalized = buildMultiActionHandStrategy({ hand, actions: rawActions.map(rawActionToMultiActionInput) });
  const actionViews = normalized.actions.map((action) => buildBrowserActionView(action));
  const primaryAction = getPrimaryBrowserAction(actionViews);
  const primaryView = actionViews.find((action) => action.action === primaryAction) ?? null;
  const warnings = Array.from(new Set([...normalized.warnings, ...actionViews.flatMap((action) => action.warnings)]));

  return {
    hand: normalized.hand,
    actions: actionViews,
    primaryAction,
    primaryActionLabel: primaryAction,
    primaryFrequency: primaryView?.frequency ?? null,
    primaryFrequencyLabel: formatBrowserFrequency(primaryView?.frequency ?? null),
    isMixedAction: actionViews.length > 1,
    actionCount: actionViews.length,
    totalFrequency: normalized.totalFrequency,
    totalFrequencyLabel: formatBrowserFrequency(normalized.totalFrequency),
    frequencyWarnings: warnings.filter((warning) => warning.toLowerCase().includes("frequency")),
    availableActionKinds: uniqueActionKinds(actionViews.map((action) => action.action)),
    availableSizeLabels: uniqueStrings(actionViews.map((action) => action.sizeGroupLabel)),
    bestEvAction: getBestEvAction(actionViews),
    missingEv: actionViews.some((action) => action.missingEv),
    missingSize: actionViews.some((action) => action.missingSize),
    unknownAction: actionViews.some((action) => action.unknownAction),
    warnings
  };
}

export function summarizeBrowserV2Actions(actions: BrowserV2ActionView[]): {
  actionKinds: MultiActionKind[];
  sizeLabels: string[];
  missingEvCount: number;
  missingSizeCount: number;
  unknownActionCount: number;
} {
  return {
    actionKinds: uniqueActionKinds(actions.map((action) => action.action)),
    sizeLabels: uniqueStrings(actions.map((action) => action.sizeGroupLabel)),
    missingEvCount: actions.filter((action) => action.missingEv).length,
    missingSizeCount: actions.filter((action) => action.missingSize).length,
    unknownActionCount: actions.filter((action) => action.unknownAction).length
  };
}

export function getPrimaryBrowserAction(actions: BrowserV2ActionView[]): MultiActionKind {
  if (actions.length === 0) {
    return "UNKNOWN";
  }
  const withFrequency = actions.filter((action) => action.frequency !== null);
  if (withFrequency.length > 0) {
    return [...withFrequency].sort((left, right) => {
      const frequencyDelta = (right.frequency ?? 0) - (left.frequency ?? 0);
      if (frequencyDelta !== 0) {
        return frequencyDelta;
      }
      return actionSortRank(left.action) - actionSortRank(right.action);
    })[0]!.action;
  }
  return [...actions].sort((left, right) => actionSortRank(left.action) - actionSortRank(right.action))[0]!.action;
}

export function groupBrowserActionsByKind(actions: BrowserV2ActionView[]): BrowserV2SummaryRow[] {
  return groupActions(actions, (action) => action.action, (action) => action.action);
}

export function groupBrowserActionsBySize(actions: BrowserV2ActionView[]): BrowserV2SummaryRow[] {
  return groupActions(actions, (action) => action.sizeGroupLabel, (action) => action.sizeGroupLabel);
}

export function formatBrowserEv(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? trimZeros(value) : "제공되지 않음";
}

export function formatBrowserFrequency(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${trimZeros(value * 100)}%` : "제공되지 않음";
}

function strategyToBrowserEntries(strategy: unknown): BrowserV2Entry[] {
  if (!isRecord(strategy)) {
    return [];
  }

  const entries: BrowserV2Entry[] = [];
  for (const [hand, rawHand] of Object.entries(strategy)) {
    if (isRecord(rawHand) && Array.isArray(rawHand.actions)) {
      const normalizedHand = readString(rawHand.hand) ?? hand;
      entries.push({
        input: {
          hand: normalizedHand,
          actions: rawHand.actions.map(rawActionToMultiActionInput)
        },
        mode: "multi-action-v2"
      });
      continue;
    }
    if (isRecord(rawHand)) {
      entries.push({
        input: legacyHandToInput(hand, rawHand),
        mode: "legacy-adapter"
      });
    }
  }
  return entries;
}

function legacyHandToInput(hand: string, rawHand: Record<string, unknown>): MultiActionHandStrategyInput {
  const action = readString(rawHand.action) ?? "UNKNOWN";
  const normalized = normalizeMultiActionKind(action);
  const input: MultiActionHandStrategyInput = {
    hand,
    action,
    frequency: readNumber(rawHand.frequency),
    ev: deriveLegacyEv(rawHand),
    evLabel: readString(rawHand.label),
    sourceActionLabel: action
  };
  if (normalized === "ALL_IN") {
    input.isAllIn = true;
  }
  return input;
}

function rawActionToMultiActionInput(rawAction: unknown): MultiActionOptionInput {
  if (!isRecord(rawAction)) {
    return {
      action: "UNKNOWN",
      frequency: null,
      ev: null,
      chipEv: null,
      icmEv: null,
      warnings: ["action row is not an object"]
    };
  }

  const input: MultiActionOptionInput = {
    action: rawAction.action,
    frequency: readNumber(rawAction.frequency),
    ev: readNumber(rawAction.ev),
    chipEv: readNumber(rawAction.chipEv ?? rawAction.chipEV),
    icmEv: readNumber(rawAction.icmEv ?? rawAction.icmEV),
    evLabel: readString(rawAction.evLabel),
    sourceActionLabel: readString(rawAction.sourceActionLabel),
    warnings: readStringArray(rawAction.warnings)
  };
  const size = readActionSize(rawAction);
  if (size) {
    input.size = size;
  }
  return input;
}

function buildBrowserActionView(action: MultiActionOption): BrowserV2ActionView {
  const missingSize = isSizeRequired(action.action) && !action.size;
  const unknownAction = action.action === "UNKNOWN";
  const warnings = new Set(action.warnings);
  if (missingSize) {
    warnings.add(`${action.action} size is not provided`);
  }
  if (unknownAction) {
    warnings.add("action is UNKNOWN");
  }

  return {
    action: action.action,
    actionLabel: action.action,
    size: action.size,
    sizeLabel: formatBrowserSize(action.size, action.action),
    sizeGroupLabel: sizeGroupLabel(action.size, action.action),
    frequency: action.frequency,
    frequencyLabel: formatBrowserFrequency(action.frequency),
    ev: action.ev,
    chipEv: action.chipEv,
    icmEv: action.icmEv,
    evLabel: formatBrowserEv(action.ev),
    chipEvLabel: formatBrowserEv(action.chipEv),
    icmEvLabel: formatBrowserEv(action.icmEv),
    sourceActionLabel: action.sourceActionLabel,
    missingEv: action.ev === null,
    missingSize,
    unknownAction,
    warnings: Array.from(warnings)
  };
}

function getBestEvAction(actions: BrowserV2ActionView[]): BrowserV2ActionView | null {
  const withEv = actions.filter((action) => action.ev !== null);
  if (withEv.length === 0) {
    return null;
  }
  return [...withEv].sort((left, right) => (right.ev ?? Number.NEGATIVE_INFINITY) - (left.ev ?? Number.NEGATIVE_INFINITY))[0] ?? null;
}

function groupActions(
  actions: BrowserV2ActionView[],
  keyOf: (action: BrowserV2ActionView) => string,
  labelOf: (action: BrowserV2ActionView) => string
): BrowserV2SummaryRow[] {
  const map = new Map<string, { label: string; count: number; frequencies: number[] }>();
  for (const action of actions) {
    const key = keyOf(action);
    const existing = map.get(key) ?? { label: labelOf(action), count: 0, frequencies: [] };
    existing.count += 1;
    if (action.frequency !== null) {
      existing.frequencies.push(action.frequency);
    }
    map.set(key, existing);
  }
  return Array.from(map.entries()).map(([key, value]) => {
    const totalFrequency = value.frequencies.length > 0 ? value.frequencies.reduce((sum, item) => sum + item, 0) : null;
    return {
      key,
      label: value.label,
      count: value.count,
      totalFrequency,
      totalFrequencyLabel: formatBrowserFrequency(totalFrequency)
    };
  });
}

function formatBrowserSize(size: MultiActionSize | null, action: MultiActionKind): string {
  if (!size) {
    return isSizeRequired(action) ? "사이즈 미지정" : "제공되지 않음";
  }
  if (size.isAllIn) {
    return "all-in";
  }
  if (typeof size.sizeBb === "number") {
    return `${trimZeros(size.sizeBb)}bb`;
  }
  if (typeof size.sizePctPot === "number") {
    return `${trimZeros(size.sizePctPot)}% pot`;
  }
  return size.rawSizeLabel ?? "제공되지 않음";
}

function sizeGroupLabel(size: MultiActionSize | null, action: MultiActionKind): string {
  if (!size) {
    return isSizeRequired(action) ? "unknown/unspecified" : "none";
  }
  return formatBrowserSize(size, action);
}

function readActionSize(rawAction: Record<string, unknown>): MultiActionSizeInput | null {
  const rawSize = isRecord(rawAction.size) ? rawAction.size : null;
  return normalizeActionSize({
    sizeBb: readNumber(rawAction.sizeBb ?? rawSize?.sizeBb),
    sizePctPot: readNumber(rawAction.sizePctPot ?? rawSize?.sizePctPot),
    isAllIn: readBoolean(rawAction.isAllIn ?? rawSize?.isAllIn),
    rawSizeLabel: readString(rawAction.rawSizeLabel ?? rawSize?.rawSizeLabel)
  });
}

function deriveLegacyEv(rawHand: Record<string, unknown>): number | null {
  const action = normalizeMultiActionKind(rawHand.action);
  if (action === "ALL_IN") {
    return readNumber(rawHand.evPush);
  }
  if (action === "FOLD") {
    return readNumber(rawHand.evFold);
  }
  return readNumber(rawHand.ev ?? rawHand.evPush ?? rawHand.evFold);
}

function isSizeRequired(action: MultiActionKind): boolean {
  return action === "RAISE" || action === "BET" || action === "CALL";
}

function uniqueActionKinds(actions: MultiActionKind[]): MultiActionKind[] {
  return Array.from(new Set(actions)).sort((left, right) => actionSortRank(left) - actionSortRank(right));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function actionSortRank(action: MultiActionKind): number {
  const rank: Record<MultiActionKind, number> = {
    FOLD: 1,
    CHECK: 2,
    CALL: 3,
    BET: 4,
    RAISE: 5,
    ALL_IN: 6,
    UNKNOWN: 7
  };
  return rank[action];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function trimZeros(value: number): string {
  if (!Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

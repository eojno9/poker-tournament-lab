export type MultiActionKind = "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN" | "UNKNOWN";

export interface MultiActionSize {
  sizeBb?: number;
  sizePctPot?: number;
  isAllIn?: boolean;
  rawSizeLabel?: string;
}

export interface MultiActionOption {
  action: MultiActionKind;
  size: MultiActionSize | null;
  frequency: number | null;
  ev: number | null;
  chipEv: number | null;
  icmEv: number | null;
  evLabel: string;
  sourceActionLabel: string | null;
  warnings: string[];
}

export interface MultiActionHandStrategy {
  hand: string;
  actions: MultiActionOption[];
  primaryAction: MultiActionKind;
  totalFrequency: number | null;
  warnings: string[];
}

export interface MultiActionStrategyMatrix {
  hands: MultiActionHandStrategy[];
  actionKinds: MultiActionKind[];
  hasMixedActions: boolean;
  warnings: string[];
}

export interface MultiActionSizeInput {
  sizeBb?: number | null;
  sizePctPot?: number | null;
  isAllIn?: boolean | null;
  rawSizeLabel?: string | null;
}

export interface MultiActionOptionInput {
  action?: unknown;
  size?: MultiActionSizeInput | null;
  sizeBb?: number | null;
  sizePctPot?: number | null;
  isAllIn?: boolean | null;
  rawSizeLabel?: string | null;
  frequency?: number | null;
  ev?: number | null;
  chipEv?: number | null;
  icmEv?: number | null;
  evLabel?: string | null;
  sourceActionLabel?: string | null;
  warnings?: string[];
}

export interface MultiActionHandStrategyInput extends MultiActionOptionInput {
  hand: string;
  actions?: MultiActionOptionInput[];
}

export function normalizeMultiActionKind(input: unknown): MultiActionKind {
  if (typeof input !== "string") {
    return "UNKNOWN";
  }
  const normalized = input.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SHOVE" || normalized === "JAM" || normalized === "ALLIN" || normalized === "ALL_IN") {
    return "ALL_IN";
  }
  if (normalized === "FOLD") {
    return "FOLD";
  }
  if (normalized === "CHECK") {
    return "CHECK";
  }
  if (normalized === "CALL") {
    return "CALL";
  }
  if (normalized === "BET") {
    return "BET";
  }
  if (normalized === "RAISE" || normalized === "OPEN") {
    return "RAISE";
  }
  return "UNKNOWN";
}

export function normalizeActionSize(input: MultiActionSizeInput | null | undefined): MultiActionSize | null {
  if (!input) {
    return null;
  }

  const size: MultiActionSize = {};
  if (typeof input.sizeBb === "number" && Number.isFinite(input.sizeBb)) {
    size.sizeBb = input.sizeBb;
  }
  if (typeof input.sizePctPot === "number" && Number.isFinite(input.sizePctPot)) {
    size.sizePctPot = input.sizePctPot;
  }
  if (typeof input.isAllIn === "boolean") {
    size.isAllIn = input.isAllIn;
  }
  if (typeof input.rawSizeLabel === "string" && input.rawSizeLabel.trim().length > 0) {
    size.rawSizeLabel = input.rawSizeLabel.trim();
  }

  return Object.keys(size).length > 0 ? size : null;
}

export function buildMultiActionHandStrategy(input: MultiActionHandStrategyInput): MultiActionHandStrategy {
  const optionInputs = input.actions && input.actions.length > 0 ? input.actions : [input];
  const warnings = new Set<string>();
  const actions = optionInputs.map((optionInput) => buildMultiActionOption(optionInput));

  for (const action of actions) {
    for (const warning of action.warnings) {
      warnings.add(warning);
    }
    if (action.frequency !== null && action.frequency < 0) {
      warnings.add("frequency is below 0");
    }
  }

  const knownFrequencies = actions
    .map((action) => action.frequency)
    .filter((frequency): frequency is number => frequency !== null);
  const totalFrequency = knownFrequencies.length > 0 ? sumNumbers(knownFrequencies) : null;
  if (totalFrequency !== null && totalFrequency > 1.000001) {
    warnings.add("frequency total exceeds 1");
  }

  return {
    hand: input.hand,
    actions,
    primaryAction: getPrimaryAction(actions),
    totalFrequency,
    warnings: Array.from(warnings)
  };
}

export function buildMultiActionStrategyMatrix(entries: MultiActionHandStrategyInput[]): MultiActionStrategyMatrix {
  const hands = entries.map((entry) => buildMultiActionHandStrategy(entry));
  const actionKinds = uniqueActionKinds(hands);
  const warnings = Array.from(new Set(hands.flatMap((hand) => hand.warnings)));

  return {
    hands,
    actionKinds,
    hasMixedActions: hands.some((hand) => hand.actions.length > 1),
    warnings
  };
}

export function getPrimaryAction(actions: MultiActionOption[]): MultiActionKind {
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

export function formatActionSize(size: MultiActionSize | null): string {
  if (!size) {
    return "제공되지 않음";
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

export function formatActionFrequency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return `${trimZeros(value * 100)}%`;
}

export function formatActionEv(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return trimZeros(value);
}

function buildMultiActionOption(input: MultiActionOptionInput): MultiActionOption {
  const action = normalizeMultiActionKind(input.action);
  const sourceActionLabel = typeof input.sourceActionLabel === "string" ? input.sourceActionLabel : sourceLabelFromInput(input.action);
  const size = normalizeActionSize({
    ...(input.size ?? {}),
    sizeBb: input.sizeBb ?? input.size?.sizeBb ?? null,
    sizePctPot: input.sizePctPot ?? input.size?.sizePctPot ?? null,
    isAllIn: input.isAllIn ?? input.size?.isAllIn ?? (action === "ALL_IN" ? true : null),
    rawSizeLabel: input.rawSizeLabel ?? input.size?.rawSizeLabel ?? null
  });
  const warnings = [...(input.warnings ?? [])];

  if (action === "UNKNOWN") {
    warnings.push("action is UNKNOWN");
  }
  if ((action === "RAISE" || action === "BET" || action === "CALL") && !size) {
    warnings.push(`${action} size is not provided`);
  }

  const ev = normalizeNumber(input.ev);
  const chipEv = normalizeNumber(input.chipEv);
  const icmEv = normalizeNumber(input.icmEv);
  const frequency = normalizeNumber(input.frequency);
  const evLabel = typeof input.evLabel === "string" && input.evLabel.trim().length > 0 ? input.evLabel : formatActionEv(ev);

  return {
    action,
    size,
    frequency,
    ev,
    chipEv,
    icmEv,
    evLabel,
    sourceActionLabel,
    warnings
  };
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sourceLabelFromInput(input: unknown): string | null {
  return typeof input === "string" && input.trim().length > 0 ? input.trim() : null;
}

function sumNumbers(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function uniqueActionKinds(hands: MultiActionHandStrategy[]): MultiActionKind[] {
  const seen = new Set<MultiActionKind>();
  for (const hand of hands) {
    for (const action of hand.actions) {
      seen.add(action.action);
    }
  }
  return Array.from(seen).sort((left, right) => actionSortRank(left) - actionSortRank(right));
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

function trimZeros(value: number): string {
  if (!Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

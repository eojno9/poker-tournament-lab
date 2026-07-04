export type ActionTreeSpotType =
  | "PUSH_FOLD"
  | "RFI"
  | "LIMP"
  | "FACING_OPEN"
  | "FACING_LIMP"
  | "THREE_BET"
  | "VS_THREE_BET"
  | "UNKNOWN";

export type ActionTreeNode =
  | "OPEN_SHOVE"
  | "FIRST_IN"
  | "OPEN_RAISE"
  | "OPEN_LIMP"
  | "VS_OPEN"
  | "VS_LIMP"
  | "THREE_BET"
  | "VS_THREE_BET"
  | "UNKNOWN";

export type ActionTreeActionKind =
  | "FOLD"
  | "CHECK"
  | "LIMP"
  | "CALL"
  | "BET"
  | "RAISE"
  | "ALL_IN"
  | "UNKNOWN";

export interface ActionTreeClassifierInput {
  source?: string;
  heroPosition?: string;
  tableSize?: number;
  remainingPlayers?: number;
  heroStackBb?: number;
  actionPath?: unknown;
  treeConfig?: unknown;
  sourceFile?: string;
  canonicalKey?: string;
  sourceMetadata?: unknown;
  strategy?: unknown;
  actions?: unknown;
}

export interface ActionTreeClassification {
  spotType: ActionTreeSpotType;
  actionNode: ActionTreeNode;
  availableActions: ActionTreeActionKind[];
  availableSizes: string[];
  breadcrumbItems: string[];
  warnings: string[];
}

interface ActionTreeBaseClassification {
  spotType: ActionTreeSpotType;
  actionNode: ActionTreeNode;
}

interface RawActionRecord {
  action: ActionTreeActionKind;
  hasExplicitSize: boolean;
  sizeLabel: string | null;
}

const ACTION_SORT_ORDER: Record<ActionTreeActionKind, number> = {
  FOLD: 1,
  CHECK: 2,
  LIMP: 3,
  CALL: 4,
  BET: 5,
  RAISE: 6,
  ALL_IN: 7,
  UNKNOWN: 8
};

export function classifyActionTreeSpot(input: ActionTreeClassifierInput = {}): ActionTreeClassification {
  const searchText = buildSearchText(input);
  const rawActions = collectRawActions(input);
  const availableActions = extractAvailableActionKinds(input);
  const availableSizes = extractAvailableSizeLabels(input);
  const base = classifyBase(searchText, availableActions);
  const warnings = buildWarnings(base, searchText, rawActions);

  return {
    spotType: base.spotType,
    actionNode: base.actionNode,
    availableActions,
    availableSizes,
    breadcrumbItems: buildBreadcrumbItems(input, base, availableSizes),
    warnings
  };
}

export function buildActionTreeBreadcrumb(input: ActionTreeClassifierInput = {}): string[] {
  return classifyActionTreeSpot(input).breadcrumbItems;
}

export function extractAvailableActionKinds(input: ActionTreeClassifierInput = {}): ActionTreeActionKind[] {
  return uniqueActions(collectRawActions(input).map((action) => action.action));
}

export function extractAvailableSizeLabels(input: ActionTreeClassifierInput = {}): string[] {
  return uniqueStrings(
    collectRawActions(input)
      .map((action) => action.sizeLabel)
      .filter((sizeLabel): sizeLabel is string => Boolean(sizeLabel))
  );
}

function classifyBase(searchText: string, availableActions: ActionTreeActionKind[]): ActionTreeBaseClassification {
  if (hasAnySignal(searchText, ["OPEN_SHOVE_ONLY", "PUSH_FOLD", "SHOVE_ONLY", "OPEN_SHOVE", "PUSH_OR_FOLD"])) {
    return { spotType: "PUSH_FOLD", actionNode: "OPEN_SHOVE" };
  }

  if (hasPushFoldActionShape(availableActions)) {
    return { spotType: "PUSH_FOLD", actionNode: "OPEN_SHOVE" };
  }

  if (hasAnySignal(searchText, ["VS_3BET", "VS_THREE_BET", "FACING_3BET", "FACING_THREE_BET"])) {
    return { spotType: "VS_THREE_BET", actionNode: "VS_THREE_BET" };
  }

  if (hasAnySignal(searchText, ["3BET", "THREE_BET", "THREEBET"])) {
    return { spotType: "THREE_BET", actionNode: "THREE_BET" };
  }

  if (hasAnySignal(searchText, ["FACING_LIMP", "VS_LIMP", "ISO_VS_LIMP", "ISOLATION_VS_LIMP"])) {
    return { spotType: "FACING_LIMP", actionNode: "VS_LIMP" };
  }

  if (hasAnySignal(searchText, ["FACING_OPEN", "VS_OPEN", "CALL_OPEN", "DEFEND_VS_OPEN", "VS_RAISE"])) {
    return { spotType: "FACING_OPEN", actionNode: "VS_OPEN" };
  }

  if (hasAnySignal(searchText, ["OPEN_LIMP", "FIRST_IN_LIMP", "LIMP_FIRST_IN"]) || availableActions.includes("LIMP")) {
    return { spotType: "LIMP", actionNode: "OPEN_LIMP" };
  }

  if (hasAnySignal(searchText, ["RFI", "OPEN_RAISE", "RAISE_FIRST_IN", "FIRST_IN", "UNOPENED"])) {
    return {
      spotType: "RFI",
      actionNode: hasAnySignal(searchText, ["FIRST_IN", "UNOPENED"]) ? "FIRST_IN" : "OPEN_RAISE"
    };
  }

  if (hasAnySignal(searchText, ["LIMP"])) {
    return { spotType: "LIMP", actionNode: "OPEN_LIMP" };
  }

  return { spotType: "UNKNOWN", actionNode: "UNKNOWN" };
}

function buildWarnings(base: ActionTreeBaseClassification, searchText: string, actions: RawActionRecord[]): string[] {
  const warnings = new Set<string>();

  if (base.spotType === "UNKNOWN") {
    warnings.add("분류 신호가 부족합니다.");
  }

  for (const action of actions) {
    if (action.action === "UNKNOWN") {
      warnings.add("UNKNOWN action이 포함되어 있습니다.");
    }
    if (requiresSize(action.action) && !action.hasExplicitSize) {
      warnings.add(`${action.action} size 정보가 제공되지 않았습니다.`);
    }
  }

  const hasCallOnly = actions.some((action) => action.action === "CALL") && !actions.some((action) => action.action === "LIMP");
  if (base.spotType === "LIMP" && hasCallOnly && hasAnySignal(searchText, ["OPEN_LIMP", "FIRST_IN_LIMP", "LIMP_FIRST_IN"])) {
    warnings.add("CALL action만 제공되었지만 first-in limp metadata가 있어 LIMP 후보로 분류했습니다.");
  }

  return Array.from(warnings);
}

function buildBreadcrumbItems(
  input: ActionTreeClassifierInput,
  base: ActionTreeBaseClassification,
  availableSizes: string[]
): string[] {
  const items: string[] = [];
  const sourceLabel = readString(input.source);
  if (sourceLabel) {
    items.push(sourceLabel);
  }
  if (typeof input.tableSize === "number" && Number.isFinite(input.tableSize)) {
    items.push(`${input.tableSize}-max`);
  } else if (typeof input.remainingPlayers === "number" && Number.isFinite(input.remainingPlayers)) {
    items.push(`${input.remainingPlayers} players`);
  }
  const heroPosition = readString(input.heroPosition);
  if (heroPosition) {
    items.push(heroPosition);
  }
  if (typeof input.heroStackBb === "number" && Number.isFinite(input.heroStackBb)) {
    items.push(`${trimZeros(input.heroStackBb)}bb`);
  }

  items.push(nodeBreadcrumbLabel(base, availableSizes));
  return items.length > 0 ? items : ["UNKNOWN"];
}

function nodeBreadcrumbLabel(base: ActionTreeBaseClassification, availableSizes: string[]): string {
  const primarySize = availableSizes.find((size) => size !== "all-in" && size !== "사이즈 미지정");
  switch (base.actionNode) {
    case "OPEN_SHOVE":
      return "Open shove";
    case "FIRST_IN":
      return primarySize ? `First-in ${primarySize}` : "First-in";
    case "OPEN_RAISE":
      return primarySize ? `RFI ${primarySize}` : "RFI";
    case "OPEN_LIMP":
      return "Open limp";
    case "VS_OPEN":
      return primarySize ? `Facing Open ${primarySize}` : "Facing Open";
    case "VS_LIMP":
      return "Facing Limp";
    case "THREE_BET":
      return primarySize ? `3bet ${primarySize}` : "3bet";
    case "VS_THREE_BET":
      return primarySize ? `vs 3bet ${primarySize}` : "vs 3bet";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

function collectRawActions(input: ActionTreeClassifierInput): RawActionRecord[] {
  const rawActions: RawActionRecord[] = [];
  collectActionsFromValue(input.actions, rawActions);
  collectActionsFromValue(input.strategy, rawActions);
  return rawActions;
}

function collectActionsFromValue(value: unknown, rawActions: RawActionRecord[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectActionsFromValue(item, rawActions);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (Array.isArray(value.actions)) {
    collectActionsFromValue(value.actions, rawActions);
  }

  if ("action" in value) {
    rawActions.push(readActionRecord(value));
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "actions" || key === "size") {
      continue;
    }
    if (isRecord(child) && ("action" in child || Array.isArray(child.actions))) {
      collectActionsFromValue(child, rawActions);
    }
  }
}

function readActionRecord(value: Record<string, unknown>): RawActionRecord {
  const action = normalizeActionKind(value.action);
  const sizeLabel = readSizeLabel(value, action);
  return {
    action,
    hasExplicitSize: hasExplicitSizeSignal(value, action),
    sizeLabel
  };
}

function hasExplicitSizeSignal(value: Record<string, unknown>, action: ActionTreeActionKind): boolean {
  if (action === "ALL_IN") {
    return true;
  }
  const size = isRecord(value.size) ? value.size : null;
  return (
    readBoolean(value.isAllIn ?? size?.isAllIn) === true ||
    readNumber(value.sizeBb ?? size?.sizeBb) !== null ||
    readNumber(value.sizePctPot ?? size?.sizePctPot) !== null ||
    readString(value.rawSizeLabel ?? size?.rawSizeLabel) !== null
  );
}

function readSizeLabel(value: Record<string, unknown>, action: ActionTreeActionKind): string | null {
  const size = isRecord(value.size) ? value.size : null;
  const isAllIn = readBoolean(value.isAllIn ?? size?.isAllIn);
  if (action === "ALL_IN" || isAllIn === true) {
    return "all-in";
  }

  const sizeBb = readNumber(value.sizeBb ?? size?.sizeBb);
  if (sizeBb !== null) {
    return `${trimZeros(sizeBb)}bb`;
  }

  const sizePctPot = readNumber(value.sizePctPot ?? size?.sizePctPot);
  if (sizePctPot !== null) {
    return `${trimZeros(sizePctPot)}% pot`;
  }

  const rawSizeLabel = readString(value.rawSizeLabel ?? size?.rawSizeLabel);
  if (rawSizeLabel) {
    return rawSizeLabel;
  }

  return requiresSize(action) ? "사이즈 미지정" : null;
}

function normalizeActionKind(value: unknown): ActionTreeActionKind {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }
  const normalized = normalizeToken(value);
  if (normalized === "LIMP" || normalized === "OPEN_LIMP" || normalized === "FIRST_IN_LIMP") {
    return "LIMP";
  }
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
  if (normalized === "RAISE" || normalized === "OPEN" || normalized === "OPEN_RAISE") {
    return "RAISE";
  }
  return "UNKNOWN";
}

function buildSearchText(input: ActionTreeClassifierInput): string {
  const tokens: string[] = [];
  collectText(input.actionPath, tokens);
  collectText(input.treeConfig, tokens);
  collectText(input.sourceMetadata, tokens);
  collectText(input.sourceFile, tokens);
  collectText(input.canonicalKey, tokens);
  return normalizeToken(tokens.join(" "));
}

function collectText(value: unknown, tokens: string[]): void {
  if (typeof value === "string" && value.trim().length > 0) {
    tokens.push(value);
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    tokens.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, tokens);
    }
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectText(item, tokens);
    }
  }
}

function hasAnySignal(searchText: string, signals: string[]): boolean {
  return signals.some((signal) => searchText.includes(normalizeToken(signal)));
}

function hasPushFoldActionShape(actions: ActionTreeActionKind[]): boolean {
  if (!actions.includes("ALL_IN") || !actions.includes("FOLD")) {
    return false;
  }
  return actions.every((action) => action === "ALL_IN" || action === "FOLD" || action === "UNKNOWN");
}

function requiresSize(action: ActionTreeActionKind): boolean {
  return action === "RAISE" || action === "BET" || action === "CALL";
}

function uniqueActions(actions: ActionTreeActionKind[]): ActionTreeActionKind[] {
  return Array.from(new Set(actions)).sort((left, right) => ACTION_SORT_ORDER[left] - ACTION_SORT_ORDER[right]);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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

function trimZeros(value: number): string {
  if (!Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

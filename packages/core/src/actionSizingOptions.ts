import { buildActionSizingAudit, type DetectedAction, type SizeSignal } from "./actionSizingAudit.js";
import type { SpotInput, StrategyMatrix } from "./types.js";

export type ActionSizingSizeKind = "ALL_IN" | "RAISE_SIZE" | "ACTION_ONLY" | "UNSPECIFIED";
export type ActionSizingConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ActionSizingSolutionLike {
  canonicalKey?: string | null;
  fileName?: string | null;
  sourceLabel?: string | null;
  treeConfig?: string | null;
  spot?: SpotInput | null;
  strategy?: StrategyMatrix | null;
  databaseFeatures?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ActionSizingFilter {
  heroPosition?: string;
  tableSize?: number;
  remainingPlayers?: number;
  minHeroStackBb?: number;
  maxHeroStackBb?: number;
  treeConfig?: string;
  sourceFileIncludes?: string;
  canonicalKeyIncludes?: string;
  actionPathPrefix?: string[];
}

export interface ActionSizingOptionExample {
  canonicalKey: string | null;
  heroPosition: string | null;
  tableSize: number | null;
  heroStackBb: number | null;
  treeConfig: string | null;
  sourceFile: string | null;
  actionPath: string[];
}

export interface ActionSizingOption {
  action: DetectedAction;
  sizeKind: ActionSizingSizeKind;
  sizeBb?: number;
  sizeLabel: string;
  sourceCount: number;
  confidence: ActionSizingConfidence;
  examples: ActionSizingOptionExample[];
}

export interface ActionSizingOptionsResult {
  candidateCount: number;
  actions: ActionSizingOption[];
  warnings: string[];
  filteredSolutionCount: number;
  scannedSolutionCount: number;
}

export interface ActionSizingOptionsSummary {
  candidateCount: number;
  actionCounts: Record<DetectedAction, number>;
  sizeKindCounts: Record<ActionSizingSizeKind, number>;
  warningCount: number;
}

export function extractAvailableActionSizingOptions(
  solutions: ActionSizingSolutionLike[],
  filter: ActionSizingFilter = {}
): ActionSizingOptionsResult {
  const warnings = new Set<string>();
  const candidateMap = new Map<string, MutableCandidate>();
  const scannedSolutionCount = solutions.length;
  let filteredSolutionCount = 0;
  let tokenOnlySizeDetected = false;
  let unspecifiedSizeDetected = false;

  for (let index = 0; index < solutions.length; index += 1) {
    const solution = solutions[index]!;
    const spot = solution.spot;
    if (!spot) {
      continue;
    }

    const context = buildContext(solution, index);
    if (!passesFilter(spot, context, filter)) {
      continue;
    }
    filteredSolutionCount += 1;

    const audit = buildActionSizingAudit({
      spot,
      treeConfig: context.treeConfig,
      strategy: solution.strategy ?? null,
      sourceMetadata: buildSourceMetadata(solution)
    });

    const explicitNumericSignals = audit.sizeSignals.filter(
      (signal) => signal.source === "EXPLICIT_FIELD" && signal.valueBb !== null
    );
    const tokenNumericSignals = audit.sizeSignals.filter(
      (signal) => signal.source !== "EXPLICIT_FIELD" && signal.valueBb !== null
    );

    if (explicitNumericSignals.length === 0 && tokenNumericSignals.length > 0) {
      tokenOnlySizeDetected = true;
    }

    const addCandidate = (
      action: DetectedAction,
      sizeKind: ActionSizingSizeKind,
      sizeLabel: string,
      confidence: ActionSizingConfidence,
      sizeBb?: number
    ): void => {
      const key = buildCandidateKey(action, sizeKind, sizeLabel, sizeBb);
      const existing = candidateMap.get(key);
      if (existing) {
        existing.sourceIds.add(context.sourceId);
        existing.confidence = higherConfidence(existing.confidence, confidence);
        pushExample(existing.examples, context.example);
        return;
      }
      const candidate: MutableCandidate = {
        action,
        sizeKind,
        sizeLabel,
        confidence,
        sourceIds: new Set([context.sourceId]),
        examples: [context.example]
      };
      if (sizeBb !== undefined) {
        candidate.sizeBb = sizeBb;
      }
      candidateMap.set(key, candidate);
    };

    for (const signal of dedupeNumericSignals(audit.sizeSignals)) {
      if (signal.valueBb === null) {
        continue;
      }
      addCandidate(
        "RAISE",
        "RAISE_SIZE",
        `${trimZeros(signal.valueBb)}bb`,
        confidenceFromSignal(signal),
        signal.valueBb
      );
    }

    if (audit.detectedActions.includes("SHOVE")) {
      addCandidate("SHOVE", "ALL_IN", "all-in", "HIGH");
    }
    if (audit.detectedActions.includes("ALL_IN")) {
      addCandidate("ALL_IN", "ALL_IN", "all-in", "HIGH");
    }
    if (audit.detectedActions.includes("FOLD")) {
      addCandidate("FOLD", "ACTION_ONLY", "n/a", "HIGH");
    }
    if (audit.detectedActions.includes("CALL")) {
      addCandidate("CALL", "ACTION_ONLY", "n/a", "MEDIUM");
    }

    const hasRaiseAction = audit.detectedActions.includes("RAISE");
    const hasRaiseSize = dedupeNumericSignals(audit.sizeSignals).some((signal) => signal.valueBb !== null);
    if (hasRaiseAction && !hasRaiseSize) {
      unspecifiedSizeDetected = true;
      addCandidate("RAISE", "UNSPECIFIED", "unspecified", "LOW");
    }
    if (audit.sizeSignals.length === 0) {
      unspecifiedSizeDetected = true;
      addCandidate("UNKNOWN", "UNSPECIFIED", "unspecified", "LOW");
    }
  }

  if (tokenOnlySizeDetected) {
    warnings.add("일부 solution에는 명시적 raise size 필드가 없어 treeConfig/actionPath 기준으로만 추출되었습니다.");
  }
  if (unspecifiedSizeDetected) {
    warnings.add("size 정보가 없는 solution은 UNKNOWN/UNSPECIFIED 후보로 분리되었습니다.");
  }

  const actions = Array.from(candidateMap.values())
    .map((candidate) => {
      const option: ActionSizingOption = {
        action: candidate.action,
        sizeKind: candidate.sizeKind,
        sizeLabel: candidate.sizeLabel,
        sourceCount: candidate.sourceIds.size,
        confidence: candidate.confidence,
        examples: candidate.examples
      };
      if (candidate.sizeBb !== undefined) {
        option.sizeBb = candidate.sizeBb;
      }
      return option;
    })
    .sort(sortCandidates);

  return {
    candidateCount: actions.length,
    actions,
    warnings: Array.from(warnings),
    filteredSolutionCount,
    scannedSolutionCount
  };
}

export function summarizeActionSizingOptions(options: ActionSizingOptionsResult): ActionSizingOptionsSummary {
  const actionCounts: Record<DetectedAction, number> = {
    FOLD: 0,
    CALL: 0,
    RAISE: 0,
    SHOVE: 0,
    ALL_IN: 0,
    UNKNOWN: 0
  };
  const sizeKindCounts: Record<ActionSizingSizeKind, number> = {
    ALL_IN: 0,
    RAISE_SIZE: 0,
    ACTION_ONLY: 0,
    UNSPECIFIED: 0
  };

  for (const candidate of options.actions) {
    actionCounts[candidate.action] += 1;
    sizeKindCounts[candidate.sizeKind] += 1;
  }

  return {
    candidateCount: options.candidateCount,
    actionCounts,
    sizeKindCounts,
    warningCount: options.warnings.length
  };
}

interface MutableCandidate {
  action: DetectedAction;
  sizeKind: ActionSizingSizeKind;
  sizeBb?: number;
  sizeLabel: string;
  confidence: ActionSizingConfidence;
  sourceIds: Set<string>;
  examples: ActionSizingOptionExample[];
}

interface SolutionContext {
  sourceId: string;
  treeConfig: string | null;
  sourceFile: string | null;
  heroPosition: string | null;
  tableSize: number | null;
  heroStackBb: number | null;
  canonicalKey: string | null;
  actionPath: string[];
  example: ActionSizingOptionExample;
}

function buildContext(solution: ActionSizingSolutionLike, index: number): SolutionContext {
  const spot = solution.spot as SpotInput;
  const canonicalKey = normalizeString(solution.canonicalKey);
  const sourceFile = normalizeString(solution.fileName) ?? normalizeString(solution.sourceLabel);
  const treeConfig =
    normalizeString(solution.treeConfig) ?? normalizeString((solution.spot as unknown as Record<string, unknown>)?.treeConfig);
  const heroPosition = normalizeString(spot.heroPosition);
  const tableSize = Number.isFinite(spot.tableSize) ? spot.tableSize : spot.players.length;
  const heroStackBb = resolveHeroStackBb(spot);
  const actionPath = Array.isArray(spot.actionPath) ? [...spot.actionPath] : [];
  const sourceId = canonicalKey ?? `${sourceFile ?? "solution"}#${index}`;
  const example: ActionSizingOptionExample = {
    canonicalKey,
    heroPosition,
    tableSize: Number.isFinite(tableSize) ? tableSize : null,
    heroStackBb,
    treeConfig,
    sourceFile,
    actionPath
  };
  return {
    sourceId,
    treeConfig,
    sourceFile,
    heroPosition,
    tableSize: Number.isFinite(tableSize) ? tableSize : null,
    heroStackBb,
    canonicalKey,
    actionPath,
    example
  };
}

function buildSourceMetadata(solution: ActionSizingSolutionLike): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  if (solution.fileName) {
    metadata.fileName = solution.fileName;
  }
  if (solution.sourceLabel) {
    metadata.sourceLabel = solution.sourceLabel;
  }
  if (solution.databaseFeatures && typeof solution.databaseFeatures === "object") {
    metadata.databaseFeatures = solution.databaseFeatures;
  }
  if (solution.metadata && typeof solution.metadata === "object") {
    metadata.metadata = solution.metadata;
  }
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function passesFilter(spot: SpotInput, context: SolutionContext, filter: ActionSizingFilter): boolean {
  if (filter.heroPosition) {
    if ((context.heroPosition ?? "").toUpperCase() !== filter.heroPosition.trim().toUpperCase()) {
      return false;
    }
  }

  const expectedTableSize = filter.tableSize ?? filter.remainingPlayers;
  if (expectedTableSize !== undefined) {
    if (context.tableSize !== expectedTableSize) {
      return false;
    }
  }

  if (filter.minHeroStackBb !== undefined) {
    if (context.heroStackBb === null || context.heroStackBb < filter.minHeroStackBb) {
      return false;
    }
  }
  if (filter.maxHeroStackBb !== undefined) {
    if (context.heroStackBb === null || context.heroStackBb > filter.maxHeroStackBb) {
      return false;
    }
  }

  if (filter.treeConfig) {
    const expected = filter.treeConfig.trim().toUpperCase();
    if ((context.treeConfig ?? "").toUpperCase() !== expected) {
      return false;
    }
  }

  if (filter.sourceFileIncludes) {
    const needle = filter.sourceFileIncludes.toUpperCase();
    if (!(context.sourceFile ?? "").toUpperCase().includes(needle)) {
      return false;
    }
  }

  if (filter.canonicalKeyIncludes) {
    const needle = filter.canonicalKeyIncludes.toUpperCase();
    if (!(context.canonicalKey ?? "").toUpperCase().includes(needle)) {
      return false;
    }
  }

  if (filter.actionPathPrefix && filter.actionPathPrefix.length > 0) {
    const prefix = filter.actionPathPrefix.map((token) => token.trim().toUpperCase());
    const normalizedPath = spot.actionPath.map((token) => token.trim().toUpperCase());
    if (prefix.length > normalizedPath.length) {
      return false;
    }
    for (let i = 0; i < prefix.length; i += 1) {
      if (normalizedPath[i] !== prefix[i]) {
        return false;
      }
    }
  }

  return true;
}

function resolveHeroStackBb(spot: SpotInput): number | null {
  const byHeroFlag = spot.players.find((player) => player.isHero);
  if (byHeroFlag && Number.isFinite(byHeroFlag.stackBb)) {
    return byHeroFlag.stackBb;
  }
  const bySeat = spot.players.find((player) => player.seat === spot.heroSeat);
  if (bySeat && Number.isFinite(bySeat.stackBb)) {
    return bySeat.stackBb;
  }
  const byPosition = spot.players.find(
    (player) => player.position.trim().toUpperCase() === spot.heroPosition.trim().toUpperCase()
  );
  if (byPosition && Number.isFinite(byPosition.stackBb)) {
    return byPosition.stackBb;
  }
  return null;
}

function dedupeNumericSignals(signals: SizeSignal[]): SizeSignal[] {
  const map = new Map<string, SizeSignal>();
  for (const signal of signals) {
    const key = `${signal.valueBb ?? "null"}|${signal.source}`;
    if (!map.has(key)) {
      map.set(key, signal);
      continue;
    }
    const existing = map.get(key)!;
    if (higherConfidence(confidenceFromSignal(signal), confidenceFromSignal(existing)) === confidenceFromSignal(signal)) {
      map.set(key, signal);
    }
  }
  return Array.from(map.values());
}

function confidenceFromSignal(signal: SizeSignal): ActionSizingConfidence {
  if (signal.source === "EXPLICIT_FIELD") {
    return "HIGH";
  }
  if (signal.source === "ACTION_PATH_TOKEN") {
    return "MEDIUM";
  }
  return "LOW";
}

function buildCandidateKey(action: DetectedAction, sizeKind: ActionSizingSizeKind, sizeLabel: string, sizeBb?: number): string {
  return `${action}|${sizeKind}|${sizeLabel}|${sizeBb ?? "null"}`;
}

function pushExample(examples: ActionSizingOptionExample[], example: ActionSizingOptionExample): void {
  if (examples.some((item) => item.canonicalKey && item.canonicalKey === example.canonicalKey)) {
    return;
  }
  if (examples.length >= 3) {
    return;
  }
  examples.push(example);
}

function sortCandidates(left: ActionSizingOption, right: ActionSizingOption): number {
  if (left.action !== right.action) {
    return left.action.localeCompare(right.action);
  }
  if (left.sizeKind !== right.sizeKind) {
    return left.sizeKind.localeCompare(right.sizeKind);
  }
  if (left.sizeBb !== undefined && right.sizeBb !== undefined && left.sizeBb !== right.sizeBb) {
    return left.sizeBb - right.sizeBb;
  }
  return left.sizeLabel.localeCompare(right.sizeLabel);
}

function higherConfidence(left: ActionSizingConfidence, right: ActionSizingConfidence): ActionSizingConfidence {
  const rank: Record<ActionSizingConfidence, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  return rank[left] >= rank[right] ? left : right;
}

function trimZeros(value: number): string {
  const text = value.toFixed(3);
  return text.replace(/\.?0+$/, "");
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

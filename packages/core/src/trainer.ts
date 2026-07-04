import { canonicalSpotKey } from "./canonical.js";
import { HAND_KEYS } from "./hands.js";
import { RESULT_SOURCES, type EvSummary, type HandAction, type ResultSource, type SpotInput, type StrategyMatrix } from "./types.js";

export type TrainerChoiceAction = "SHOVE" | "FOLD";

export interface TrainerProblemSourceSolution {
  source?: ResultSource | null;
  canonicalKey?: string | null;
  sourceLabel?: string | null;
  spot?: SpotInput | null;
  strategy?: StrategyMatrix | null;
  evSummary?: EvSummary | null;
  metadata?: Record<string, unknown> | null;
}

export interface TrainerProblemSpotSummary {
  heroPosition: string;
  tableSize: number;
  heroStackBb: number | null;
  treeConfig: string | null;
  actionPath: string[];
}

export interface TrainerProblem {
  problemId: string;
  source: typeof RESULT_SOURCES.HRC_PRECOMPUTED_DB;
  sourceLabel: string;
  canonicalKey: string;
  spotSummary: TrainerProblemSpotSummary;
  hand: string;
  choices: TrainerChoiceAction[];
  correctAction: HandAction;
  frequency: number;
  ev: number | null;
  evLabel: string;
  explanation: string[];
}

export type TrainerProblemBuildErrorCode =
  | "INVALID_SOURCE"
  | "UNSUPPORTED_SOURCE"
  | "MISSING_SPOT"
  | "MISSING_STRATEGY"
  | "EMPTY_STRATEGY"
  | "HAND_NOT_FOUND"
  | "MISSING_ACTION"
  | "MISSING_FREQUENCY"
  | "INVALID_ACTION"
  | "INVALID_FREQUENCY";

export interface TrainerProblemBuildError {
  ok: false;
  error: {
    code: TrainerProblemBuildErrorCode;
    message: string;
  };
}

export interface TrainerProblemBuildSuccess {
  ok: true;
  problem: TrainerProblem;
}

export type TrainerProblemBuildResult = TrainerProblemBuildSuccess | TrainerProblemBuildError;

export interface BuildTrainerProblemOptions {
  hand?: string;
  randomSeed?: number | string;
}

export interface TrainerGradeResult {
  isCorrect: boolean;
  selectedAction: TrainerChoiceAction;
  correctAction: HandAction;
  frequency: number;
  ev: number | null;
  evLabel: string;
}

export function buildTrainerProblemFromSolution(
  solution: TrainerProblemSourceSolution,
  options: BuildTrainerProblemOptions = {}
): TrainerProblemBuildResult {
  const source = solution.source;
  if (source === undefined || source === null) {
    return buildError("INVALID_SOURCE", "trainer problem generation requires a source value");
  }
  if (source !== RESULT_SOURCES.HRC_PRECOMPUTED_DB) {
    return buildError("UNSUPPORTED_SOURCE", `trainer problem generation supports only ${RESULT_SOURCES.HRC_PRECOMPUTED_DB}`);
  }

  if (!solution.spot) {
    return buildError("MISSING_SPOT", "trainer problem generation requires spot data");
  }

  const strategy = solution.strategy;
  if (!strategy) {
    return buildError("MISSING_STRATEGY", "trainer problem generation requires strategy data");
  }

  const selectedHand = selectHand(strategy, options.hand, options.randomSeed);
  if (!selectedHand.ok) {
    return selectedHand;
  }

  const hand = selectedHand.hand;
  const entry = strategy[hand] as { action?: unknown; frequency?: unknown; evPush?: unknown; evFold?: unknown } | undefined;
  if (!entry) {
    return buildError("HAND_NOT_FOUND", `strategy entry not found for hand '${hand}'`);
  }
  if (typeof entry.action !== "string") {
    return buildError("MISSING_ACTION", `strategy.${hand}.action is required`);
  }
  const normalizedAction = entry.action.toUpperCase();
  if (normalizedAction !== "SHOVE" && normalizedAction !== "FOLD" && normalizedAction !== "MIXED") {
    return buildError("INVALID_ACTION", `strategy.${hand}.action must be SHOVE, FOLD, or MIXED`);
  }
  const action = normalizedAction as HandAction;
  if (typeof entry.frequency !== "number") {
    return buildError("MISSING_FREQUENCY", `strategy.${hand}.frequency is required`);
  }
  if (!Number.isFinite(entry.frequency) || entry.frequency < 0 || entry.frequency > 1) {
    return buildError("INVALID_FREQUENCY", `strategy.${hand}.frequency must be between 0 and 1`);
  }

  const canonicalKey = solution.canonicalKey && solution.canonicalKey.trim().length > 0 ? solution.canonicalKey : canonicalSpotKey(solution.spot);
  const ev = resolveEv(action, entry, solution.evSummary ?? null);

  return {
    ok: true,
    problem: {
      problemId: `${canonicalKey}::${hand}`,
      source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
      sourceLabel: "HRC 사전 계산 DB 정확 매칭",
      canonicalKey,
      spotSummary: {
        heroPosition: solution.spot.heroPosition,
        tableSize: solution.spot.tableSize,
        heroStackBb: findHeroStackBb(solution.spot),
        treeConfig: readTreeConfig(solution.metadata),
        actionPath: [...solution.spot.actionPath]
      },
      hand,
      choices: ["SHOVE", "FOLD"],
      correctAction: action,
      frequency: entry.frequency,
      ev,
      evLabel: ev === null ? "제공되지 않음" : String(ev),
      explanation: [
        "HRC 사전 계산 DB의 정확 매칭 solution에서 생성된 문제입니다."
      ]
    }
  };
}

export function gradeTrainerAnswer(problem: TrainerProblem, answer: TrainerChoiceAction): TrainerGradeResult {
  return {
    isCorrect: answer === problem.correctAction,
    selectedAction: answer,
    correctAction: problem.correctAction,
    frequency: problem.frequency,
    ev: problem.ev,
    evLabel: problem.evLabel
  };
}

function selectHand(
  strategy: StrategyMatrix,
  requestedHand: string | undefined,
  randomSeed: number | string | undefined
): TrainerProblemBuildError | { ok: true; hand: string } {
  const candidateHands = HAND_KEYS.filter((hand) => strategy[hand] !== undefined);
  if (candidateHands.length === 0) {
    return buildError("EMPTY_STRATEGY", "strategy has no usable hand entries");
  }

  if (requestedHand) {
    const normalizedRequested = requestedHand.trim();
    if (!candidateHands.includes(normalizedRequested)) {
      return buildError("HAND_NOT_FOUND", `requested hand '${requestedHand}' is not present in strategy`);
    }
    return { ok: true, hand: normalizedRequested };
  }

  const index = seededIndex(randomSeed, candidateHands.length);
  return {
    ok: true,
    hand: candidateHands[index]!
  };
}

function seededIndex(seed: number | string | undefined, count: number): number {
  if (count <= 1) {
    return 0;
  }

  if (seed === undefined) {
    return 0;
  }

  const seedNumber = typeof seed === "number" ? seed : [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const normalized = Math.abs(Math.trunc(seedNumber));
  return normalized % count;
}

function resolveEv(
  action: HandAction,
  entry: { evPush?: unknown; evFold?: unknown },
  evSummary: EvSummary | null
): number | null {
  const handEv =
    action === "SHOVE" ? asFiniteNumber(entry.evPush)
      : action === "FOLD" ? asFiniteNumber(entry.evFold)
        : null;
  if (handEv !== null) {
    return handEv;
  }

  const summaryEv =
    action === "SHOVE" ? asFiniteNumber(evSummary?.shoveEv)
      : action === "FOLD" ? asFiniteNumber(evSummary?.foldEv)
        : null;
  return summaryEv;
}

function findHeroStackBb(spot: SpotInput): number | null {
  const bySeat = spot.players.find((player) => player.seat === spot.heroSeat);
  if (bySeat && Number.isFinite(bySeat.stackBb)) {
    return bySeat.stackBb;
  }
  const byHeroFlag = spot.players.find((player) => player.isHero);
  if (byHeroFlag && Number.isFinite(byHeroFlag.stackBb)) {
    return byHeroFlag.stackBb;
  }
  const byPosition = spot.players.find((player) => player.position === spot.heroPosition);
  if (byPosition && Number.isFinite(byPosition.stackBb)) {
    return byPosition.stackBb;
  }
  return null;
}

function readTreeConfig(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) {
    return null;
  }
  const direct = metadata.treeConfig;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const nested = metadata.databaseFeatures;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const actionTags = (nested as Record<string, unknown>).actionTags;
    if (Array.isArray(actionTags) && actionTags.every((item) => typeof item === "string")) {
      return actionTags.length > 0 ? actionTags.join(", ") : null;
    }
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildError(code: TrainerProblemBuildErrorCode, message: string): TrainerProblemBuildError {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

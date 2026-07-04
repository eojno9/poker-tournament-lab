import type { AnalyzeRequest, RangePreset, SpotInput } from "@poker-tournament-lab/core";

export type VillainPresetOption = RangePreset | "custom";
export type AnalyzeInputMode = "form" | "json";
export type TreeConfigOption = "open_shove_only";

export interface AnalyzeFormPlayer {
  seat: number;
  position: string;
  stackBb: number;
  inHand: boolean;
  isHero: boolean;
  villainPreset: VillainPresetOption;
  callRangePct: number;
}

export interface AnalyzeFormState {
  tableSize: number;
  heroSeat: number;
  heroPosition: string;
  potBb: number;
  blinds: {
    smallBb: number;
    bigBb: number;
    anteBb: number;
  };
  players: AnalyzeFormPlayer[];
  payoutsText: string;
  actionPathText: string;
  treeConfig: TreeConfigOption;
  equitySamples: number;
}

export interface AnalyzeRequestBuildResult {
  request: AnalyzeRequest | null;
  errors: string[];
}

export interface AnalyzeFormFromSpotResult {
  formState: AnalyzeFormState;
  warnings: string[];
}

const POSITIONS_BY_SIZE: Record<number, string[]> = {
  2: ["SB", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["CO", "BTN", "SB", "BB"],
  5: ["HJ", "CO", "BTN", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  7: ["UTG", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
  8: ["UTG", "UTG+1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
  9: ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
  10: ["UTG", "UTG+1", "UTG+2", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"]
};

export function positionsForTableSize(tableSize: number): string[] {
  const size = clampInt(tableSize, 2, 10);
  const fallback = POSITIONS_BY_SIZE[6] ?? ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  return [...(POSITIONS_BY_SIZE[size] ?? fallback)];
}

export function defaultAnalyzeFormState(seed: SpotInput): AnalyzeFormState {
  return analyzeFormStateFromSpot(seed).formState;
}

export function analyzeFormStateFromSpot(spot: SpotInput): AnalyzeFormFromSpotResult {
  const warnings = new Set<string>();
  const tableSize = clampInt(toFiniteNumber(spot.tableSize), 2, 10);
  const heroSeat = clampInt(toFiniteNumber(spot.heroSeat), 1, tableSize);
  const positions = positionsForTableSize(tableSize);

  const bySeat = new Map<number, SpotInput["players"][number]>();
  for (const player of spot.players ?? []) {
    if (Number.isFinite(player.seat) && player.seat >= 1 && player.seat <= tableSize) {
      bySeat.set(player.seat, player);
    }
  }

  const players: AnalyzeFormPlayer[] = [];
  for (let index = 0; index < tableSize; index += 1) {
    const seat = index + 1;
    const sourcePlayer = bySeat.get(seat);
    const fallbackPosition = positions[index] ?? `SEAT${seat}`;

    const stackBb = Number.isFinite(sourcePlayer?.stackBb) && (sourcePlayer?.stackBb ?? 0) > 0 ? sourcePlayer!.stackBb : 20;
    if (!sourcePlayer || !Number.isFinite(sourcePlayer.stackBb) || sourcePlayer.stackBb <= 0) {
      warnings.add(`Seat ${seat} stack 값이 없어 기본값 20BB를 사용했습니다.`);
    }

    const callRangePct =
      Number.isFinite(sourcePlayer?.callRangePct) && (sourcePlayer?.callRangePct ?? 0) >= 0
        ? Number(sourcePlayer?.callRangePct)
        : 16;
    const preset = isVillainPresetOption(sourcePlayer?.rangePreset) ? sourcePlayer.rangePreset : "standard";

    players.push({
      seat,
      position: normalizeText(sourcePlayer?.position ?? fallbackPosition),
      stackBb,
      inHand: typeof sourcePlayer?.inHand === "boolean" ? sourcePlayer.inHand : true,
      isHero: seat === heroSeat,
      villainPreset: preset,
      callRangePct
    });
  }

  const heroPosition = players.find((player) => player.seat === heroSeat)?.position ?? normalizeText(spot.heroPosition);
  if (!heroPosition) {
    warnings.add("Hero position이 비어 있어 좌석 기본값으로 채웠습니다.");
  }

  const payouts = Array.isArray(spot.payouts) ? spot.payouts.filter((value) => Number.isFinite(value)) : [];
  if (payouts.length === 0) {
    warnings.add("Payout 정보가 없어 비어 있는 상태로 불러왔습니다.");
  }

  const actionPath =
    Array.isArray(spot.actionPath) && spot.actionPath.length > 0
      ? spot.actionPath.map((token) => normalizeText(token)).filter((token) => token.length > 0)
      : [];
  if (actionPath.length === 0) {
    warnings.add("Action path 정보가 없어 비어 있는 상태로 불러왔습니다.");
  }

  const formState: AnalyzeFormState = {
    tableSize,
    heroSeat,
    heroPosition: heroPosition || normalizeText(spot.heroPosition) || "UNKNOWN",
    potBb: Number.isFinite(spot.potBb) ? spot.potBb : 0,
    blinds: {
      smallBb: Number.isFinite(spot.blinds?.smallBb) ? spot.blinds.smallBb : 0.5,
      bigBb: Number.isFinite(spot.blinds?.bigBb) ? spot.blinds.bigBb : 1,
      anteBb: Number.isFinite(spot.blinds?.anteBb) ? spot.blinds.anteBb : 0
    },
    players,
    payoutsText: payouts.join(", "),
    actionPathText: actionPath.join(", "),
    treeConfig: "open_shove_only",
    equitySamples: 80
  };

  return {
    formState,
    warnings: Array.from(warnings)
  };
}

export function resizePlayers(state: AnalyzeFormState, nextTableSize: number): AnalyzeFormState {
  const tableSize = clampInt(nextTableSize, 2, 10);
  const positions = positionsForTableSize(tableSize);
  const heroSeat = clampInt(state.heroSeat, 1, tableSize);

  const players: AnalyzeFormPlayer[] = [];
  for (let i = 0; i < tableSize; i += 1) {
    const seat = i + 1;
    const existing = state.players.find((player) => player.seat === seat);
    players.push({
      seat,
      position: existing?.position ?? positions[i] ?? `SEAT${seat}`,
      stackBb: existing?.stackBb ?? 20,
      inHand: existing?.inHand ?? true,
      isHero: seat === heroSeat,
      villainPreset: existing?.villainPreset ?? "standard",
      callRangePct: existing?.callRangePct ?? 16
    });
  }

  return {
    ...state,
    tableSize,
    heroSeat,
    heroPosition: players.find((player) => player.seat === heroSeat)?.position ?? state.heroPosition,
    players
  };
}

export function buildAnalyzeRequestFromForm(state: AnalyzeFormState): AnalyzeRequestBuildResult {
  const errors: string[] = [];

  const tableSize = clampInt(toFiniteNumber(state.tableSize), 2, 10);
  if (!Number.isFinite(state.tableSize) || tableSize !== state.tableSize) {
    errors.push("remaining players는 2~10 범위여야 합니다.");
  }

  const heroSeat = clampInt(toFiniteNumber(state.heroSeat), 1, tableSize);
  const heroPlayer = state.players.find((player) => player.seat === heroSeat);
  if (!heroPlayer) {
    errors.push("hero seat가 players 목록에 없습니다.");
  }

  const smallBb = Number(state.blinds.smallBb);
  const bigBb = Number(state.blinds.bigBb);
  const anteBb = Number(state.blinds.anteBb);
  const potBb = Number(state.potBb);
  if (!Number.isFinite(smallBb) || smallBb <= 0) {
    errors.push("small blind는 0보다 큰 숫자여야 합니다.");
  }
  if (!Number.isFinite(bigBb) || bigBb <= 0) {
    errors.push("big blind는 0보다 큰 숫자여야 합니다.");
  }
  if (!Number.isFinite(anteBb) || anteBb < 0) {
    errors.push("ante는 0 이상 숫자여야 합니다.");
  }
  if (!Number.isFinite(potBb) || potBb < 0) {
    errors.push("pot BB는 0 이상 숫자여야 합니다.");
  }

  const actionPath = parseTokenList(state.actionPathText);
  if (actionPath.length === 0) {
    errors.push("action path를 1개 이상 입력해 주세요.");
  }

  const payoutParse = parseNumberListDetailed(state.payoutsText);
  if (payoutParse.hasNoValues) {
    errors.push("payout 값을 입력해 주세요.");
  }
  if (payoutParse.hasEmptyToken) {
    errors.push("payout에 빈 값이 있습니다.");
  }
  if (payoutParse.invalidTokens.length > 0) {
    errors.push(`payout에 숫자가 아닌 값이 있습니다: ${payoutParse.invalidTokens.join(", ")}`);
  }
  const payouts = payoutParse.values;
  if (payouts.length !== tableSize) {
    errors.push("payouts 개수는 remaining players 수와 같아야 합니다.");
  }

  const players = state.players
    .slice(0, tableSize)
    .map((player) => ({
      seat: player.seat,
      position: normalizeText(player.position),
      stackBb: Number(player.stackBb),
      inHand: Boolean(player.inHand),
      isHero: player.seat === heroSeat,
      ...(player.villainPreset !== "custom" ? { rangePreset: player.villainPreset as RangePreset } : {}),
      ...(Number.isFinite(player.callRangePct) ? { callRangePct: Number(player.callRangePct) } : {})
    }))
    .sort((a, b) => a.seat - b.seat);

  const invalidStack = players.find((player) => !Number.isFinite(player.stackBb) || player.stackBb <= 0);
  if (invalidStack) {
    errors.push(`seat ${invalidStack.seat}의 stackBB는 0보다 큰 숫자여야 합니다.`);
  }

  if (errors.length > 0) {
    return { request: null, errors };
  }

  const request: AnalyzeRequest = {
    spot: {
      gameType: "NLHE_MTT",
      tournamentType: "REGULAR",
      decisionType: "PUSH_FOLD",
      street: "PREFLOP",
      tableSize,
      heroSeat,
      heroPosition: normalizeText(state.heroPosition || heroPlayer?.position || ""),
      potBb,
      blinds: {
        smallBb,
        bigBb,
        anteBb
      },
      players,
      payouts,
      actionPath
    },
    villainRanges: players
      .filter((player) => !player.isHero)
      .map((player) => ({
        seat: player.seat,
        ...(player.rangePreset ? { preset: player.rangePreset } : {}),
        ...(typeof player.callRangePct === "number" ? { callRangePct: player.callRangePct } : {})
      })),
    fallbackOptions: {
      equitySamples: clampInt(toFiniteNumber(state.equitySamples), 20, 600)
    }
  };

  return { request, errors: [] };
}

interface NumberListParseResult {
  values: number[];
  invalidTokens: string[];
  hasEmptyToken: boolean;
  hasNoValues: boolean;
}

function parseNumberListDetailed(input: string): NumberListParseResult {
  const tokens = String(input ?? "").split(/[,\n]/).map((token) => token.trim());
  const values: number[] = [];
  const invalidTokens: string[] = [];
  let hasEmptyToken = false;

  for (const token of tokens) {
    if (token.length === 0) {
      hasEmptyToken = true;
      continue;
    }
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      invalidTokens.push(token);
      continue;
    }
    values.push(parsed);
  }

  return {
    values,
    invalidTokens,
    hasEmptyToken,
    hasNoValues: values.length === 0
  };
}

function parseTokenList(input: string): string[] {
  return String(input ?? "")
    .split(/[,\n]/)
    .map((token) => normalizeText(token))
    .filter((token) => token.length > 0);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return Number(value);
}

function normalizeText(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toUpperCase();
}

function isVillainPresetOption(value: unknown): value is VillainPresetOption {
  return value === "tight" || value === "standard" || value === "loose" || value === "custom";
}

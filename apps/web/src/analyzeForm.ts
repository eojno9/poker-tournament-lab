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
  return {
    tableSize: clampInt(seed.tableSize, 2, 10),
    heroSeat: seed.heroSeat,
    heroPosition: normalizeText(seed.heroPosition),
    potBb: seed.potBb,
    blinds: {
      smallBb: seed.blinds.smallBb,
      bigBb: seed.blinds.bigBb,
      anteBb: seed.blinds.anteBb
    },
    players: seed.players.map((player) => ({
      seat: player.seat,
      position: normalizeText(player.position),
      stackBb: player.stackBb,
      inHand: player.inHand,
      isHero: Boolean(player.isHero),
      villainPreset: player.rangePreset ?? "standard",
      callRangePct: typeof player.callRangePct === "number" ? player.callRangePct : 16
    })),
    payoutsText: seed.payouts.join(", "),
    actionPathText: seed.actionPath.join(", "),
    treeConfig: "open_shove_only",
    equitySamples: 80
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

  const tableSize = clampInt(state.tableSize, 2, 10);
  if (tableSize !== state.tableSize) {
    errors.push("remaining players는 2~10 범위여야 합니다.");
  }

  const heroSeat = clampInt(state.heroSeat, 1, tableSize);
  const heroPlayer = state.players.find((player) => player.seat === heroSeat);
  if (!heroPlayer) {
    errors.push("hero seat가 players 목록에 없습니다.");
  }

  const actionPath = parseTokenList(state.actionPathText);
  if (actionPath.length === 0) {
    errors.push("action path를 1개 이상 입력해 주세요.");
  }

  const payouts = parseNumberList(state.payoutsText);
  if (payouts.length !== tableSize) {
    errors.push("payouts 개수는 remaining players 수와 같아야 합니다.");
  }

  const players = state.players
    .slice(0, tableSize)
    .map((player) => ({
      seat: player.seat,
      position: normalizeText(player.position),
      stackBb: toFinite(player.stackBb),
      inHand: Boolean(player.inHand),
      isHero: player.seat === heroSeat,
      ...(player.villainPreset !== "custom" ? { rangePreset: player.villainPreset as RangePreset } : {}),
      ...(Number.isFinite(player.callRangePct) ? { callRangePct: toFinite(player.callRangePct) } : {})
    }))
    .sort((a, b) => a.seat - b.seat);

  const invalidStack = players.find((player) => !Number.isFinite(player.stackBb) || player.stackBb <= 0);
  if (invalidStack) {
    errors.push("player stackBB는 0보다 큰 숫자여야 합니다.");
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
      potBb: toFinite(state.potBb),
      blinds: {
        smallBb: toFinite(state.blinds.smallBb),
        bigBb: toFinite(state.blinds.bigBb),
        anteBb: toFinite(state.blinds.anteBb)
      },
      players,
      payouts: payouts.map((value) => toFinite(value)),
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
      equitySamples: clampInt(state.equitySamples, 20, 600)
    }
  };

  return { request, errors: [] };
}

function parseNumberList(input: string): number[] {
  return input
    .split(/[,\n]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));
}

function parseTokenList(input: string): string[] {
  return input
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

function toFinite(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value);
}

function normalizeText(input: string): string {
  return String(input ?? "")
    .trim()
    .toUpperCase();
}

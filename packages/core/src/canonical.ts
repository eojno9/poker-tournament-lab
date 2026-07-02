import type { PlayerState, SpotInput } from "./types.js";

export function normalizeSpot(input: SpotInput): SpotInput {
  return {
    gameType: "NLHE_MTT",
    tournamentType: "REGULAR",
    decisionType: "PUSH_FOLD",
    street: input.street ?? "PREFLOP",
    tableSize: integer(input.tableSize),
    heroSeat: integer(input.heroSeat),
    heroPosition: normalizeText(input.heroPosition),
    potBb: fixed(input.potBb),
    blinds: {
      smallBb: fixed(input.blinds?.smallBb ?? 0.5),
      bigBb: fixed(input.blinds?.bigBb ?? 1),
      anteBb: fixed(input.blinds?.anteBb ?? 0)
    },
    players: [...(input.players ?? [])]
      .map(normalizePlayer)
      .sort((a, b) => a.seat - b.seat),
    payouts: [...(input.payouts ?? [])].map(fixed),
    actionPath: [...(input.actionPath ?? [])].map(normalizeText)
  };
}

export function canonicalSpotKey(input: SpotInput): string {
  return stableStringify(normalizeSpot(input));
}

export function validateSpotShape(input: SpotInput): string[] {
  const missing: string[] = [];
  if (input.gameType !== "NLHE_MTT") {
    missing.push("gameType must be NLHE_MTT");
  }
  if (input.tournamentType !== "REGULAR") {
    missing.push("tournamentType must be REGULAR");
  }
  if (input.decisionType !== "PUSH_FOLD") {
    missing.push("decisionType must be PUSH_FOLD");
  }
  if (input.street && !["PREFLOP", "FLOP", "TURN", "RIVER"].includes(input.street)) {
    missing.push("street must be PREFLOP, FLOP, TURN, or RIVER");
  }
  if (!Number.isFinite(input.tableSize) || input.tableSize < 2 || input.tableSize > 10) {
    missing.push("tableSize must be between 2 and 10");
  }
  if (!Number.isFinite(input.heroSeat)) {
    missing.push("heroSeat is required");
  }
  if (!input.heroPosition) {
    missing.push("heroPosition is required");
  }
  if (!Number.isFinite(input.potBb) || input.potBb <= 0) {
    missing.push("potBb must be greater than 0");
  }
  if (!input.blinds) {
    missing.push("blinds are required");
  }
  if (!Array.isArray(input.players) || input.players.length < 2 || input.players.length > 10) {
    missing.push("players must include 2 to 10 remaining players");
  }
  if (!Array.isArray(input.payouts) || input.payouts.length === 0) {
    missing.push("payouts are required");
  }
  return missing;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function normalizePlayer(player: PlayerState): PlayerState {
  const normalized: PlayerState = {
    seat: integer(player.seat),
    position: normalizeText(player.position),
    stackBb: fixed(player.stackBb),
    inHand: Boolean(player.inHand),
    isHero: Boolean(player.isHero)
  };

  if (player.rangePreset) {
    normalized.rangePreset = player.rangePreset;
  }
  if (typeof player.callRangePct === "number") {
    normalized.callRangePct = fixed(player.callRangePct);
  }
  return normalized;
}

function normalizeText(value: string): string {
  return String(value ?? "").trim().toUpperCase();
}

function integer(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function fixed(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(3));
}

import type { HandStrategy, RangePreset, StrategyMatrix } from "./types.js";

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = `${Rank}${Suit}`;

export const HAND_KEYS: string[] = (() => {
  const hands: string[] = [];
  for (let row = 0; row < RANKS.length; row += 1) {
    for (let col = 0; col < RANKS.length; col += 1) {
      const first = RANKS[row]!;
      const second = RANKS[col]!;
      if (row === col) {
        hands.push(`${first}${second}`);
      } else if (row < col) {
        hands.push(`${first}${second}s`);
      } else {
        hands.push(`${second}${first}o`);
      }
    }
  }
  return hands;
})();

export const DEFAULT_RANGE_PRESETS: Record<RangePreset, number> = {
  tight: 9,
  standard: 16,
  loose: 28
};

export function emptyStrategyMatrix(action: HandStrategy["action"] = "FOLD"): StrategyMatrix {
  return Object.fromEntries(
    HAND_KEYS.map((hand) => [
      hand,
      {
        action,
        frequency: action === "SHOVE" ? 1 : 0
      }
    ])
  );
}

export function normalizeStrategyMatrix(input: unknown): StrategyMatrix {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("strategy must be an object keyed by 169-hand notation");
  }

  const source = input as Record<string, unknown>;
  const matrix = emptyStrategyMatrix();

  for (const hand of HAND_KEYS) {
    const raw = source[hand];
    if (raw === undefined) {
      continue;
    }

    if (typeof raw === "number") {
      const frequency = clamp(raw, 0, 1);
      matrix[hand] = {
        action: actionFromFrequency(frequency),
        frequency
      };
      continue;
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`strategy.${hand} must be a number or object`);
    }

    const value = raw as Record<string, unknown>;
    const frequency = clamp(numberOr(value.frequency, value.shoveFrequency, 0), 0, 1);
    const action = stringOr(value.action, actionFromFrequency(frequency)).toUpperCase();
    if (action !== "SHOVE" && action !== "FOLD" && action !== "MIXED") {
      throw new Error(`strategy.${hand}.action must be SHOVE, FOLD, or MIXED`);
    }

    matrix[hand] = {
      action,
      frequency,
      ...(typeof value.evPush === "number" ? { evPush: value.evPush } : {}),
      ...(typeof value.evFold === "number" ? { evFold: value.evFold } : {}),
      ...(typeof value.equityWhenCalled === "number" ? { equityWhenCalled: value.equityWhenCalled } : {}),
      ...(typeof value.label === "string" ? { label: value.label } : {})
    };
  }

  return matrix;
}

export function handScore(hand: string): number {
  const parsed = parseHandKey(hand);
  if (!parsed) {
    return 0;
  }

  const high = rankValue(parsed.high);
  const low = rankValue(parsed.low);
  const gap = Math.abs(rankIndex(parsed.high) - rankIndex(parsed.low));

  if (parsed.kind === "pair") {
    return 500 + high * 22;
  }

  let score = high * 17 + low * 8;
  if (parsed.kind === "suited") {
    score += 28;
  }
  if (gap === 1) {
    score += 18;
  } else if (gap === 2) {
    score += 10;
  } else if (gap === 3) {
    score += 4;
  }
  if (high >= 12 && low >= 10) {
    score += 12;
  }

  return score;
}

export function topHandsForPct(pct: number): Set<string> {
  const count = Math.max(1, Math.min(HAND_KEYS.length, Math.round((HAND_KEYS.length * clamp(pct, 0, 100)) / 100)));
  return new Set([...HAND_KEYS].sort((a, b) => handScore(b) - handScore(a)).slice(0, count));
}

export function combosForHand(hand: string): Array<[Card, Card]> {
  const parsed = parseHandKey(hand);
  if (!parsed) {
    return [];
  }

  if (parsed.kind === "pair") {
    const cards = SUITS.map((suit) => `${parsed.high}${suit}` as Card);
    const combos: Array<[Card, Card]> = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        combos.push([cards[i]!, cards[j]!]);
      }
    }
    return combos;
  }

  const combos: Array<[Card, Card]> = [];
  for (const suitA of SUITS) {
    for (const suitB of SUITS) {
      if (parsed.kind === "suited" && suitA !== suitB) {
        continue;
      }
      if (parsed.kind === "offsuit" && suitA === suitB) {
        continue;
      }
      combos.push([`${parsed.high}${suitA}` as Card, `${parsed.low}${suitB}` as Card]);
    }
  }
  return combos;
}

export function combosForRangePct(pct: number): Array<[Card, Card]> {
  const hands = topHandsForPct(pct);
  return [...hands].flatMap((hand) => combosForHand(hand));
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}` as Card);
    }
  }
  return deck;
}

export function parseHandKey(hand: string): { high: Rank; low: Rank; kind: "pair" | "suited" | "offsuit" } | null {
  const normalized = hand.trim();
  const first = normalized[0] as Rank | undefined;
  const second = normalized[1] as Rank | undefined;
  if (!first || !second || !RANKS.includes(first) || !RANKS.includes(second)) {
    return null;
  }
  if (first === second) {
    return normalized.length === 2 ? { high: first, low: second, kind: "pair" } : null;
  }
  const suffix = normalized[2];
  if (suffix !== "s" && suffix !== "o") {
    return null;
  }

  const firstIndex = rankIndex(first);
  const secondIndex = rankIndex(second);
  const high = firstIndex < secondIndex ? first : second;
  const low = firstIndex < secondIndex ? second : first;
  return { high, low, kind: suffix === "s" ? "suited" : "offsuit" };
}

export function rankValue(rank: Rank): number {
  return 14 - rankIndex(rank);
}

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

function actionFromFrequency(frequency: number): HandStrategy["action"] {
  if (frequency >= 0.995) {
    return "SHOVE";
  }
  if (frequency <= 0.005) {
    return "FOLD";
  }
  return "MIXED";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function numberOr(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

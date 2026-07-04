import { canonicalSpotKey, validateSpotShape } from "./canonical.js";
import { heroIcmValue } from "./icm.js";
import {
  DEFAULT_RANGE_PRESETS,
  HAND_KEYS,
  combosForHand,
  combosForRangePct,
  fullDeck,
  rankValue,
  type Card
} from "./hands.js";
import {
  RESULT_SOURCES,
  type AnalyzeRequest,
  type AnalyzeResult,
  type FallbackVillainRange,
  type HandStrategy,
  type PlayerState,
  type RangeOverride
} from "./types.js";

export const FALLBACK_MODEL_VERSION = "fallback-icm-monte-carlo-v1";

export function evaluateFallbackIcm(request: AnalyzeRequest): AnalyzeResult {
  const missing = validateFallbackRequirements(request);
  const canonicalKey = canonicalSpotKey(request.spot);

  if (missing.length > 0) {
    return {
      source: RESULT_SOURCES.NOT_SOLVED,
      sourceLabel: "NOT_SOLVED",
      canonicalKey,
      assumptions: [],
      limitations: [
        "No exact HRC_PRECOMPUTED_DB match and fallback requirements are incomplete.",
        "No guessing and no heuristic recommendation is produced in this state."
      ],
      strategy: null,
      evSummary: null,
      missingRequirements: missing
    };
  }

  const spot = request.spot;
  const players = spot.players.map((player) => ({ ...player }));
  const rangeEdits = collectRangeEdits(request.villainRanges ?? []);
  applyRangeOverrides(players, request.villainRanges ?? []);

  const heroIndex = players.findIndex((player) => player.seat === spot.heroSeat || player.isHero);
  const villains = players.filter((player, index) => index !== heroIndex && player.inHand && player.stackBb > 0);
  const stacks = players.map((player) => player.stackBb);
  const payouts = [...spot.payouts];
  const foldEv = heroIcmValue(stacks, payouts, heroIndex);
  const samples = Math.max(20, Math.min(600, request.fallbackOptions?.equitySamples ?? 80));
  const equityCache = new Map<string, number>();

  const strategyEntries = HAND_KEYS.map((hand) => {
    const shoveEv = shoveIcmEv({
      hand,
      players,
      heroIndex,
      villains,
      payouts,
      potBb: spot.potBb,
      samples,
      equityCache
    });
    const delta = shoveEv - foldEv;
    const action: HandStrategy["action"] = Math.abs(delta) < 0.0001 ? "MIXED" : delta > 0 ? "SHOVE" : "FOLD";
    const frequency = action === "SHOVE" ? 1 : action === "FOLD" ? 0 : 0.5;
    return [hand, { action, frequency, evPush: round(shoveEv), evFold: round(foldEv) }] as const;
  });

  const strategy = Object.fromEntries(strategyEntries);
  const shoveCount = Object.values(strategy).filter((entry) => entry.action === "SHOVE").length;
  const limitations = [
    "Regular NLHE push/fold only.",
    "This is an ICM EV evaluation, not a Nash solution.",
    "Villain calling ranges are assumptions, not solved equilibrium ranges.",
    "Hand equity is approximated with deterministic Monte Carlo sampling.",
    "No postflop solving, PKO, bounty, satellite, multi-street tree, or live/RTA support."
  ];

  return {
    source: RESULT_SOURCES.FALLBACK_ICM,
    sourceLabel: "Fallback ICM EV evaluator",
    canonicalKey,
    assumptions: [
      "Fallback ICM is an EV evaluator for hero shove/fold decisions.",
      "Stacks are interpreted as current remaining BB stacks.",
      "Fold EV is computed as current stack ICM equity.",
      "Villain calling ranges are seat-level assumptions from presets and user overrides."
    ],
    limitations,
    strategy,
    evSummary: {
      bestAction: shoveCount > HAND_KEYS.length / 2 ? "SHOVE" : "FOLD",
      foldEv: round(foldEv),
      deltaEv: round(shoveCount / HAND_KEYS.length),
      unit: "prize",
      notes: [`${shoveCount} of ${HAND_KEYS.length} starting hands are evaluated as SHOVE.`]
    },
    metadata: {
      modelVersion: FALLBACK_MODEL_VERSION,
      equitySamples: samples
    },
    fallbackMetadata: {
      modelVersion: FALLBACK_MODEL_VERSION,
      villainRanges: buildVillainRangeMetadata(villains, rangeEdits),
      limitations: [
        "This is an ICM EV evaluation, not a Nash solution.",
        "Villain calling ranges are assumptions, not solved equilibrium ranges."
      ]
    }
  };
}

export function validateFallbackRequirements(request: AnalyzeRequest): string[] {
  const missing = validateSpotShape(request.spot);
  const spot = request.spot;

  if (spot.gameType !== "NLHE_MTT") {
    missing.push("fallback supports regular NLHE MTT only");
  }
  if (spot.tournamentType !== "REGULAR") {
    missing.push("fallback does not support PKO, bounty, satellites, or custom tournament types");
  }
  if (spot.decisionType !== "PUSH_FOLD") {
    missing.push("fallback supports hero push/fold decisions only");
  }
  if (spot.players.length < 2 || spot.players.length > 10) {
    missing.push("fallback requires 2 to 10 remaining players");
  }

  const heroMatches = spot.players.filter((player) => player.seat === spot.heroSeat || player.isHero);
  if (heroMatches.length !== 1) {
    missing.push("exactly one hero player must match heroSeat");
  }
  if (spot.players.some((player) => !Number.isFinite(player.stackBb) || player.stackBb <= 0)) {
    missing.push("all remaining player stacks must be greater than 0 BB");
  }
  if (spot.payouts.length !== spot.players.length) {
    missing.push("fallback requires one payout value per remaining player, including 0 for unpaid places");
  }
  if (spot.payouts.some((payout) => !Number.isFinite(payout) || payout < 0)) {
    missing.push("payout values must be non-negative numbers");
  }
  for (let i = 1; i < spot.payouts.length; i += 1) {
    if ((spot.payouts[i - 1] ?? 0) < (spot.payouts[i] ?? 0)) {
      missing.push("payouts must be sorted from highest to lowest");
      break;
    }
  }

  return [...new Set(missing)];
}

function applyRangeOverrides(players: PlayerState[], overrides: RangeOverride[]): void {
  for (const override of overrides) {
    const player = players.find((candidate) => candidate.seat === override.seat);
    if (!player) {
      continue;
    }
    if (override.preset) {
      player.rangePreset = override.preset;
    }
    if (typeof override.callRangePct === "number") {
      player.callRangePct = override.callRangePct;
    }
  }
}

function collectRangeEdits(overrides: RangeOverride[]): Map<number, { presetEdited: boolean; callRangeEdited: boolean }> {
  const edits = new Map<number, { presetEdited: boolean; callRangeEdited: boolean }>();
  for (const override of overrides) {
    const current = edits.get(override.seat) ?? { presetEdited: false, callRangeEdited: false };
    edits.set(override.seat, {
      presetEdited: current.presetEdited || typeof override.preset === "string",
      callRangeEdited: current.callRangeEdited || typeof override.callRangePct === "number"
    });
  }
  return edits;
}

function buildVillainRangeMetadata(
  villains: PlayerState[],
  rangeEdits: Map<number, { presetEdited: boolean; callRangeEdited: boolean }>
): FallbackVillainRange[] {
  return [...villains]
    .sort((a, b) => a.seat - b.seat)
    .map((villain) => {
      const edit = rangeEdits.get(villain.seat);
      const editedByUser = Boolean(edit?.presetEdited || edit?.callRangeEdited);
      const hasPreset = typeof villain.rangePreset === "string";
      const hasCustomCallRange = typeof villain.callRangePct === "number";
      const presetName: FallbackVillainRange["presetName"] = edit?.callRangeEdited
        ? "custom"
        : hasPreset
          ? villain.rangePreset ?? "standard"
          : hasCustomCallRange
            ? "custom"
            : "standard";

      return {
        seat: villain.seat,
        position: villain.position,
        presetName,
        editedByUser,
        callRangePct: round(callRangePct(villain)),
        rangeSource: editedByUser ? "user_override" : "preset"
      };
    });
}

function shoveIcmEv(args: {
  hand: string;
  players: PlayerState[];
  heroIndex: number;
  villains: PlayerState[];
  payouts: number[];
  potBb: number;
  samples: number;
  equityCache: Map<string, number>;
}): number {
  const { players, heroIndex, villains, payouts, potBb } = args;
  const heroStack = players[heroIndex]?.stackBb ?? 0;
  const subsetCount = 1 << villains.length;
  let ev = 0;

  for (let mask = 0; mask < subsetCount; mask += 1) {
    const callers = villains.filter((_, index) => (mask & (1 << index)) !== 0);
    const probability = villains.reduce((product, villain, index) => {
      const pct = callRangePct(villain) / 100;
      return product * ((mask & (1 << index)) !== 0 ? pct : 1 - pct);
    }, 1);

    if (probability <= 0) {
      continue;
    }

    if (callers.length === 0) {
      const stacks = players.map((player, index) => (index === heroIndex ? player.stackBb + potBb : player.stackBb));
      ev += probability * heroIcmValue(stacks, payouts, heroIndex);
      continue;
    }

    const callerPcts = callers.map(callRangePct);
    const equity = estimateHandEquity(args.hand, callerPcts, args.samples, args.equityCache);
    const winStacks = players.map((player) => player.stackBb);
    const loseStacks = players.map((player) => player.stackBb);

    let totalCall = 0;
    for (const caller of callers) {
      const callerIndex = players.findIndex((player) => player.seat === caller.seat);
      const callAmount = Math.min(heroStack, caller.stackBb);
      totalCall += callAmount;
      winStacks[callerIndex] = Math.max(0, (winStacks[callerIndex] ?? 0) - callAmount);
    }
    winStacks[heroIndex] = heroStack + potBb + totalCall;
    loseStacks[heroIndex] = 0;

    ev += probability * (equity * heroIcmValue(winStacks, payouts, heroIndex) + (1 - equity) * heroIcmValue(loseStacks, payouts, heroIndex));
  }

  return ev;
}

function callRangePct(player: PlayerState): number {
  if (typeof player.callRangePct === "number" && Number.isFinite(player.callRangePct)) {
    return clamp(player.callRangePct, 0, 100);
  }
  if (player.rangePreset) {
    return DEFAULT_RANGE_PRESETS[player.rangePreset];
  }
  return DEFAULT_RANGE_PRESETS.standard;
}

function estimateHandEquity(hand: string, callerPcts: number[], samples: number, cache: Map<string, number>): number {
  const key = `${hand}:${callerPcts.map((pct) => Math.round(pct * 10) / 10).join("/")}:${samples}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const heroCombos = combosForHand(hand);
  const villainRanges = callerPcts.map((pct) => combosForRangePct(pct));
  if (heroCombos.length === 0 || villainRanges.some((range) => range.length === 0)) {
    return 0;
  }

  const rng = seededRandom(hashString(key));
  let equity = 0;
  let completed = 0;

  for (let sample = 0; sample < samples; sample += 1) {
    const used = new Set<Card>();
    const hero = pickCombo(heroCombos, used, rng);
    if (!hero) {
      continue;
    }
    const villains: Array<[Card, Card]> = [];
    let valid = true;
    for (const range of villainRanges) {
      const combo = pickCombo(range, used, rng);
      if (!combo) {
        valid = false;
        break;
      }
      villains.push(combo);
    }
    if (!valid) {
      continue;
    }

    const deck = fullDeck().filter((card) => !used.has(card));
    shuffle(deck, rng);
    const board = deck.slice(0, 5);
    const heroRank = evaluateSeven([...hero, ...board]);
    const villainRanks = villains.map((combo) => evaluateSeven([...combo, ...board]));
    const best = Math.max(heroRank, ...villainRanks);
    if (heroRank === best) {
      const winners = 1 + villainRanks.filter((rank) => rank === best).length;
      equity += 1 / winners;
    }
    completed += 1;
  }

  const value = completed > 0 ? equity / completed : 0;
  cache.set(key, value);
  return value;
}

function pickCombo(combos: Array<[Card, Card]>, used: Set<Card>, rng: () => number): [Card, Card] | null {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const combo = combos[Math.floor(rng() * combos.length)];
    if (!combo) {
      return null;
    }
    if (!used.has(combo[0]) && !used.has(combo[1])) {
      used.add(combo[0]);
      used.add(combo[1]);
      return combo;
    }
  }
  return null;
}

function evaluateSeven(cards: Card[]): number {
  const ranks = cards.map((card) => card[0]!).map((rank) => rankValue(rank as never));
  const suits = cards.map((card) => card[1]!);
  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }

  const flushSuit = suits.find((suit) => suits.filter((candidate) => candidate === suit).length >= 5);
  const flushRanks = flushSuit ? cards.filter((card) => card[1] === flushSuit).map((card) => rankValue(card[0] as never)) : [];
  const straightFlush = flushRanks.length >= 5 ? highestStraight(flushRanks) : 0;
  if (straightFlush) {
    return encodeRank(8, [straightFlush]);
  }

  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const quads = groups.find(([, count]) => count === 4)?.[0] ?? 0;
  if (quads) {
    return encodeRank(7, [quads, ...kickers(ranks, [quads], 1)]);
  }

  const trips = groups.filter(([, count]) => count === 3).map(([rank]) => rank);
  const pairs = groups.filter(([, count]) => count === 2).map(([rank]) => rank);
  if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
    return encodeRank(6, [trips[0]!, trips[1] ?? pairs[0]!]);
  }

  if (flushRanks.length >= 5) {
    return encodeRank(5, [...new Set(flushRanks)].sort((a, b) => b - a).slice(0, 5));
  }

  const straight = highestStraight(ranks);
  if (straight) {
    return encodeRank(4, [straight]);
  }

  if (trips.length > 0) {
    return encodeRank(3, [trips[0]!, ...kickers(ranks, [trips[0]!], 2)]);
  }

  if (pairs.length >= 2) {
    return encodeRank(2, [pairs[0]!, pairs[1]!, ...kickers(ranks, [pairs[0]!, pairs[1]!], 1)]);
  }

  if (pairs.length === 1) {
    return encodeRank(1, [pairs[0]!, ...kickers(ranks, [pairs[0]!], 3)]);
  }

  return encodeRank(0, [...new Set(ranks)].sort((a, b) => b - a).slice(0, 5));
}

function highestStraight(ranks: number[]): number {
  const unique = [...new Set(ranks)];
  if (unique.includes(14)) {
    unique.push(1);
  }
  unique.sort((a, b) => b - a);
  for (let i = 0; i <= unique.length - 5; i += 1) {
    const window = unique.slice(i, i + 5);
    if (window[0]! - window[4]! === 4) {
      return window[0]!;
    }
  }
  return 0;
}

function kickers(ranks: number[], exclude: number[], count: number): number[] {
  return [...new Set(ranks)]
    .filter((rank) => !exclude.includes(rank))
    .sort((a, b) => b - a)
    .slice(0, count);
}

function encodeRank(category: number, values: number[]): number {
  return values.reduce((score, value, index) => score + value * 15 ** (4 - index), category * 15 ** 5);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

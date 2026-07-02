import type { HrcImportPayload, SpotInput } from "@poker-tournament-lab/core";
import { HAND_KEYS } from "@poker-tournament-lab/core";

export const defaultSpot: SpotInput = {
  gameType: "NLHE_MTT",
  tournamentType: "REGULAR",
  decisionType: "PUSH_FOLD",
  street: "PREFLOP",
  tableSize: 6,
  heroSeat: 1,
  heroPosition: "CO",
  potBb: 2.4,
  blinds: {
    smallBb: 0.5,
    bigBb: 1,
    anteBb: 0.15
  },
  players: [
    { seat: 1, position: "CO", stackBb: 12, inHand: true, isHero: true },
    { seat: 2, position: "BTN", stackBb: 18, inHand: true, rangePreset: "standard", callRangePct: 16 },
    { seat: 3, position: "SB", stackBb: 10, inHand: true, rangePreset: "loose", callRangePct: 24 },
    { seat: 4, position: "BB", stackBb: 22, inHand: true, rangePreset: "standard", callRangePct: 18 },
    { seat: 5, position: "UTG", stackBb: 14, inHand: false, rangePreset: "tight", callRangePct: 9 },
    { seat: 6, position: "HJ", stackBb: 16, inHand: false, rangePreset: "tight", callRangePct: 9 }
  ],
  payouts: [1000, 720, 510, 350, 220, 120],
  actionPath: ["FOLD", "FOLD", "HERO_DECISION"]
};

export const sampleImportPayload: HrcImportPayload = {
  format: "json",
  sourceLabel: "Sample HRC normalized DB",
  fileName: "sample-hrc-normalized.json",
  content: JSON.stringify(
    [
      {
        externalId: "sample-co-12bb",
        sourceLabel: "Sample HRC normalized DB",
        spot: defaultSpot,
        strategy: Object.fromEntries(
          HAND_KEYS.map((hand, index) => [
            hand,
            {
              action: index < 44 ? "SHOVE" : "FOLD",
              frequency: index < 44 ? 1 : 0,
              evPush: index < 44 ? 410 + index : 300 - index,
              evFold: 365
            }
          ])
        ),
        evSummary: {
          bestAction: "SHOVE",
          shoveEv: 410,
          foldEv: 365,
          deltaEv: 45,
          unit: "prize",
          notes: ["샘플 데이터입니다."]
        }
      }
    ],
    null,
    2
  )
};

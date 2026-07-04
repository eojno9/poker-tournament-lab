import { describe, expect, it } from "vitest";
import {
  HAND_KEYS,
  RESULT_SOURCES,
  diffCanonicalInputs,
  calculateIcm,
  canonicalSpotKey,
  classifyHrcDatabaseFile,
  evaluateFallbackIcm,
  parseCsv,
  parseHrcImport,
  type SpotInput
} from "../src/index.js";

const completeSpot: SpotInput = {
  gameType: "NLHE_MTT",
  tournamentType: "REGULAR",
  decisionType: "PUSH_FOLD",
  street: "PREFLOP",
  tableSize: 3,
  heroSeat: 1,
  heroPosition: "BTN",
  potBb: 1.8,
  blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
  players: [
    { seat: 1, position: "BTN", stackBb: 10, inHand: true, isHero: true },
    { seat: 2, position: "SB", stackBb: 12, inHand: true, rangePreset: "standard", callRangePct: 16 },
    { seat: 3, position: "BB", stackBb: 14, inHand: true, rangePreset: "tight", callRangePct: 10 }
  ],
  payouts: [500, 300, 0],
  actionPath: ["HERO_DECISION"]
};

describe("canonical spot keys", () => {
  it("are stable for player order after normalization", () => {
    const shuffled = { ...completeSpot, players: [...completeSpot.players].reverse() };
    expect(canonicalSpotKey(shuffled)).toEqual(canonicalSpotKey(completeSpot));
  });
});

describe("canonical key diff viewer", () => {
  it("returns sameCanonicalKey=true for identical spots", () => {
    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: completeSpot });
    expect(result.sameCanonicalKey).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("keeps sameCanonicalKey=true when only field order differs", () => {
    const reorderedSpot: SpotInput = {
      tournamentType: completeSpot.tournamentType,
      gameType: completeSpot.gameType,
      decisionType: completeSpot.decisionType,
      tableSize: completeSpot.tableSize,
      heroPosition: completeSpot.heroPosition,
      heroSeat: completeSpot.heroSeat,
      potBb: completeSpot.potBb,
      street: completeSpot.street,
      blinds: {
        bigBb: completeSpot.blinds.bigBb,
        anteBb: completeSpot.blinds.anteBb,
        smallBb: completeSpot.blinds.smallBb
      },
      payouts: [...completeSpot.payouts],
      actionPath: [...completeSpot.actionPath],
      players: [...completeSpot.players].map((player) => ({
        stackBb: player.stackBb,
        position: player.position,
        seat: player.seat,
        inHand: player.inHand,
        isHero: player.isHero,
        rangePreset: player.rangePreset,
        callRangePct: player.callRangePct
      }))
    };

    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: reorderedSpot });
    expect(result.sameCanonicalKey).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("detects stack differences", () => {
    const modified = {
      ...completeSpot,
      players: completeSpot.players.map((player) => (player.seat === 1 ? { ...player, stackBb: 10.1 } : player))
    };
    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: modified });
    expect(result.sameCanonicalKey).toBe(false);
    expect(result.differences.some((difference) => difference.field.startsWith("stacks."))).toBe(true);
  });

  it("detects ante differences", () => {
    const modified = {
      ...completeSpot,
      blinds: { ...completeSpot.blinds, anteBb: 0.2 }
    };
    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: modified });
    expect(result.differences.some((difference) => difference.field === "ante")).toBe(true);
  });

  it("detects payout differences", () => {
    const modified = {
      ...completeSpot,
      payouts: [500, 250, 50]
    };
    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: modified });
    expect(result.differences.some((difference) => difference.field === "payouts")).toBe(true);
  });

  it("detects action path differences", () => {
    const modified = {
      ...completeSpot,
      actionPath: ["FOLD", "HERO_DECISION"]
    };
    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: modified });
    expect(result.differences.some((difference) => difference.field === "actionPath")).toBe(true);
  });

  it("detects hero position differences", () => {
    const modified = {
      ...completeSpot,
      heroPosition: "CO"
    };
    const result = diffCanonicalInputs({ spot: completeSpot }, { spot: modified });
    expect(result.differences.some((difference) => difference.field === "heroPosition")).toBe(true);
  });
});

describe("HRC import parsing", () => {
  it("accepts normalized JSON and builds canonical keys", () => {
    const parsed = parseHrcImport({
      format: "json",
      content: JSON.stringify([{ spot: completeSpot, strategy: { AA: 1 }, sourceLabel: "unit HRC" }])
    });

    expect(parsed.records).toHaveLength(1);
    expect(parsed.canonicalKeys[0]).toEqual(canonicalSpotKey(completeSpot));
    expect(parsed.records[0]?.strategy.AA?.action).toEqual("SHOVE");
  });

  it("parses quoted CSV cells", () => {
    expect(parseCsv("a,b\n\"x,y\",z")).toEqual([
      ["a", "b"],
      ["x,y", "z"]
    ]);
  });

  it("marks limp/LIMP files as preflop-only", () => {
    const features = classifyHrcDatabaseFile("MTT_10P_RFI_20BB_LIMP9_OPEN_9_3BET1_4BET1_DEPTH_5.zip");

    expect(features.preflopOnly).toBe(true);
    expect(features.streetScope).toEqual("PREFLOP_ONLY");
    expect(features.playerCount).toEqual(10);
    expect(features.stackDepthBb).toEqual(20);
    expect(features.treeDepth).toEqual(5);
  });

  it("detects stack depth when bb is directly before the extension", () => {
    expect(classifyHrcDatabaseFile("50bb.zip").stackDepthBb).toEqual(50);
  });

  it("rejects postflop spots from limp/LIMP preflop-only imports", () => {
    expect(() =>
      parseHrcImport({
        format: "json",
        fileName: "MTT_10P_RFI_20BB_LIMP9_OPEN_9_3BET1_4BET1_DEPTH_5.zip",
        content: JSON.stringify([{ spot: { ...completeSpot, street: "FLOP" }, strategy: { AA: 1 } }])
      })
    ).toThrow("PREFLOP_ONLY");
  });
});

describe("ICM", () => {
  it("splits equal stacks evenly in winner-take-all heads-up", () => {
    expect(calculateIcm([10, 10], [100, 0])).toEqual([50, 50]);
  });
});

describe("fallback ICM", () => {
  it("returns NOT_SOLVED when full payouts are missing", () => {
    const result = evaluateFallbackIcm({
      spot: { ...completeSpot, payouts: [500, 300] }
    });

    expect(result.source).toEqual(RESULT_SOURCES.NOT_SOLVED);
    expect(result.strategy).toBeNull();
    expect(result.missingRequirements).toContain("fallback requires one payout value per remaining player, including 0 for unpaid places");
  });

  it("evaluates complete FT/SNG-style push-fold spots", () => {
    const result = evaluateFallbackIcm({
      spot: completeSpot,
      fallbackOptions: { equitySamples: 20 }
    });

    expect(result.source).toEqual(RESULT_SOURCES.FALLBACK_ICM);
    expect(Object.keys(result.strategy ?? {})).toHaveLength(HAND_KEYS.length);
    expect(result.limitations.join(" ")).toContain("PKO");
  });

  it("includes villain range metadata in fallback payload", () => {
    const result = evaluateFallbackIcm({
      spot: completeSpot,
      villainRanges: [{ seat: 2, preset: "loose" }]
    });

    expect(result.source).toEqual(RESULT_SOURCES.FALLBACK_ICM);
    expect(result.fallbackMetadata?.modelVersion).toEqual("fallback-icm-monte-carlo-v1");
    expect(result.fallbackMetadata?.limitations.join(" ")).toContain("not a Nash solution");
    expect(result.fallbackMetadata?.villainRanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seat: 2,
          presetName: "loose",
          editedByUser: true,
          rangeSource: "user_override"
        }),
        expect.objectContaining({
          seat: 3,
          presetName: "tight"
        })
      ])
    );
  });

  it("marks user call-range override as editedByUser and custom", () => {
    const result = evaluateFallbackIcm({
      spot: completeSpot,
      villainRanges: [{ seat: 3, callRangePct: 18.5 }]
    });

    const bbRange = result.fallbackMetadata?.villainRanges.find((entry) => entry.seat === 3);
    expect(bbRange).toMatchObject({
      seat: 3,
      presetName: "custom",
      editedByUser: true,
      callRangePct: 18.5,
      rangeSource: "user_override"
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  extractAvailableActionSizingOptions,
  summarizeActionSizingOptions,
  type ActionSizingSolutionLike,
  type SpotInput,
  type StrategyMatrix
} from "../src/index.js";

function createSpot(overrides: Partial<SpotInput> = {}): SpotInput {
  const base: SpotInput = {
    gameType: "NLHE_MTT",
    tournamentType: "REGULAR",
    decisionType: "PUSH_FOLD",
    street: "PREFLOP",
    tableSize: 6,
    heroSeat: 6,
    heroPosition: "BTN",
    potBb: 1.5,
    blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
    players: [
      { seat: 1, position: "UTG", stackBb: 16, inHand: true },
      { seat: 2, position: "HJ", stackBb: 14, inHand: true },
      { seat: 3, position: "CO", stackBb: 13, inHand: true },
      { seat: 4, position: "BTN", stackBb: 12, inHand: true, isHero: true },
      { seat: 5, position: "SB", stackBb: 10, inHand: true },
      { seat: 6, position: "BB", stackBb: 11, inHand: true }
    ],
    payouts: [0.5, 0.3, 0.2, 0, 0, 0],
    actionPath: ["FOLD", "FOLD", "HERO_DECISION"]
  };
  return { ...base, ...overrides };
}

function createSolution(
  id: string,
  spot: SpotInput,
  strategy: StrategyMatrix = {},
  extras: Partial<ActionSizingSolutionLike> = {}
): ActionSizingSolutionLike {
  return {
    canonicalKey: `key-${id}`,
    spot,
    strategy,
    fileName: `mtt_${id}.json`,
    sourceLabel: "HRC",
    ...extras
  };
}

describe("extractAvailableActionSizingOptions", () => {
  it("extracts SHOVE/FOLD candidates from strategy", () => {
    const strategy: StrategyMatrix = {
      AA: { action: "SHOVE", frequency: 1 },
      "22": { action: "FOLD", frequency: 1 }
    };
    const result = extractAvailableActionSizingOptions([createSolution("s1", createSpot(), strategy)]);

    expect(result.actions.some((item) => item.action === "SHOVE" && item.sizeKind === "ALL_IN")).toBe(true);
    expect(result.actions.some((item) => item.action === "FOLD" && item.sizeKind === "ACTION_ONLY")).toBe(true);
  });

  it("separates ALL_IN/SHOVE from RAISE size", () => {
    const shoveSpot = createSpot({ actionPath: ["UTG_ALL_IN", "HERO_DECISION"] });
    const raiseSpot = createSpot({ actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"] });
    const result = extractAvailableActionSizingOptions([
      createSolution("shove", shoveSpot),
      createSolution("raise", raiseSpot)
    ]);

    expect(result.actions.some((item) => item.action === "ALL_IN" && item.sizeKind === "ALL_IN")).toBe(true);
    expect(result.actions.some((item) => item.action === "RAISE" && item.sizeKind === "RAISE_SIZE" && item.sizeBb === 2.2)).toBe(
      true
    );
    expect(result.actions.some((item) => item.sizeKind === "ALL_IN" && item.sizeBb !== undefined)).toBe(false);
  });

  it("prefers explicit numeric size with high confidence when available", () => {
    const enriched = {
      ...createSpot({ actionPath: ["OPEN_2.2BB", "HERO_DECISION"] }),
      raiseSizeBb: 2.5
    } as SpotInput & { raiseSizeBb: number };
    const result = extractAvailableActionSizingOptions([
      createSolution("explicit", enriched, {}, { treeConfig: "OPEN_TREE" })
    ]);

    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "RAISE",
          sizeKind: "RAISE_SIZE",
          sizeBb: 2.5,
          confidence: "HIGH"
        })
      ])
    );
  });

  it("uses UNKNOWN/UNSPECIFIED and warning when size signal is missing", () => {
    const missingSize = createSpot({
      actionPath: ["BTN_ACTION", "HERO_DECISION"]
    });
    const result = extractAvailableActionSizingOptions([
      createSolution("missing", missingSize, {}, { treeConfig: "UNKNOWN_TREE" })
    ]);

    expect(result.actions.some((item) => item.action === "UNKNOWN" && item.sizeKind === "UNSPECIFIED")).toBe(true);
    expect(result.warnings).toContain("size 정보가 없는 solution은 UNKNOWN/UNSPECIFIED 후보로 분리되었습니다.");
  });

  it("dedupes same candidate and counts sources", () => {
    const spotA = createSpot({ actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"] });
    const spotB = createSpot({ actionPath: ["HJ_OPEN_2.2BB", "HERO_DECISION"] });
    const result = extractAvailableActionSizingOptions([createSolution("a", spotA), createSolution("b", spotB)]);

    const candidate = result.actions.find((item) => item.action === "RAISE" && item.sizeKind === "RAISE_SIZE" && item.sizeBb === 2.2);
    expect(candidate?.sourceCount).toBe(2);
  });

  it("filters by heroPosition, tableSize, treeConfig, sourceFileIncludes, canonicalKeyIncludes, and actionPathPrefix", () => {
    const btnSpot = createSpot({
      heroPosition: "BTN",
      tableSize: 6,
      actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"]
    });
    const coSpot = createSpot({
      heroPosition: "CO",
      tableSize: 9,
      actionPath: ["HJ_OPEN_2.5BB", "HERO_DECISION"]
    });

    const solutions = [
      createSolution("btn-good", btnSpot, {}, { treeConfig: "OPEN_SHOVE_ONLY", fileName: "rfi_btn.json" }),
      createSolution("co-other", coSpot, {}, { treeConfig: "OPEN_SHOVE_ONLY", fileName: "rfi_co.json" })
    ];

    const filtered = extractAvailableActionSizingOptions(solutions, {
      heroPosition: "BTN",
      tableSize: 6,
      treeConfig: "OPEN_SHOVE_ONLY",
      sourceFileIncludes: "btn",
      canonicalKeyIncludes: "btn-good",
      actionPathPrefix: ["UTG_OPEN_2.2BB"]
    });

    expect(filtered.filteredSolutionCount).toBe(1);
    expect(filtered.actions.some((item) => item.sizeBb === 2.2)).toBe(true);
    expect(filtered.actions.some((item) => item.sizeBb === 2.5)).toBe(false);
  });

  it("supports hero stack range filter", () => {
    const lowStack = createSpot({ players: createSpot().players.map((player) => (player.isHero ? { ...player, stackBb: 8 } : player)) });
    const highStack = createSpot({ players: createSpot().players.map((player) => (player.isHero ? { ...player, stackBb: 20 } : player)) });
    const result = extractAvailableActionSizingOptions(
      [createSolution("low", lowStack), createSolution("high", highStack)],
      { minHeroStackBb: 15 }
    );
    expect(result.filteredSolutionCount).toBe(1);
  });

  it("does not invent missing raise size", () => {
    const noNumeric = createSpot({ actionPath: ["UTG_OPEN", "HERO_DECISION"] });
    const result = extractAvailableActionSizingOptions([createSolution("nonumeric", noNumeric, {}, { treeConfig: "OPEN_ONLY" })]);

    expect(result.actions.some((item) => item.action === "RAISE" && item.sizeKind === "RAISE_SIZE")).toBe(false);
  });

  it("builds summary counts", () => {
    const result = extractAvailableActionSizingOptions([
      createSolution("raise", createSpot({ actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"] })),
      createSolution("shove", createSpot({ actionPath: ["UTG_ALL_IN", "HERO_DECISION"] }))
    ]);
    const summary = summarizeActionSizingOptions(result);

    expect(summary.candidateCount).toBe(result.candidateCount);
    expect(summary.actionCounts.RAISE).toBeGreaterThan(0);
    expect(summary.sizeKindCounts.RAISE_SIZE).toBeGreaterThan(0);
  });
});

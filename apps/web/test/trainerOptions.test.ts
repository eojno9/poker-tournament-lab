import assert from "node:assert/strict";
import test from "node:test";
import type { SolutionListItem } from "../src/api.js";
import {
  buildTrainerSourceSolutions,
  defaultTrainerProblemFilters,
  deriveTrainerTreeConfig,
  filterTrainerSolutions,
  normalizeTrainerHandInput,
  parseTrainerSeedInput,
  resolveTrainerSolutionIndex
} from "../src/trainerOptions.js";

function makeSolution(
  id: number,
  overrides: Partial<SolutionListItem> = {}
): SolutionListItem {
  const base: SolutionListItem = {
    id,
    importId: 1,
    canonicalKey: `key-${id}`,
    sourceLabel: "HRC",
    externalId: null,
    importedAt: "2026-06-01T00:00:00.000Z",
    fileName: `source-${id}.zip`,
    fileHash: `hash-${id}`,
    databaseFeatures: {
      fileName: `source-${id}.zip`,
      playerCount: 6,
      stackDepthBb: 20,
      treeDepth: 4,
      calculationModel: "ChipEV",
      spotFamily: id % 2 === 0 ? "RFI" : "OPEN",
      actionTags: [],
      streetScope: "PREFLOP_ONLY",
      preflopOnly: true,
      preflopOnlyReason: "test",
      exportShape: "complete_export",
      warnings: []
    },
    spot: {
      gameType: "NLHE_MTT",
      tournamentType: "REGULAR",
      decisionType: "PUSH_FOLD",
      street: "PREFLOP",
      tableSize: id % 2 === 0 ? 6 : 9,
      heroSeat: 1,
      heroPosition: id % 2 === 0 ? "BTN" : "CO",
      potBb: 1.5,
      blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
      players: [
        { seat: 1, position: "BTN", stackBb: 18, inHand: true, isHero: true },
        { seat: 2, position: "SB", stackBb: 14, inHand: true },
        { seat: 3, position: "BB", stackBb: 20, inHand: true }
      ],
      payouts: [100, 60, 0],
      actionPath: ["FOLD", "HERO_DECISION"]
    },
    strategy: {
      AKo: { action: "SHOVE", frequency: 0.8 }
    },
    evSummary: null
  };
  return { ...base, ...overrides };
}

test("buildTrainerSourceSolutions excludes rows without strategy entries", () => {
  const rows = [
    makeSolution(1),
    makeSolution(2, { strategy: {} })
  ];
  const filtered = buildTrainerSourceSolutions(rows);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, 1);
});

test("filterTrainerSolutions applies hero/table/tree/source filters", () => {
  const rows = [makeSolution(1), makeSolution(2), makeSolution(3, { fileName: "custom-rfi-pack.zip" })];
  const filteredHero = filterTrainerSolutions(rows, {
    ...defaultTrainerProblemFilters,
    heroPosition: "BTN"
  });
  assert.equal(filteredHero.every((row) => row.spot.heroPosition === "BTN"), true);

  const filteredTable = filterTrainerSolutions(rows, {
    ...defaultTrainerProblemFilters,
    tableSize: "9"
  });
  assert.equal(filteredTable.every((row) => row.spot.tableSize === 9), true);

  const filteredTree = filterTrainerSolutions(rows, {
    ...defaultTrainerProblemFilters,
    treeConfig: "RFI"
  });
  assert.equal(filteredTree.every((row) => deriveTrainerTreeConfig(row) === "RFI"), true);

  const filteredSource = filterTrainerSolutions(rows, {
    ...defaultTrainerProblemFilters,
    sourceFile: "custom-rfi"
  });
  assert.equal(filteredSource.length, 1);
  assert.equal(filteredSource[0]?.fileName, "custom-rfi-pack.zip");
});

test("normalizeTrainerHandInput handles empty and trimmed values", () => {
  assert.equal(normalizeTrainerHandInput(""), undefined);
  assert.equal(normalizeTrainerHandInput("   "), undefined);
  assert.equal(normalizeTrainerHandInput("  AKo  "), "AKo");
});

test("parseTrainerSeedInput parses numeric and string seeds", () => {
  assert.equal(parseTrainerSeedInput(""), undefined);
  assert.equal(parseTrainerSeedInput("  "), undefined);
  assert.equal(parseTrainerSeedInput("42"), 42);
  assert.equal(parseTrainerSeedInput("-17"), -17);
  assert.equal(parseTrainerSeedInput("alpha-seed"), "alpha-seed");
});

test("resolveTrainerSolutionIndex is deterministic with and without seed", () => {
  assert.equal(resolveTrainerSolutionIndex(0, 5, ""), 0);
  assert.equal(resolveTrainerSolutionIndex(6, 5, ""), 1);

  const first = resolveTrainerSolutionIndex(0, 7, "seed-x");
  const second = resolveTrainerSolutionIndex(0, 7, "seed-x");
  const next = resolveTrainerSolutionIndex(1, 7, "seed-x");
  assert.equal(first, second);
  assert.equal(next, (first + 1) % 7);
});

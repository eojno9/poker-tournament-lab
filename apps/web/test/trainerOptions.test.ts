import assert from "node:assert/strict";
import test from "node:test";
import type { SolutionListItem } from "../src/api.js";
import {
  TRAINER_FILTERS_STORAGE_KEY,
  TRAINER_LOCAL_STORAGE_KEYS,
  buildTrainerSourceSolutions,
  clearTrainerFilterSettings,
  defaultTrainerProblemFilters,
  deriveTrainerTreeConfig,
  filterTrainerSolutions,
  loadTrainerFilterSettings,
  normalizeTrainerHandInput,
  parseTrainerSeedInput,
  resolveTrainerSolutionIndex,
  saveTrainerFilterSettings
} from "../src/trainerOptions.js";
import { TRAINER_MISTAKES_STORAGE_KEY, TRAINER_RECENT_STORAGE_KEY, type StorageLike } from "../src/trainerHistory.js";

class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    return "{broken";
  }

  setItem(): void {
    throw new Error("localStorage_unavailable");
  }
}

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

test("deriveTrainerTreeConfig uses Korean fallback copy without exposing raw state", () => {
  const row = makeSolution(10, {
    databaseFeatures: {
      ...makeSolution(10).databaseFeatures,
      spotFamily: ""
    },
    spot: {
      ...makeSolution(10).spot,
      actionPath: []
    }
  });

  assert.equal(deriveTrainerTreeConfig(row), "제공되지 않음");
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

test("saves and loads versioned local trainer filter settings", () => {
  const storage = new MemoryStorage();
  const saved = saveTrainerFilterSettings(
    {
      filters: {
        heroPosition: "BTN",
        tableSize: "6",
        treeConfig: "RFI",
        sourceFile: "local-pack"
      },
      handInput: "AKo",
      seedInput: "seed-1"
    },
    storage
  );

  assert.equal(saved, true);
  assert.deepEqual(loadTrainerFilterSettings(storage), {
    filters: {
      heroPosition: "BTN",
      tableSize: "6",
      treeConfig: "RFI",
      sourceFile: "local-pack"
    },
    handInput: "AKo",
    seedInput: "seed-1"
  });
});

test("exposes the current Trainer localStorage key registry", () => {
  assert.deepEqual(TRAINER_LOCAL_STORAGE_KEYS, [
    TRAINER_RECENT_STORAGE_KEY,
    TRAINER_MISTAKES_STORAGE_KEY,
    TRAINER_FILTERS_STORAGE_KEY
  ]);
});

test("loads partial trainer filter settings with safe defaults", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    TRAINER_FILTERS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      filters: {
        heroPosition: "CO",
        tableSize: 6
      },
      handInput: "KQs",
      seedInput: 7
    })
  );

  assert.deepEqual(loadTrainerFilterSettings(storage), {
    filters: {
      heroPosition: "CO",
      tableSize: "",
      treeConfig: "",
      sourceFile: ""
    },
    handInput: "KQs",
    seedInput: ""
  });
});

test("returns default trainer filter settings for corrupt or unknown payloads", () => {
  const storage = new MemoryStorage();
  storage.setItem(TRAINER_FILTERS_STORAGE_KEY, "{broken");
  assert.deepEqual(loadTrainerFilterSettings(storage), {
    filters: defaultTrainerProblemFilters,
    handInput: "",
    seedInput: ""
  });

  storage.setItem(TRAINER_FILTERS_STORAGE_KEY, JSON.stringify({ version: 99, filters: { heroPosition: "BTN" } }));
  assert.deepEqual(loadTrainerFilterSettings(storage), {
    filters: defaultTrainerProblemFilters,
    handInput: "",
    seedInput: ""
  });
});

test("filter clear and write failures keep trainer filters safe", () => {
  const storage = new MemoryStorage();
  saveTrainerFilterSettings(
    {
      filters: { ...defaultTrainerProblemFilters, heroPosition: "BTN" },
      handInput: "AKo",
      seedInput: "1"
    },
    storage
  );

  assert.equal(clearTrainerFilterSettings(storage), true);
  assert.deepEqual(loadTrainerFilterSettings(storage), {
    filters: defaultTrainerProblemFilters,
    handInput: "",
    seedInput: ""
  });

  const throwingStorage = new ThrowingStorage();
  assert.equal(saveTrainerFilterSettings({ filters: defaultTrainerProblemFilters, handInput: "", seedInput: "" }, throwingStorage), false);
  assert.deepEqual(loadTrainerFilterSettings(throwingStorage), {
    filters: defaultTrainerProblemFilters,
    handInput: "",
    seedInput: ""
  });
});

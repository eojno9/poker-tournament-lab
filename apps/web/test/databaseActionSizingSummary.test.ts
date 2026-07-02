import assert from "node:assert/strict";
import test from "node:test";
import type { SolutionListItem } from "../src/api.js";
import { buildDatabaseActionSizingSummary } from "../src/databaseActionSizingSummary.js";
import { defaultSpot } from "../src/sampleData.js";

test("builds database action sizing summary from one solution", () => {
  const row = makeSolutionRow({
    spot: {
      ...defaultSpot,
      actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"]
    }
  });

  const summary = buildDatabaseActionSizingSummary(row);

  assert.equal(summary.actionPathText, "UTG_OPEN_2.2BB, HERO_DECISION");
  assert.equal(summary.treeConfig, "RFI");
  assert.ok(summary.detectedActions.includes("RAISE"));
  assert.ok(summary.detectedRaiseSizes.some((item) => item.sizeBb === 2.2));
});

test("separates all-in/shove from raise sizes", () => {
  const row = makeSolutionRow({
    spot: {
      ...defaultSpot,
      actionPath: ["UTG_OPEN_2.5BB", "BTN_SHOVE", "HERO_DECISION"]
    },
    strategy: {
      AA: { action: "SHOVE", frequency: 1 }
    }
  });

  const summary = buildDatabaseActionSizingSummary(row);

  assert.ok(summary.detectedRaiseSizes.some((item) => item.sizeKind === "RAISE_SIZE" && item.sizeBb === 2.5));
  assert.ok(summary.detectedAllInActions.some((item) => item.action === "SHOVE" && item.sizeKind === "ALL_IN"));
});

test("reports unknown or unspecified sizing warning when size is missing", () => {
  const row = makeSolutionRow({
    fileName: "metadata-no-size.zip",
    spot: {
      ...defaultSpot,
      actionPath: ["BTN_ACTION", "HERO_DECISION"]
    },
    databaseFeatures: {
      ...makeDatabaseFeatures(),
      fileName: "metadata-no-size.zip",
      spotFamily: "UNKNOWN_TREE"
    },
    strategy: {}
  });

  const summary = buildDatabaseActionSizingSummary(row);

  assert.equal(summary.hasUnknownUnspecified, true);
  assert.ok(summary.candidates.some((item) => item.action === "UNKNOWN" && item.sizeKind === "UNSPECIFIED"));
  assert.ok(summary.warnings.some((item) => item.includes("UNKNOWN/UNSPECIFIED")));
});

function makeSolutionRow(overrides: Partial<SolutionListItem> = {}): SolutionListItem {
  const base: SolutionListItem = {
    id: 1,
    importId: 1,
    canonicalKey: "test-key",
    sourceLabel: "HRC",
    externalId: null,
    importedAt: "2026-06-01T00:00:00.000Z",
    fileName: "mtt_6p_rfi_20bb.zip",
    fileHash: "hash",
    databaseFeatures: makeDatabaseFeatures(),
    spot: defaultSpot,
    strategy: {
      AA: { action: "SHOVE", frequency: 1 },
      "22": { action: "FOLD", frequency: 1 }
    },
    evSummary: null
  };
  return { ...base, ...overrides };
}

function makeDatabaseFeatures(): NonNullable<SolutionListItem["databaseFeatures"]> {
  return {
    fileName: "mtt_6p_rfi_20bb.zip",
    playerCount: 6,
    stackDepthBb: 20,
    treeDepth: 4,
    calculationModel: "ChipEV",
    spotFamily: "RFI",
    actionTags: ["RFI"],
    streetScope: "PREFLOP_ONLY",
    preflopOnly: true,
    preflopOnlyReason: null,
    exportShape: "complete_export",
    warnings: []
  };
}

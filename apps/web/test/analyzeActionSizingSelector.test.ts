import assert from "node:assert/strict";
import test from "node:test";
import type { ActionSizingOption } from "@poker-tournament-lab/core";
import type { SolutionListItem } from "../src/api.js";
import {
  applyActionSizingCandidateToForm,
  buildAnalyzeActionSizingFilter,
  buildAnalyzeActionSizingSolutions,
  formatActionSizingOption
} from "../src/analyzeActionSizingSelector.js";
import { defaultAnalyzeFormState } from "../src/analyzeForm.js";
import { defaultSpot } from "../src/sampleData.js";

test("builds analyze action sizing filter from current form state", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  state.heroPosition = "BTN";
  state.tableSize = 6;

  const filter = buildAnalyzeActionSizingFilter(state);

  assert.deepEqual(filter, {
    heroPosition: "BTN",
    tableSize: 6
  });
});

test("maps solution rows into action sizing solution inputs", () => {
  const row = makeSolutionRow();

  const mapped = buildAnalyzeActionSizingSolutions([row]);

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0]?.canonicalKey, "test-key");
  assert.equal(mapped[0]?.fileName, "mtt_6p_rfi_20bb.zip");
  assert.equal(mapped[0]?.treeConfig, "RFI");
  assert.equal(mapped[0]?.spot?.heroPosition, "BTN");
});

test("applies candidate action path to analyze form without running analysis", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  const option = makeOption({
    actionPath: ["UTG_OPEN_2.2BB", "HERO_DECISION"]
  });

  const result = applyActionSizingCandidateToForm(state, option);

  assert.equal(result.formState.actionPathText, "UTG_OPEN_2.2BB, HERO_DECISION");
  assert.equal(result.appliedActionPathText, "UTG_OPEN_2.2BB, HERO_DECISION");
});

test("keeps form unchanged when candidate has no action path example", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  const option = makeOption({ actionPath: [] });

  const result = applyActionSizingCandidateToForm(state, option);

  assert.equal(result.formState, state);
  assert.equal(result.appliedActionPathText, null);
});

test("formats candidate without inventing missing size", () => {
  const formatted = formatActionSizingOption(makeOption({ sizeKind: "UNSPECIFIED", sizeLabel: "unspecified" }));

  assert.equal(formatted, "UNKNOWN / unspecified / UNSPECIFIED");
});

function makeSolutionRow(): SolutionListItem {
  return {
    id: 1,
    importId: 1,
    canonicalKey: "test-key",
    sourceLabel: "HRC",
    externalId: null,
    importedAt: "2026-06-01T00:00:00.000Z",
    fileName: "mtt_6p_rfi_20bb.zip",
    fileHash: "hash",
    databaseFeatures: {
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
    },
    spot: {
      ...defaultSpot,
      heroPosition: "BTN"
    },
    strategy: {
      AA: { action: "SHOVE", frequency: 1 }
    },
    evSummary: null
  };
}

function makeOption(overrides: {
  actionPath?: string[];
  sizeKind?: ActionSizingOption["sizeKind"];
  sizeLabel?: string;
} = {}): ActionSizingOption {
  const actionPath = overrides.actionPath ?? ["FOLD", "HERO_DECISION"];
  const sizeKind = overrides.sizeKind ?? "ALL_IN";
  return {
    action: sizeKind === "UNSPECIFIED" ? "UNKNOWN" : "SHOVE",
    sizeKind,
    sizeLabel: overrides.sizeLabel ?? "all-in",
    sourceCount: 1,
    confidence: "HIGH",
    examples: [
      {
        canonicalKey: "test-key",
        heroPosition: "BTN",
        tableSize: 6,
        heroStackBb: 12,
        treeConfig: "RFI",
        sourceFile: "mtt_6p_rfi_20bb.zip",
        actionPath
      }
    ]
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { classifyActionTreeSpot, type ActionTreeClassification } from "../src/actionTreeClassifier.js";
import { buildBrowserV2Model, type BrowserV2Model } from "../src/browserV2Model.js";
import { actionTreeClassifierSamples } from "./fixtures/actionTreeSampleV2Fixtures.js";

type SampleFixture = (typeof actionTreeClassifierSamples)[number];

interface SampleCandidate {
  name: string;
  actionTree: ActionTreeClassification;
  browserModel: BrowserV2Model;
  sourceMetadata: SampleFixture["input"]["sourceMetadata"];
}

interface CandidateFilters {
  spotType?: string;
  actionNode?: string;
  actionKind?: string;
  sizeLabel?: string;
}

function buildSampleCandidates(): SampleCandidate[] {
  return actionTreeClassifierSamples.map((sample) => ({
    name: sample.name,
    actionTree: classifyActionTreeSpot(sample.input),
    browserModel: buildBrowserV2Model({
      AKo: {
        hand: "AKo",
        actions: sample.input.actions
      }
    }),
    sourceMetadata: sample.input.sourceMetadata
  }));
}

function filterCandidates(candidates: SampleCandidate[], filters: CandidateFilters): SampleCandidate[] {
  return candidates.filter((candidate) => {
    if (filters.spotType && filters.spotType !== "ALL" && candidate.actionTree.spotType !== filters.spotType) {
      return false;
    }
    if (filters.actionNode && filters.actionNode !== "ALL" && candidate.actionTree.actionNode !== filters.actionNode) {
      return false;
    }
    if (
      filters.actionKind &&
      filters.actionKind !== "ALL" &&
      !includesValue(candidate.actionTree.availableActions, filters.actionKind)
    ) {
      return false;
    }
    if (
      filters.sizeLabel &&
      filters.sizeLabel !== "ALL" &&
      !includesValue(candidate.actionTree.availableSizes, filters.sizeLabel)
    ) {
      return false;
    }
    return true;
  });
}

function buildCandidateSummary(candidates: SampleCandidate[], filters: CandidateFilters) {
  const filtered = filterCandidates(candidates, filters);
  return {
    candidateCount: filtered.length,
    currentNode:
      filtered.length > 0 ? `${filtered[0]!.actionTree.spotType} / ${filtered[0]!.actionTree.actionNode}` : "NO_MATCH",
    availableActions: uniqueStrings(filtered.flatMap((candidate) => candidate.actionTree.availableActions)),
    availableSizes: uniqueStrings(filtered.flatMap((candidate) => candidate.actionTree.availableSizes)),
    appliedFilters: Object.entries(filters)
      .filter(([, value]) => value && value !== "ALL")
      .map(([key, value]) => `${key}=${value}`)
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function includesValue(values: readonly string[], value: string): boolean {
  return values.some((candidate) => candidate === value);
}

function assertIncludesAll(actual: readonly string[], expected: readonly string[]): void {
  for (const value of expected) {
    assert.ok(actual.includes(value), `Expected ${JSON.stringify(actual)} to include ${value}`);
  }
}

test("builds TEST_ONLY Browser/action tree candidates for every sample node", () => {
  const candidates = buildSampleCandidates();

  assert.equal(candidates.length, 5);
  assertIncludesAll(
    candidates.map((candidate) => candidate.actionTree.spotType),
    ["RFI", "LIMP", "FACING_OPEN", "FACING_LIMP", "VS_THREE_BET"]
  );
  assertIncludesAll(
    candidates.map((candidate) => candidate.actionTree.actionNode),
    ["OPEN_RAISE", "OPEN_LIMP", "VS_OPEN", "VS_LIMP", "VS_THREE_BET"]
  );

  for (const candidate of candidates) {
    assert.equal(candidate.sourceMetadata.isSample, true);
    assert.equal(candidate.sourceMetadata.testOnly, true);
    assert.equal(candidate.sourceMetadata.calculationModel, "TEST_ONLY_SAMPLE");
    assert.equal(candidate.sourceMetadata.exportShape, "MULTI_ACTION_V2_SAMPLE");
    assert.ok(candidate.browserModel.handCount > 0);
    assert.ok(candidate.browserModel.totalActionCount > 0);
  }
});

test("derives spot type and action node filter options from TEST_ONLY samples", () => {
  const candidates = buildSampleCandidates();
  const spotTypeOptions = ["ALL", ...uniqueStrings(candidates.map((candidate) => candidate.actionTree.spotType))];
  const actionNodeOptions = ["ALL", ...uniqueStrings(candidates.map((candidate) => candidate.actionTree.actionNode))];

  assertIncludesAll(spotTypeOptions, ["ALL", "RFI", "LIMP", "FACING_OPEN", "FACING_LIMP", "VS_THREE_BET"]);
  assertIncludesAll(actionNodeOptions, ["ALL", "OPEN_RAISE", "OPEN_LIMP", "VS_OPEN", "VS_LIMP", "VS_THREE_BET"]);
});

test("computes node-aware candidate summaries from sample action and size data", () => {
  const candidates = buildSampleCandidates();
  const rfiSummary = buildCandidateSummary(candidates, { spotType: "RFI", actionNode: "OPEN_RAISE" });
  const limpSummary = buildCandidateSummary(candidates, { actionKind: "LIMP", sizeLabel: "limp" });
  const facingLimpSummary = buildCandidateSummary(candidates, { spotType: "FACING_LIMP", sizeLabel: "3.5bb" });

  assert.equal(rfiSummary.candidateCount, 1);
  assert.equal(rfiSummary.currentNode, "RFI / OPEN_RAISE");
  assertIncludesAll(rfiSummary.availableActions, ["FOLD", "RAISE", "ALL_IN"]);
  assertIncludesAll(rfiSummary.availableSizes, ["2.2bb", "all-in"]);
  assertIncludesAll(rfiSummary.appliedFilters, ["spotType=RFI", "actionNode=OPEN_RAISE"]);

  assert.equal(limpSummary.candidateCount, 1);
  assert.equal(limpSummary.currentNode, "LIMP / OPEN_LIMP");
  assertIncludesAll(limpSummary.availableActions, ["LIMP", "RAISE", "ALL_IN"]);
  assertIncludesAll(limpSummary.availableSizes, ["limp", "2.5bb"]);

  assert.equal(facingLimpSummary.candidateCount, 1);
  assert.equal(facingLimpSummary.currentNode, "FACING_LIMP / VS_LIMP");
  assertIncludesAll(facingLimpSummary.availableActions, ["CHECK", "RAISE", "ALL_IN"]);
  assertIncludesAll(facingLimpSummary.availableSizes, ["3.5bb", "all-in"]);
});

test("keeps Browser filter empty state safe without nearest recommendation", () => {
  const candidates = buildSampleCandidates();
  const summary = buildCandidateSummary(candidates, {
    spotType: "RFI",
    actionNode: "VS_OPEN",
    actionKind: "CHECK",
    sizeLabel: "99bb"
  });

  assert.equal(summary.candidateCount, 0);
  assert.equal(summary.currentNode, "NO_MATCH");
  assert.deepEqual(summary.availableActions, []);
  assert.deepEqual(summary.availableSizes, []);
  assertIncludesAll(summary.appliedFilters, ["spotType=RFI", "actionNode=VS_OPEN", "actionKind=CHECK", "sizeLabel=99bb"]);
});

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildHrcRawAmountSemanticsReport,
  buildHrcRawAdapterReport,
  buildHrcRawSourceMetadataCandidate,
  buildHrcRawSpotCandidate,
  convertHrcRawNodeToMultiActionStrategy,
  mapHrcActionAmountToSizeLabel,
  mapHrcActionTypeToAppActionKind
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  "fixtures",
  "real-hrc-raw-samples",
  "real-hrc-raw-sample-btn-vs-co-open-25bb.json"
);

describe("HRC raw node adapter", () => {
  it("maps only observed raw HRC action codes conservatively", () => {
    expect(mapHrcActionTypeToAppActionKind("F")).toBe("FOLD");
    expect(mapHrcActionTypeToAppActionKind("C")).toBe("CALL");
    expect(mapHrcActionTypeToAppActionKind("R")).toBe("RAISE");
    expect(mapHrcActionTypeToAppActionKind("mystery")).toBe("UNKNOWN");
    expect(mapHrcActionAmountToSizeLabel(10000)).toBe("HRC amount 10000");
    expect(mapHrcActionAmountToSizeLabel(0)).toBeNull();
  });

  it("converts raw node-level actions into hand -> actions[] candidate strategy", () => {
    const fixture = loadFixture();
    const result = convertHrcRawNodeToMultiActionStrategy(fixture);

    expect(result.report.sourceShape).toBe("HRC_RAW_NODE");
    expect(result.report.targetShape).toBe("APP_V2_MULTI_ACTION_CANDIDATE");
    expect(result.report.isProductImportPayload).toBe(false);
    expect(result.report.productImportRouteConnected).toBe(false);
    expect(result.report.handCount).toBe(169);
    expect(result.report.actionCount).toBe(3);
    expect(result.report.convertedHandCount).toBe(169);
    expect(result.report.convertedActionCount).toBe(507);
    expect(Object.keys(result.strategy)).toHaveLength(169);
    expect(result.strategy["22"]?.actions).toHaveLength(3);
  });

  it("maps played[] to frequency and evs[] to EV by node action index", () => {
    const fixture = loadFixture();
    const result = convertHrcRawNodeToMultiActionStrategy(fixture);
    const hand = result.strategy["22"];

    expect(hand).toBeDefined();
    expect(hand?.actions[0]).toEqual(
      expect.objectContaining({
        action: "FOLD",
        size: null,
        frequency: 0.9955,
        ev: 0,
        sourceActionLabel: "F"
      })
    );
    expect(hand?.actions[1]).toEqual(
      expect.objectContaining({
        action: "CALL",
        size: { rawSizeLabel: "HRC amount 10000" },
        frequency: 0.0037,
        ev: -0.10175,
        sourceActionLabel: "C"
      })
    );
    expect(hand?.actions[2]).toEqual(
      expect.objectContaining({
        action: "RAISE",
        size: { rawSizeLabel: "HRC amount 20000" },
        frequency: 0.0008,
        ev: -0.24285,
        sourceActionLabel: "R"
      })
    );
  });

  it("reports raw validator mismatch while candidate shape validates independently", () => {
    const fixture = loadFixture();
    const report = buildHrcRawAdapterReport(fixture);

    expect(report.rawValidator.valid).toBe(false);
    expect(report.rawValidator.issueMessages).toEqual(
      expect.arrayContaining([expect.stringContaining("record is not a multi-action v2 import record")])
    );
    expect(report.candidateValidator.valid).toBe(true);
    expect(report.candidateValidator.issueMessages).toHaveLength(0);
    expect(report.unknownActionTypes).toHaveLength(0);
    expect(report.handsWithLengthMismatch).toHaveLength(0);
    expect(report.handsWithMissingEvs).toHaveLength(0);
    expect(report.handsWithMissingPlayed).toHaveLength(0);
    expect(report.actionsWithMissingAmount).toHaveLength(0);
    expect(report.privacySafe).toBe(true);
    expect(report.amountSemantics.amountUnit).toBe("UNKNOWN");
    expect(report.sourceMetadataCandidate.sourceShape).toBe("HRC_RAW_NODE");
    expect(report.spotCandidate.warning).toContain("not connected to canonical key/import logic");
  });

  it("keeps adapter output clearly separate from product import routing", () => {
    const fixture = loadFixture();
    const result = convertHrcRawNodeToMultiActionStrategy(fixture);

    expect(result.candidateRecord.schemaVersion).toBe("multi-action-v2");
    expect(result.candidateRecord.sourceMetadata).toEqual(
      expect.objectContaining({
        sourceShape: "HRC_RAW_NODE",
        targetShape: "APP_V2_MULTI_ACTION_CANDIDATE",
        sampleKind: "REAL_HRC_RAW_EXPORT_SAMPLE",
        sanitized: true,
        originalTool: "HRC",
        rawZipCommitted: false,
        amountUnit: "UNKNOWN",
        amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
        productImportRouteConnected: false
      })
    );
  });

  it("reports amount semantics without bb or chip conversion", () => {
    const fixture = loadFixture();
    const report = buildHrcRawAmountSemanticsReport(fixture);
    const result = convertHrcRawNodeToMultiActionStrategy(fixture);

    expect(report.rawActionAmounts).toEqual([0, 10000, 20000]);
    expect(report.uniqueRawActionAmounts).toEqual([0, 10000, 20000]);
    expect(report.actionsWithAmount).toEqual(["actions[0] F: 0", "actions[1] C: 10000", "actions[2] R: 20000"]);
    expect(report.actionsWithoutAmount).toHaveLength(0);
    expect(report.amountUnit).toBe("UNKNOWN");
    expect(report.amountInterpretation).toBe("RAW_HRC_AMOUNT_UNINTERPRETED");
    expect(report.sizeLabelPolicy).toBe("PRESERVE_AS_RAW_SIZE_LABEL");
    expect(report.bbConversionApplied).toBe(false);
    expect(report.chipConversionApplied).toBe(false);
    expect(report.warning).toBe("HRC amount unit is not inferred in v2.4");
    expect(result.strategy["22"]?.actions[1]?.size).toEqual({ rawSizeLabel: "HRC amount 10000" });
    expect(result.strategy["22"]?.actions[2]?.size).toEqual({ rawSizeLabel: "HRC amount 20000" });
  });

  it("builds source metadata candidate with raw HRC provenance and amount policy", () => {
    const fixture = loadFixture();
    const metadata = buildHrcRawSourceMetadataCandidate(fixture);

    expect(metadata).toEqual(
      expect.objectContaining({
        source: "HRC_PRECOMPUTED_DB",
        sourceShape: "HRC_RAW_NODE",
        targetShape: "APP_V2_MULTI_ACTION_CANDIDATE",
        originalTool: "HRC",
        sampleKind: "REAL_HRC_RAW_EXPORT_SAMPLE",
        sanitized: true,
        rawZipCommitted: false,
        streetScope: "PREFLOP",
        actionCount: 3,
        handCount: 169,
        sequenceLength: 6,
        amountUnit: "UNKNOWN",
        amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
        productImportRouteConnected: false
      })
    );
    expect(metadata.rawNodeKeys).toEqual(expect.arrayContaining(["actions", "hands", "sequence"]));
    expect(metadata.settingsKeys).toEqual(expect.arrayContaining(["handdata", "eqmodel", "treeconfig", "engine"]));
    expect(metadata.rawActionTypes).toEqual(["F", "C", "R"]);
    expect(metadata.rawActionAmounts).toEqual([0, 10000, 20000]);
    expect(metadata.conversionWarnings).toEqual(
      expect.arrayContaining(["HRC amount unit is not inferred in v2.4", "No bb or chip conversion is applied"])
    );
  });

  it("builds spot candidate from raw node sequence without canonical/import connection", () => {
    const fixture = loadFixture();
    const spot = buildHrcRawSpotCandidate(fixture);

    expect(spot.sourceShape).toBe("HRC_RAW_NODE");
    expect(spot.street).toBe(0);
    expect(spot.player).toBe(6);
    expect(spot.playerFromNode).toBe(6);
    expect(spot.sequence).toHaveLength(6);
    expect(spot.sequenceActionTypes).toEqual(["F", "F", "F", "F", "F", "F"]);
    expect(spot.sequenceAmounts).toEqual([0, 0, 0, 0, 0, 0]);
    expect(spot.actionPathCandidate).toEqual(["F:0", "F:0", "F:0", "F:0", "F:0", "F:0"]);
    expect(spot.decisionNodeCandidate).toBe("player:6 street:0");
    expect(spot.tableSizeCandidate).toBeNull();
    expect(spot.playerCountCandidate).toBeNull();
    expect(spot.unknownFields).toEqual(["tableSizeCandidate", "playerCountCandidate"]);
    expect(spot.warning).toBe("spot candidate is read-only metadata and is not connected to canonical key/import logic");
  });

  it("warns for unknown action types and played/evs length mismatches without guessing meaning", () => {
    const fixture = cloneFixture(loadFixture());
    fixture.node.actions = [
      { type: "F", amount: 0 },
      { type: "X", amount: null },
      { type: "R", amount: 20000 }
    ];
    fixture.node.hands["22"] = {
      weight: 1,
      played: [1],
      evs: [0]
    };

    const result = convertHrcRawNodeToMultiActionStrategy(fixture);

    expect(result.strategy["22"]?.actions[1]?.action).toBe("UNKNOWN");
    expect(result.strategy["22"]?.actions[1]?.warnings).toEqual(
      expect.arrayContaining(["raw HRC action type 'X' mapped to UNKNOWN", "raw HRC played[1] is missing or not numeric"])
    );
    expect(result.report.unknownActionTypes).toContain("X");
    expect(result.report.handsWithLengthMismatch).toContain("22");
    expect(result.report.handsWithMissingPlayed).toContain("22");
    expect(result.report.handsWithMissingEvs).toContain("22");
  });
});

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

function cloneFixture(input: Record<string, unknown>): {
  node: {
    actions: unknown[];
    hands: Record<string, unknown>;
  };
} {
  return JSON.parse(JSON.stringify(input)) as {
    node: {
      actions: unknown[];
      hands: Record<string, unknown>;
    };
  };
}

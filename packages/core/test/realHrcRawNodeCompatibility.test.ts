import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRealHrcRawNodeCompatibilityReport } from "./helpers/realHrcRawNodeCompatibility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  "fixtures",
  "real-hrc-raw-samples",
  "real-hrc-raw-sample-btn-vs-co-open-25bb.json"
);

describe("real HRC raw node compatibility report", () => {
  it("detects the sanitized raw HRC fixture without committing the raw zip", () => {
    const report = buildRealHrcRawNodeCompatibilityReport(fixturePath);

    expect(report.status).toBe("detected");
    expect(report.fileDetected).toBe(true);
    expect(report.fileName).toBe("real-hrc-raw-sample-btn-vs-co-open-25bb.json");
    expect(report.metadata.sampleKind).toBe("REAL_HRC_RAW_EXPORT_SAMPLE");
    expect(report.metadata.sanitized).toBe(true);
    expect(report.metadata.originalTool).toBe("HRC");
    expect(report.metadata.rawZipCommitted).toBe(false);
    expect(report.metadata.source).toBe("HRC_PRECOMPUTED_DB");
    expect(report.metadata.streetScope).toBe("PREFLOP");
    expect(report.metadata.note).toContain("not a product import payload");
  });

  it("keeps the fixture free of raw paths and sensitive identity patterns", () => {
    const report = buildRealHrcRawNodeCompatibilityReport(fixturePath);

    expect(report.privacyScan.safe).toBe(true);
    expect(report.privacyScan.matchedPatterns).toHaveLength(0);
  });

  it("recognizes the raw HRC node-level actions shape", () => {
    const report = buildRealHrcRawNodeCompatibilityReport(fixturePath);

    expect(report.settings.keys).toEqual(expect.arrayContaining(["handdata", "eqmodel", "treeconfig", "engine"]));
    expect(report.settings.hasExpectedRawSettingsKeys).toBe(true);
    expect(report.node.keys).toEqual(expect.arrayContaining(["actions", "children", "hands", "player", "sequence", "street"]));
    expect(report.node.hasActionsArray).toBe(true);
    expect(report.node.hasHandsObject).toBe(true);
    expect(report.node.actionsCount).toBe(3);
    expect(report.node.handCount).toBe(169);
    expect(report.node.hasSequence).toBe(true);
    expect(report.node.sequenceCount).toBe(6);
    expect(report.node.actionsHaveTypeAmount).toBe(true);
    expect(report.node.rawNodeShapeRecognized).toBe(true);
  });

  it("documents hand played[] and evs[] arrays indexed by node actions[]", () => {
    const report = buildRealHrcRawNodeCompatibilityReport(fixturePath);

    expect(report.node.sampledHands.length).toBeGreaterThan(0);
    expect(report.node.allSampledHandsHaveWeightPlayedEvs).toBe(true);
    expect(report.node.allSampledPlayedLengthsMatchActions).toBe(true);
    expect(report.node.allSampledEvsLengthsMatchActions).toBe(true);
    expect(report.node.sampledHands[0]).toEqual(
      expect.objectContaining({
        hasWeight: true,
        hasPlayedArray: true,
        hasEvsArray: true,
        playedLength: 3,
        evsLength: 3
      })
    );
  });

  it("records the current app v2 schema mismatch instead of changing product import logic", () => {
    const report = buildRealHrcRawNodeCompatibilityReport(fixturePath);

    expect(report.mismatch.rawShape).toContain("node-level actions[]");
    expect(report.mismatch.appV2Shape).toContain("hand -> actions[]");
    expect(report.mismatch.isDirectProductImportPayload).toBe(false);
    expect(report.mismatch.expectedValidatorCompatibility).toBe("expected_mismatch_not_product_import_payload");
    expect(report.mismatch.expectedMismatch).toBe(true);
    expect(report.mismatch.validator.attempted).toBe(true);
    expect(report.mismatch.validator.isV2Record).toBe(false);
    expect(report.mismatch.validator.valid).toBe(false);
    expect(report.mismatch.validator.issueMessages).toEqual(
      expect.arrayContaining([expect.stringContaining("record is not a multi-action v2 import record")])
    );
    expect(report.mismatch.reasons).toEqual(
      expect.arrayContaining([
        "raw HRC stores action definitions once at node.actions[]",
        "app v2 validator expects each hand to contain its own actions[] entries",
        "raw fixture intentionally has no product strategy hand map"
      ])
    );
  });
});

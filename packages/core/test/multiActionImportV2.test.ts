import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isMultiActionImportV2Record,
  normalizeMultiActionImportV2Record,
  summarizeMultiActionImportV2Record,
  validateMultiActionHandActions,
  validateMultiActionImportV2Record
} from "../src/index.js";
import {
  actionTreeSampleImportV2Records,
  findActionTreeSampleImportV2Record
} from "./fixtures/action-tree-sample-v2-fixtures.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "multi-action-import-v2.sample.json");

function sampleRecord(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

function cloneRecord(record: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
}

describe("multi-action import v2 validator", () => {
  it("accepts a valid v2 sample", () => {
    const result = validateMultiActionImportV2Record(sampleRecord());

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.normalizedRecord?.schemaVersion).toBe("multi-action-v2");
    expect(result.summary).toEqual(
      expect.objectContaining({
        handCount: 2,
        actionCount: 3,
        multiActionHandCount: 1,
        missingEvCount: 1
      })
    );
  });

  it("keeps hand -> actions[] multi-action rows stable", () => {
    const result = normalizeMultiActionImportV2Record(sampleRecord());
    const aks = result.normalizedRecord?.strategy.AKs;

    expect(aks?.actions).toHaveLength(2);
    expect(aks?.actions.map((action) => action.action)).toEqual(["RAISE", "ALL_IN"]);
    expect(aks?.actions[0]?.size).toEqual({ sizeBb: 2.2, rawSizeLabel: "2.2bb" });
    expect(aks?.actions[1]?.size).toEqual({ isAllIn: true });
  });

  it("allows ALL_IN without explicit size", () => {
    const result = validateMultiActionHandActions("AA", [{ action: "ALL_IN", frequency: 1, ev: 0.1 }]);

    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.hand?.actions[0]?.size).toEqual({ isAllIn: true });
  });

  it("warns when frequency total exceeds 1", () => {
    const result = validateMultiActionHandActions("KQs", [
      { action: "RAISE", sizeBb: 2.2, frequency: 0.7 },
      { action: "CALL", rawSizeLabel: "call", frequency: 0.4 }
    ]);

    expect(result.issues).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.message)).toContain("frequency total exceeds 1");
  });

  it("rejects negative frequency", () => {
    const result = validateMultiActionHandActions("AKo", [{ action: "RAISE", sizeBb: 2.2, frequency: -0.1 }]);

    expect(result.issues.map((issue) => issue.message)).toContain("frequency must be between 0 and 1");
    expect(result.hand).toBeNull();
  });

  it("warns for UNKNOWN action", () => {
    const result = validateMultiActionHandActions("QJs", [{ action: "hover", frequency: 1, ev: null }]);

    expect(result.issues).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.message)).toContain("UNKNOWN action should be reviewed");
    expect(result.hand?.actions[0]?.action).toBe("UNKNOWN");
  });

  it("tracks missing EV without inventing values", () => {
    const result = validateMultiActionHandActions("99", [{ action: "FOLD", frequency: 1 }]);

    expect(result.missingEvCount).toBe(1);
    expect(result.hand?.actions[0]?.ev).toBeNull();
  });

  it("rejects empty actions[]", () => {
    const result = validateMultiActionHandActions("AKs", []);

    expect(result.issues.map((issue) => issue.message)).toContain("actions[] must be a non-empty array");
    expect(result.hand).toBeNull();
  });

  it("does not classify legacy v1 records as v2", () => {
    const legacy = {
      spot: {},
      strategy: {
        AA: { action: "SHOVE", frequency: 1 }
      }
    };

    expect(isMultiActionImportV2Record(legacy)).toBe(false);
    const result = validateMultiActionImportV2Record(legacy);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toContain("record is not a multi-action v2 import record");
  });

  it("returns a stable normalized output", () => {
    const result = normalizeMultiActionImportV2Record(sampleRecord());
    const summary = summarizeMultiActionImportV2Record(sampleRecord());

    expect(result.normalizedRecord).toEqual(
      expect.objectContaining({
        schemaVersion: "multi-action-v2",
        strategy: expect.objectContaining({
          AKs: expect.objectContaining({
            hand: "AKs",
            actions: expect.any(Array)
          })
        })
      })
    );
    expect(summary.actionCount).toBe(3);
  });

  it("adds size warnings for RAISE BET and CALL when size is missing", () => {
    const result = validateMultiActionHandActions("AJo", [
      { action: "RAISE", frequency: 0.3, ev: 0.01 },
      { action: "BET", frequency: 0.2, ev: 0.01 },
      { action: "CALL", frequency: 0.5, ev: 0 }
    ]);

    expect(result.warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining(["RAISE size is not provided", "BET size is not provided", "CALL size is not provided"])
    );
  });

  it("accepts TEST_ONLY action tree v2 sample payloads", () => {
    for (const record of actionTreeSampleImportV2Records) {
      const result = validateMultiActionImportV2Record(cloneRecord(record));

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.normalizedRecord?.schemaVersion).toBe("multi-action-v2");
      expect(result.summary.handCount).toBeGreaterThan(0);
      expect(result.summary.actionCount).toBeGreaterThan(0);
    }
  });

  it("preserves SAMPLE and TEST_ONLY metadata for action tree samples", () => {
    for (const record of actionTreeSampleImportV2Records) {
      const result = normalizeMultiActionImportV2Record(cloneRecord(record));
      const sourceMetadata = result.normalizedRecord?.sourceMetadata;

      expect(sourceMetadata).toEqual(
        expect.objectContaining({
          isSample: true,
          testOnly: true,
          calculationModel: "TEST_ONLY_SAMPLE",
          streetScope: "PREFLOP",
          exportShape: "MULTI_ACTION_V2_SAMPLE",
          spotFamily: record.sourceMetadata.spotFamily
        })
      );
      expect(String(sourceMetadata?.sourceLabel)).toContain("SAMPLE_TEST_ONLY");
      expect(sourceMetadata?.actionTags).toEqual(expect.arrayContaining(["SAMPLE", "TEST_ONLY"]));
    }
  });

  it("keeps limp sample import schema-compatible without adding LIMP action kind", () => {
    const record = findActionTreeSampleImportV2Record("LIMP");
    const result = normalizeMultiActionImportV2Record(cloneRecord(record));
    const actions = result.normalizedRecord?.strategy.A5s?.actions ?? [];

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.normalizedRecord?.sourceMetadata?.spotFamily).toBe("LIMP");
    expect(actions.map((action) => action.action)).toContain("CALL");
    expect(actions.some((action) => action.sourceActionLabel?.includes("LIMP") || action.sourceActionLabel?.includes("Limp"))).toBe(true);
  });
});

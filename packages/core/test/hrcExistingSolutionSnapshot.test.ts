import { describe, expect, it } from "vitest";
import {
  buildHrcImportPreviewRow,
  type HrcImportPreviewRow
} from "../src/hrcImportPreviewContract.js";
import {
  summarizeHrcImportPreviewValidation,
  validateHrcImportPreviewRows
} from "../src/hrcImportPreviewValidator.js";
import {
  buildHrcExistingSolutionCanonicalKeySnapshot,
  getHrcExistingCanonicalKeys,
  summarizeHrcExistingSolutionCanonicalKeys,
  type HrcExistingSolutionSnapshotInputRow
} from "../src/hrcExistingSolutionSnapshot.js";

describe("HRC existing solution canonical key snapshot", () => {
  it("extracts unique canonical keys in first-seen order", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot(fixtureRows());

    expect(snapshot.canonicalKeys).toEqual([
      "hrc:test:existing-key-1",
      "hrc:test:existing-key-2",
      "hrc:test:existing-key-3"
    ]);
    expect(snapshot.uniqueCanonicalKeyCount).toBe(3);
    expect(getHrcExistingCanonicalKeys(snapshot)).toEqual(snapshot.canonicalKeys);
  });

  it("trims canonical keys without changing their case", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot([
      { id: "row-1", canonicalKey: "  HRC:Mixed:Key  ", source: "HRC_PRECOMPUTED_DB" }
    ]);

    expect(snapshot.canonicalKeys).toEqual(["HRC:Mixed:Key"]);
    expect(snapshot.entries[0]?.normalizedCanonicalKey).toBe("HRC:Mixed:Key");
  });

  it("counts null, undefined, and empty canonical keys as missing", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot([
      { id: "null-row", canonicalKey: null },
      { id: "undefined-row" },
      { id: "empty-row", canonicalKey: "   " }
    ]);

    expect(snapshot.missingCanonicalKeyCount).toBe(3);
    expect(snapshot.canonicalKeys).toEqual([]);
    expect(snapshot.entries.every((entry) => entry.normalizedCanonicalKey === null)).toBe(true);
  });

  it("detects duplicate existing canonical keys without throwing", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot(fixtureRows());
    const duplicateEntry = snapshot.entries.find((entry) => entry.rowId === "3");

    expect(snapshot.duplicateCanonicalKeyCount).toBe(1);
    expect(duplicateEntry?.isDuplicate).toBe(true);
    expect(duplicateEntry?.warnings).toContain("duplicate canonical key");
  });

  it("dedupes canonicalKeys even when duplicate entries are present", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot(fixtureRows());

    expect(snapshot.totalRows).toBe(5);
    expect(snapshot.canonicalKeys).toHaveLength(3);
    expect(new Set(snapshot.canonicalKeys).size).toBe(3);
  });

  it("builds sourceBreakdown from sanitized source values", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot(fixtureRows());

    expect(snapshot.sourceBreakdown).toEqual({
      HRC_PRECOMPUTED_DB: 2,
      CSV_IMPORT: 2,
      UNKNOWN: 1
    });
  });

  it("summarizes the fixture counts", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot(fixtureRows());
    const summary = summarizeHrcExistingSolutionCanonicalKeys(snapshot);

    expect(summary.totalRows).toBe(5);
    expect(summary.uniqueCanonicalKeyCount).toBe(3);
    expect(summary.duplicateCanonicalKeyCount).toBe(1);
    expect(summary.missingCanonicalKeyCount).toBe(1);
    expect(summary.warningCount).toBe(2);
  });

  it("feeds snapshot canonicalKeys into the Step 3 validator", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot([
      {
        id: "existing-1",
        canonicalKey: "hrc:test:existing-key-1",
        source: "HRC_PRECOMPUTED_DB"
      }
    ]);
    const validatedRows = validateHrcImportPreviewRows({
      rows: [previewRow("candidate-1", "hrc:test:existing-key-1")],
      existingCanonicalKeys: snapshot.canonicalKeys
    });
    const summary = summarizeHrcImportPreviewValidation(validatedRows);

    expect(validatedRows[0]?.validationStatus).toBe("DUPLICATE_EXISTING_DB");
    expect(summary.duplicateExistingDbCount).toBe(1);
    expect(summary.importPreviewAllowedCount).toBe(0);
    expect(summary.dbWriteAllowedTrueCount).toBe(0);
  });

  it("uses plain in-memory rows without filesystem, DB, API, or raw path requirements", () => {
    const snapshot = buildHrcExistingSolutionCanonicalKeySnapshot([
      {
        id: "private-path-row",
        canonicalKey: "hrc:test:path-safe-key",
        source: "<sample-user-home>\\private-source",
        sourceFile: "<sample-user-home>\\sample-external-hrc-folder\\sample-external-hrc-folder data\\raw-file.json"
      }
    ]);
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
    expect(serialized).not.toContain("sample-external-hrc-folder");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("poker-tournament-lab.db");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
    expect(snapshot.entries[0]?.source).toBe("<redacted-source>");
    expect(snapshot.entries[0]?.sourceFile).toBe("raw-file.json");
  });
});

function fixtureRows(): HrcExistingSolutionSnapshotInputRow[] {
  return [
    {
      id: 1,
      canonicalKey: "  hrc:test:existing-key-1  ",
      source: "HRC_PRECOMPUTED_DB",
      sourceFile: "existing-1.json"
    },
    {
      id: 2,
      canonicalKey: "hrc:test:existing-key-2",
      source: "HRC_PRECOMPUTED_DB",
      sourceFile: "existing-2.json"
    },
    {
      id: 3,
      canonicalKey: "hrc:test:existing-key-1",
      source: "CSV_IMPORT",
      sourceFile: "duplicate.json"
    },
    {
      id: 4,
      canonicalKey: null,
      source: "CSV_IMPORT",
      sourceFile: "missing.json"
    },
    {
      id: 5,
      canonicalKey: "hrc:test:existing-key-3",
      source: null,
      sourceFile: null
    }
  ];
}

function previewRow(id: string, canonicalKeyPreview: string): HrcImportPreviewRow {
  return buildHrcImportPreviewRow({
    id,
    zipFileNameSanitized: `${id}.json`,
    canonicalKeyPreview,
    classification: "IMPORT_CANDIDATE",
    dryRunSucceeded: true,
    privacyPassed: true,
    dashboardReviewed: true,
    artifactReportAvailable: true,
    sourceKind: "V2_9_CLASSIFICATION_REPORT",
    sourceVersion: "v2.9"
  });
}

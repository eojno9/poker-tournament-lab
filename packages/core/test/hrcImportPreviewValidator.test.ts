import { describe, expect, it } from "vitest";
import {
  buildHrcImportPreviewRow,
  type HrcImportCandidateClassification,
  type HrcImportPreviewRow
} from "../src/hrcImportPreviewContract.js";
import {
  assertNoHrcImportDbWriteAllowed,
  summarizeHrcImportPreviewValidation,
  validateHrcImportPreviewRows
} from "../src/hrcImportPreviewValidator.js";

describe("HRC import preview validator", () => {
  it("marks unique IMPORT_CANDIDATE rows as ready for import preview", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [
        previewRow({
          id: "candidate-001",
          canonicalKeyPreview: "BTN|CO|25BB|A5S"
        })
      ],
      existingCanonicalKeys: []
    });

    expect(validated?.validationStatus).toBe("READY_FOR_IMPORT_PREVIEW");
    expect(validated?.canonicalKey).toBe("btn|co|25bb|a5s");
    expect(validated?.importPreviewAllowed).toBe(true);
    expect(validated?.dbWriteAllowed).toBe(false);
  });

  it("blocks ready rows without canonicalKeyPreview", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [previewRow({ canonicalKeyPreview: null })],
      existingCanonicalKeys: []
    });

    expect(validated?.validationStatus).toBe("MISSING_CANONICAL_KEY");
    expect(validated?.importPreviewAllowed).toBe(false);
    expect(validated?.dbWriteAllowed).toBe(false);
  });

  it("blocks duplicate canonical keys within the batch", () => {
    const validatedRows = validateHrcImportPreviewRows({
      rows: [
        previewRow({ id: "candidate-001", canonicalKeyPreview: "spot-key-001" }),
        previewRow({ id: "candidate-002", canonicalKeyPreview: "SPOT-KEY-001" })
      ],
      existingCanonicalKeys: []
    });

    expect(validatedRows.map((row) => row.validationStatus)).toEqual([
      "DUPLICATE_IN_BATCH",
      "DUPLICATE_IN_BATCH"
    ]);
    expect(summarizeHrcImportPreviewValidation(validatedRows).duplicateInBatchCount).toBe(2);
  });

  it("blocks canonical keys that already exist in the supplied DB snapshot", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [previewRow({ canonicalKeyPreview: "existing-spot-key" })],
      existingCanonicalKeys: ["EXISTING-SPOT-KEY"]
    });

    expect(validated?.validationStatus).toBe("DUPLICATE_EXISTING_DB");
    expect(validated?.importPreviewAllowed).toBe(false);
    expect(validated?.dbWriteAllowed).toBe(false);
  });

  it("keeps NEEDS_MANUAL_REVIEW rows blocked by preview decision", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [
        previewRow({
          classification: "NEEDS_MANUAL_REVIEW",
          canonicalKeyPreview: "manual-review-key"
        })
      ],
      existingCanonicalKeys: []
    });

    expect(validated?.validationStatus).toBe("BLOCKED_BY_PREVIEW_DECISION");
    expect(validated?.importPreviewAllowed).toBe(false);
  });

  it("keeps HOLD rows blocked by preview decision", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [
        previewRow({
          classification: "HOLD",
          canonicalKeyPreview: "hold-key"
        })
      ],
      existingCanonicalKeys: []
    });

    expect(validated?.validationStatus).toBe("BLOCKED_BY_PREVIEW_DECISION");
    expect(validated?.importPreviewAllowed).toBe(false);
  });

  it("keeps EXCLUDE rows excluded", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [
        previewRow({
          classification: "EXCLUDE",
          dryRunSucceeded: false,
          canonicalKeyPreview: "excluded-key"
        })
      ],
      existingCanonicalKeys: []
    });

    expect(validated?.validationStatus).toBe("EXCLUDED");
    expect(validated?.importPreviewAllowed).toBe(false);
  });

  it("blocks privacy failures before canonical key checks", () => {
    const [validated] = validateHrcImportPreviewRows({
      rows: [
        previewRow({
          canonicalKeyPreview: "privacy-key",
          privacyPassed: false
        })
      ],
      existingCanonicalKeys: ["privacy-key"]
    });

    expect(validated?.validationStatus).toBe("PRIVACY_BLOCKED");
    expect(validated?.importPreviewAllowed).toBe(false);
    expect(validated?.dbWriteAllowed).toBe(false);
  });

  it("never returns dbWriteAllowed true for validated rows", () => {
    const validatedRows = validateHrcImportPreviewRows({
      rows: buildV29PreviewRows(),
      existingCanonicalKeys: []
    });

    expect(validatedRows.every((row) => row.dbWriteAllowed === false)).toBe(true);
    expect(summarizeHrcImportPreviewValidation(validatedRows).dbWriteAllowedTrueCount).toBe(0);
  });

  it("detects unexpected source rows that try to allow DB writes", () => {
    const unsafeRow = {
      ...previewRow({ id: "unsafe-row", canonicalKeyPreview: "unsafe-key" }),
      dbWriteAllowed: true
    } as unknown as HrcImportPreviewRow;
    const validatedRows = validateHrcImportPreviewRows({
      rows: [unsafeRow],
      existingCanonicalKeys: []
    });

    expect(validatedRows[0]?.validationStatus).toBe("DB_WRITE_NOT_ALLOWED");
    expect(validatedRows[0]?.dbWriteAllowed).toBe(false);
    expect(assertNoHrcImportDbWriteAllowed(validatedRows)).toEqual({
      pass: false,
      dbWriteAllowedTrueCount: 1,
      offendingRowIds: ["unsafe-row"]
    });
  });

  it("summarizes the v2.9 fixture validation counts", () => {
    const validatedRows = validateHrcImportPreviewRows({
      rows: buildV29PreviewRows(),
      existingCanonicalKeys: []
    });
    const summary = summarizeHrcImportPreviewValidation(validatedRows);

    expect(summary.total).toBe(28);
    expect(summary.readyForImportPreviewCount).toBe(19);
    expect(summary.blockedByDecisionCount).toBe(8);
    expect(summary.missingCanonicalKeyCount).toBe(0);
    expect(summary.duplicateInBatchCount).toBe(0);
    expect(summary.duplicateExistingDbCount).toBe(0);
    expect(summary.privacyBlockedCount).toBe(0);
    expect(summary.excludedCount).toBe(1);
    expect(summary.importPreviewAllowedCount).toBe(19);
    expect(summary.dbWriteAllowedTrueCount).toBe(0);
  });

  it("shows one existing DB duplicate in the v2.9 fixture when a key is supplied externally", () => {
    const validatedRows = validateHrcImportPreviewRows({
      rows: buildV29PreviewRows(),
      existingCanonicalKeys: ["candidate-key-007"]
    });
    const duplicate = validatedRows.find((row) => row.validationStatus === "DUPLICATE_EXISTING_DB");

    expect(summarizeHrcImportPreviewValidation(validatedRows).duplicateExistingDbCount).toBe(1);
    expect(duplicate?.row.id).toBe("import-candidate-007");
    expect(duplicate?.importPreviewAllowed).toBe(false);
    expect(duplicate?.dbWriteAllowed).toBe(false);
  });

  it("uses plain in-memory inputs without filesystem, DB, API, or raw path requirements", () => {
    const validatedRows = validateHrcImportPreviewRows({
      rows: [previewRow({ zipFileNameSanitized: "sample-candidate.json", canonicalKeyPreview: "sample-key" })],
      existingCanonicalKeys: []
    });
    const guard = assertNoHrcImportDbWriteAllowed(validatedRows);
    const serialized = JSON.stringify({ validatedRows, guard });

    expect(guard.pass).toBe(true);
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-external-hrc-folder");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
    expect(serialized).not.toContain("poker-tournament-lab.db");
  });
});

function previewRow(overrides: Partial<Parameters<typeof buildHrcImportPreviewRow>[0]> = {}): HrcImportPreviewRow {
  return buildHrcImportPreviewRow({
    id: "candidate-001",
    zipFileNameSanitized: "candidate-001.json",
    canonicalKeyPreview: "candidate-key-001",
    classification: "IMPORT_CANDIDATE" as HrcImportCandidateClassification,
    dryRunSucceeded: true,
    privacyPassed: true,
    dashboardReviewed: true,
    artifactReportAvailable: true,
    sourceKind: "V2_9_CLASSIFICATION_REPORT",
    sourceVersion: "v2.9",
    ...overrides
  });
}

function buildV29PreviewRows(): HrcImportPreviewRow[] {
  const rows: HrcImportPreviewRow[] = [];

  for (let index = 1; index <= 19; index += 1) {
    rows.push(
      previewRow({
        id: `import-candidate-${String(index).padStart(3, "0")}`,
        zipFileNameSanitized: `import-candidate-${String(index).padStart(3, "0")}.json`,
        canonicalKeyPreview: `candidate-key-${String(index).padStart(3, "0")}`,
        classification: "IMPORT_CANDIDATE"
      })
    );
  }

  for (let index = 1; index <= 8; index += 1) {
    rows.push(
      previewRow({
        id: `manual-review-${String(index).padStart(3, "0")}`,
        zipFileNameSanitized: `manual-review-${String(index).padStart(3, "0")}.json`,
        canonicalKeyPreview: `manual-review-key-${String(index).padStart(3, "0")}`,
        classification: "NEEDS_MANUAL_REVIEW"
      })
    );
  }

  rows.push(
    previewRow({
      id: "excluded-001",
      zipFileNameSanitized: "excluded-001.json",
      canonicalKeyPreview: "excluded-key-001",
      classification: "EXCLUDE",
      dryRunSucceeded: false,
      artifactReportAvailable: false
    })
  );

  return rows;
}

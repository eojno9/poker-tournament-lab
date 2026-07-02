import { describe, expect, it } from "vitest";
import {
  buildHrcImportPreviewRow,
  classifyHrcImportPreviewDecision,
  summarizeHrcImportPreviewRows,
  type HrcImportCandidateClassification,
  type HrcImportPreviewRow
} from "../src/hrcImportPreviewContract.js";

describe("HRC import preview contract", () => {
  it("marks successful IMPORT_CANDIDATE rows as ready for import preview", () => {
    const row = buildHrcImportPreviewRow(baseInput({ classification: "IMPORT_CANDIDATE" }));

    expect(row.decision).toBe("READY_FOR_IMPORT_PREVIEW");
    expect(row.riskLevel).toBe("LOW");
    expect(row.importAllowed).toBe(true);
    expect(row.dbWriteAllowed).toBe(false);
  });

  it("keeps NEEDS_MANUAL_REVIEW rows out of import preview readiness", () => {
    const row = buildHrcImportPreviewRow(baseInput({ classification: "NEEDS_MANUAL_REVIEW" }));

    expect(row.decision).toBe("MANUAL_REVIEW_REQUIRED");
    expect(row.riskLevel).toBe("MEDIUM");
    expect(row.importAllowed).toBe(false);
    expect(row.dbWriteAllowed).toBe(false);
  });

  it("keeps HOLD rows held with high risk", () => {
    const row = buildHrcImportPreviewRow(baseInput({ classification: "HOLD" }));

    expect(row.decision).toBe("HOLD");
    expect(row.riskLevel).toBe("HIGH");
    expect(row.importAllowed).toBe(false);
    expect(row.dbWriteAllowed).toBe(false);
  });

  it("keeps EXCLUDE rows blocked and excluded", () => {
    const row = buildHrcImportPreviewRow(baseInput({ classification: "EXCLUDE" }));

    expect(row.decision).toBe("EXCLUDED");
    expect(row.riskLevel).toBe("BLOCKED");
    expect(row.importAllowed).toBe(false);
    expect(row.dbWriteAllowed).toBe(false);
  });

  it("blocks rows when privacy did not pass", () => {
    const result = classifyHrcImportPreviewDecision({
      classification: "IMPORT_CANDIDATE",
      dryRunSucceeded: true,
      privacyPassed: false,
      dashboardReviewed: true
    });

    expect(result.decision).toBe("MANUAL_REVIEW_REQUIRED");
    expect(result.riskLevel).toBe("BLOCKED");
    expect(result.importAllowed).toBe(false);
    expect(result.dbWriteAllowed).toBe(false);
    expect(result.warnings).toContain("privacy scan did not pass");
  });

  it("requires dashboard review before import preview readiness", () => {
    const row = buildHrcImportPreviewRow(
      baseInput({
        classification: "IMPORT_CANDIDATE",
        dashboardReviewed: false
      })
    );

    expect(row.decision).toBe("MANUAL_REVIEW_REQUIRED");
    expect(row.riskLevel).toBe("MEDIUM");
    expect(row.importAllowed).toBe(false);
    expect(row.dbWriteAllowed).toBe(false);
    expect(row.warnings).toContain("dashboard review is incomplete");
  });

  it("keeps dry-run failures out of import preview readiness", () => {
    const row = buildHrcImportPreviewRow(
      baseInput({
        classification: "IMPORT_CANDIDATE",
        dryRunSucceeded: false
      })
    );

    expect(row.decision).toBe("MANUAL_REVIEW_REQUIRED");
    expect(row.importAllowed).toBe(false);
    expect(row.dbWriteAllowed).toBe(false);
    expect(row.warnings).toContain("dry-run did not succeed");
  });

  it("never enables DB write across all v2.9 preview rows", () => {
    const rows = buildV29PreviewRows();

    expect(rows.every((row) => row.dbWriteAllowed === false)).toBe(true);
    expect(summarizeHrcImportPreviewRows(rows).dbWriteAllowedTrueCount).toBe(0);
  });

  it("summarizes the v2.9 classification fixture counts", () => {
    const summary = summarizeHrcImportPreviewRows(buildV29PreviewRows());

    expect(summary.total).toBe(28);
    expect(summary.readyForImportPreviewCount).toBe(19);
    expect(summary.manualReviewRequiredCount).toBe(8);
    expect(summary.holdCount).toBe(0);
    expect(summary.excludedCount).toBe(1);
    expect(summary.lowRiskCount).toBe(19);
    expect(summary.mediumRiskCount).toBe(8);
    expect(summary.highRiskCount).toBe(0);
    expect(summary.blockedRiskCount).toBe(1);
    expect(summary.dbWriteAllowedTrueCount).toBe(0);
    expect(summary.importAllowedCount).toBe(19);
  });

  it("uses plain values without filesystem, DB, API, or raw path requirements", () => {
    const row = buildHrcImportPreviewRow(
      baseInput({
        classification: "IMPORT_CANDIDATE",
        zipFileNameSanitized: "sample-real-hrc-candidate.json",
        sourceKind: "V2_9_CLASSIFICATION_REPORT"
      })
    );
    const serialized = JSON.stringify(row);

    expect(row.sourceKind).toBe("V2_9_CLASSIFICATION_REPORT");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-external-hrc-folder");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
    expect(serialized).not.toContain("poker-tournament-lab.db");
  });
});

function baseInput(overrides: Partial<Parameters<typeof buildHrcImportPreviewRow>[0]> = {}) {
  return {
    id: "candidate-001",
    zipFileNameSanitized: "candidate-001.json",
    classification: "IMPORT_CANDIDATE" as HrcImportCandidateClassification,
    dryRunSucceeded: true,
    privacyPassed: true,
    dashboardReviewed: true,
    artifactReportAvailable: true,
    sourceKind: "V2_9_CLASSIFICATION_REPORT" as const,
    sourceVersion: "v2.9",
    ...overrides
  };
}

function buildV29PreviewRows(): HrcImportPreviewRow[] {
  const rows: HrcImportPreviewRow[] = [];

  for (let index = 1; index <= 19; index += 1) {
    rows.push(
      buildHrcImportPreviewRow(
        baseInput({
          id: `import-candidate-${index}`,
          zipFileNameSanitized: `import-candidate-${index}.json`,
          classification: "IMPORT_CANDIDATE"
        })
      )
    );
  }

  for (let index = 1; index <= 8; index += 1) {
    rows.push(
      buildHrcImportPreviewRow(
        baseInput({
          id: `manual-review-${index}`,
          zipFileNameSanitized: `manual-review-${index}.json`,
          classification: "NEEDS_MANUAL_REVIEW"
        })
      )
    );
  }

  rows.push(
    buildHrcImportPreviewRow(
      baseInput({
        id: "excluded-001",
        zipFileNameSanitized: "excluded-001.json",
        classification: "EXCLUDE",
        dryRunSucceeded: false,
        artifactReportAvailable: false
      })
    )
  );

  return rows;
}

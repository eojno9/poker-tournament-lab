import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHrcDryRunArtifactReport,
  type HrcDryRunArtifactReport,
} from "./helpers/hrcDryRunArtifactReport.js";
import {
  buildHrcDryRunArtifactComparisonRows,
  buildHrcDryRunArtifactIndex,
  buildHrcDryRunArtifactIndexFileName,
} from "./helpers/hrcDryRunArtifactIndex.js";
import type { HrcRawZipDryRunReport } from "./helpers/hrcRawZipDryRunReader.js";

function baseDryRunReport(
  overrides: Partial<HrcRawZipDryRunReport> = {},
): HrcRawZipDryRunReport {
  return {
    status: "OK",
    zipDetected: true,
    zipPathMasked: "<repo-external>/sample.zip",
    zipPathInsideRepo: false,
    entryCount: 2,
    hasSettingsJson: true,
    nodeEntryCount: 1,
    nodeEntriesSample: ["nodes/0.json"],
    selectedNodeEntry: "nodes/0.json",
    selectedNodeReason: "nodes/0.json is present and selected by policy",
    multipleNodeEntriesDetected: false,
    nodeSelectionPolicy: "PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST",
    multiNodeAggregationApplied: false,
    settingsTopLevelKeys: ["handdata", "eqmodel", "treeconfig", "engine"],
    nodeTopLevelKeys: ["player", "street", "sequence", "actions", "hands"],
    rawNodeRecognized: true,
    actionCount: 3,
    handCount: 169,
    sequenceLength: 6,
    privacySafe: true,
    privacyWarnings: [],
    privacyPatternMatches: [],
    rawZipCommitted: false,
    productImportConnected: false,
    amountUnit: "UNKNOWN",
    amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
    adapterCandidateBuilt: true,
    adapterValidatorPass: true,
    adapterReportSummary: {
      candidateBuilt: true,
      sourceShape: "HRC_RAW_NODE",
      targetShape: "APP_V2_MULTI_ACTION_CANDIDATE",
      handCount: 169,
      actionCount: 3,
      convertedHandCount: 169,
      convertedActionCount: 507,
      unknownActionCount: 0,
      missingPlayedCount: 0,
      missingEvsCount: 0,
      lengthMismatchCount: 0,
      rawValidatorPass: false,
      candidateValidatorPass: true,
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      productImportRouteConnected: false,
      warningCount: 0,
      warningsCount: 0,
    },
    validatorResult: {
      attempted: true,
      valid: true,
      pass: true,
      errorCount: 0,
      warningCount: 0,
      checkedHands: 169,
      expectedHands: 169,
      sourceLabel: "APP_V2_MULTI_ACTION_CANDIDATE",
      issueMessages: [],
      warningMessages: [],
    },
    mismatchSummary: {
      hasMismatch: false,
      mismatchCount: 0,
      categories: [],
      sample: [],
      fatal: false,
    },
    adapterReport: null,
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function artifact(
  zipFileName: string,
  generatedAt: string,
  overrides: Partial<HrcRawZipDryRunReport> = {},
): HrcDryRunArtifactReport {
  return buildHrcDryRunArtifactReport(baseDryRunReport(overrides), {
    generatedAt,
    zipFileName,
  });
}

function repoArtifactsDir(): string {
  return resolve(process.cwd(), "..", "..", "artifacts", "hrc-dry-run-reports");
}

describe("hrc dry-run artifact index helper", () => {
  it("builds a deterministic index from multiple OK artifact reports", () => {
    const reports = [
      artifact("bravo.zip", "2026-06-12T20:35:03.000Z"),
      artifact("alpha.zip", "2026-06-12T20:35:01.000Z"),
      artifact("charlie.zip", "2026-06-12T20:35:02.000Z"),
    ];
    const index = buildHrcDryRunArtifactIndex(reports, {
      generatedAt: "2026-06-12T20:36:00.000Z",
    });

    expect(index.schemaVersion).toBe("v2.6.0");
    expect(index.generatedAt).toBe("2026-06-12T20:36:00.000Z");
    expect(index.sourceKind).toBe("HRC_RAW_ZIP_DRY_RUN_INDEX");
    expect(index.reportCount).toBe(3);
    expect(index.statusCounts.OK).toBe(3);
    expect(index.validatorPassCount).toBe(3);
    expect(index.validatorFailCount).toBe(0);
    expect(index.privacySafeCount).toBe(3);
    expect(index.privacyWarningCount).toBe(0);
    expect(index.rawZipCommitted).toBe(false);
    expect(index.productImportConnected).toBe(false);
    expect(index.dbWriteApplied).toBe(false);
    expect(index.apiUsed).toBe(false);
    expect(index.uiUsed).toBe(false);
    expect(index.multiNodeAggregationApplied).toBe(false);
    expect(index.reports.map((report) => report.zipFileNameSanitized)).toEqual([
      "alpha.zip",
      "bravo.zip",
      "charlie.zip",
    ]);
  });

  it("aggregates mixed status reports and warning/error counts", () => {
    const validatorFailed = artifact(
      "validator-failed.zip",
      "2026-06-12T20:35:02.000Z",
      {
        status: "VALIDATOR_FAILED",
        validatorResult: {
          ...baseDryRunReport().validatorResult,
          valid: false,
          pass: false,
          errorCount: 1,
          issueMessages: ["candidate validator failed"],
        },
        errors: ["validator failed"],
      },
    );
    const index = buildHrcDryRunArtifactIndex([
      artifact("ok.zip", "2026-06-12T20:35:01.000Z"),
      artifact("privacy.zip", "2026-06-12T20:35:03.000Z", {
        status: "PRIVACY_WARNING",
        privacySafe: false,
        privacyWarnings: ["email found"],
        warnings: ["privacy warning"],
      }),
      validatorFailed,
      artifact("shape.zip", "2026-06-12T20:35:04.000Z", {
        status: "RAW_NODE_SHAPE_INVALID",
        rawNodeRecognized: false,
        errors: ["node.actions missing"],
      }),
    ]);

    expect(index.statusCounts.OK).toBe(1);
    expect(index.statusCounts.PRIVACY_WARNING).toBe(1);
    expect(index.statusCounts.VALIDATOR_FAILED).toBe(1);
    expect(index.statusCounts.RAW_NODE_SHAPE_INVALID).toBe(1);
    expect(index.validatorPassCount).toBe(3);
    expect(index.validatorFailCount).toBe(1);
    expect(index.privacySafeCount).toBe(3);
    expect(index.privacyWarningCount).toBe(1);
    expect(index.warningCountTotal).toBe(1);
    expect(index.errorCountTotal).toBe(2);
  });

  it("aggregates mismatch categories and total mismatch counts", () => {
    const index = buildHrcDryRunArtifactIndex([
      artifact("one.zip", "2026-06-12T20:35:01.000Z", {
        mismatchSummary: {
          hasMismatch: true,
          mismatchCount: 2,
          categories: ["length-mismatch", "missing-evs"],
          sample: ["AA", "AKs"],
          fatal: false,
        },
      }),
      artifact("two.zip", "2026-06-12T20:35:02.000Z", {
        mismatchSummary: {
          hasMismatch: true,
          mismatchCount: 1,
          categories: ["missing-evs"],
          sample: ["AQs"],
          fatal: false,
        },
      }),
      artifact("three.zip", "2026-06-12T20:35:03.000Z"),
    ]);

    expect(index.mismatchReportCount).toBe(2);
    expect(index.mismatchCountTotal).toBe(3);
    expect(index.mismatchCategories).toEqual([
      "length-mismatch",
      "missing-evs",
    ]);
  });

  it("sorts comparison rows deterministically regardless of input order", () => {
    const unsorted = [
      artifact("same.zip", "2026-06-12T20:35:03.000Z", {
        selectedNodeEntry: "nodes/2.json",
      }),
      artifact("alpha.zip", "2026-06-12T20:35:02.000Z"),
      artifact("same.zip", "2026-06-12T20:35:01.000Z", {
        selectedNodeEntry: "nodes/1.json",
      }),
    ];

    expect(buildHrcDryRunArtifactComparisonRows(unsorted)).toEqual(
      buildHrcDryRunArtifactComparisonRows([...unsorted].reverse()),
    );
    expect(
      buildHrcDryRunArtifactComparisonRows(unsorted).map(
        (report) =>
          `${report.zipFileNameSanitized}:${report.generatedAt}:${report.selectedNodeEntry}`,
      ),
    ).toEqual([
      "alpha.zip:2026-06-12T20:35:02.000Z:nodes/0.json",
      "same.zip:2026-06-12T20:35:01.000Z:nodes/1.json",
      "same.zip:2026-06-12T20:35:03.000Z:nodes/2.json",
    ]);
  });

  it("does not leak raw privacy or local path strings into index JSON", () => {
    const dangerousReport: HrcDryRunArtifactReport = {
      ...artifact("safe.zip", "2026-06-12T20:35:01.000Z"),
      zipFileNameSanitized: "C:\\Users\\sample-user\\hero@example.com.zip",
      selectedNodeEntry: "C:\\Users\\sample-user\\Documents\\nodes\\0.json",
      mismatchSummary: {
        hasMismatch: true,
        mismatchCount: 1,
        categories: ["email hero@example.com"],
        sample: [],
        fatal: false,
      },
      warnings: ["C:\\Users\\sample-user\\Desktop\\raw.zip"],
      errors: ["contact hero@example.com"],
    };
    const indexJson = JSON.stringify(
      buildHrcDryRunArtifactIndex([dangerousReport]),
    );

    expect(indexJson).not.toContain("C:\\Users");
    expect(indexJson).not.toContain("sample-user");
    expect(indexJson).not.toContain("hero@example.com");
    expect(indexJson).not.toContain("Documents");
  });

  it("summarizes amount unit counts without enabling bb or chip conversion", () => {
    const index = buildHrcDryRunArtifactIndex([
      artifact("one.zip", "2026-06-12T20:35:01.000Z"),
      artifact("two.zip", "2026-06-12T20:35:02.000Z"),
    ]);
    const indexJson = JSON.stringify(index);

    expect(index.amountUnitCounts.UNKNOWN).toBe(2);
    expect(index.reports.every((report) => report.amountUnit === "UNKNOWN"))
      .toBe(true);
    expect(indexJson).not.toContain('"bbConversionApplied":true');
    expect(indexJson).not.toContain('"chipConversionApplied":true');
  });

  it("builds safe index file names without writing repo artifacts", () => {
    const fileName = buildHrcDryRunArtifactIndexFileName({
      generatedAt: "2026-06-12T20:35:00.000Z",
      fileName: "..\\C:\\Users\\sample-user\\hero@example.com.json",
    });

    expect(fileName.endsWith(".json")).toBe(true);
    expect(fileName).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(fileName).not.toContain("\\");
    expect(fileName).not.toContain("/");
    expect(fileName).not.toContain("C:");
    expect(fileName).not.toContain("Users");
    expect(fileName).not.toContain("sample-user");
    expect(fileName).not.toContain("hero@example.com");
    expect(existsSync(repoArtifactsDir())).toBe(false);
  });
});

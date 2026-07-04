import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  buildHrcDryRunArtifactReport,
  buildHrcDryRunComparisonSummary,
  maskArtifactPath,
  sanitizeArtifactFileName,
} from "./helpers/hrcDryRunArtifactReport.js";
import type { HrcRawZipDryRunReport } from "./helpers/hrcRawZipDryRunReader.js";

const generatedAt = "2026-06-12T00:00:00.000Z";

function baseDryRunReport(
  overrides: Partial<HrcRawZipDryRunReport> = {},
): HrcRawZipDryRunReport {
  return {
    status: "OK",
    zipDetected: true,
    zipPathMasked: "<repo-external>/hrc-sample.zip",
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
    nodeTopLevelKeys: [
      "player",
      "street",
      "children",
      "sequence",
      "actions",
      "hands",
    ],
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

describe("hrc dry-run artifact report helper", () => {
  it("builds an artifact-safe report from a valid dry-run report", () => {
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
      verificationSummary: {
        exactLookup: { passed: 262, total: 262 },
        randomLookup: { passed: 20, total: 20 },
        duplicateCanonicalKey: 0,
        nearMatchHrcFalsePositive: 0,
      },
    });

    expect(artifact.schemaVersion).toBe("v2.6.0");
    expect(artifact.generatedAt).toBe(generatedAt);
    expect(artifact.sourceKind).toBe("HRC_RAW_ZIP_DRY_RUN");
    expect(artifact.rawZipCommitted).toBe(false);
    expect(artifact.productImportConnected).toBe(false);
    expect(artifact.dbWriteApplied).toBe(false);
    expect(artifact.apiUsed).toBe(false);
    expect(artifact.uiUsed).toBe(false);
    expect(artifact.isProductImportCandidate).toBe(false);
    expect(artifact.multiNodeAggregationApplied).toBe(false);
    expect(artifact.amountSemantics).toEqual({
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      bbConversionApplied: false,
      chipConversionApplied: false,
    });
    expect(artifact.verificationSummary.exactLookup).toEqual({
      passed: 262,
      total: 262,
    });
  });

  it("masks raw local paths before they reach artifact JSON", () => {
    const artifact = buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
      zipPath:
        "C:\\Users\\sample-user\\Documents\\GTO 자료\\mtt raw sample.zip",
    });
    const serialized = JSON.stringify(artifact);

    expect(artifact.zipPathMasked).toBe("<repo-external>/mtt-raw-sample.zip");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
    expect(serialized).not.toContain("Documents");
  });

  it("sanitizes file names with spaces, Korean text, separators, and special characters", () => {
    const sanitized = sanitizeArtifactFileName(
      "C:\\Users\\sample-user\\Desktop\\한글 sample@! raw.zip",
    );

    expect(sanitized).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(sanitized).not.toContain("\\");
    expect(sanitized).not.toContain("/");
    expect(sanitized).not.toContain(" ");
    expect(sanitized).not.toContain("sample-user");
    expect(sanitized).not.toContain("Desktop");
    expect(maskArtifactPath("C:\\Users\\sample-user\\Desktop\\x.zip")).toBe(
      "<repo-external>/x.zip",
    );
  });

  it("stores privacy warning categories without raw private values", () => {
    const artifact = buildHrcDryRunArtifactReport(
      baseDryRunReport({
        privacySafe: false,
        privacyWarnings: [
          "email found: hero@example.com",
          "windows-user-path found: C:\\Users\\sample-user\\Documents\\raw.zip",
          "account-user-token found: sample-user",
        ],
        warnings: ["source path C:\\Users\\sample-user\\Desktop\\raw.zip"],
        errors: ["contact hero@example.com"],
        validatorResult: {
          ...baseDryRunReport().validatorResult,
          issueMessages: ["bad field from C:\\Users\\sample-user\\AppData"],
          warningMessages: ["email hero@example.com"],
        },
      }),
      { generatedAt },
    );
    const serialized = JSON.stringify(artifact);

    expect(artifact.privacyWarnings).toEqual([
      "privacy pattern detected: email",
      "privacy pattern detected: windows-user-path",
      "privacy pattern detected: account-user-token",
    ]);
    expect(serialized).not.toContain("hero@example.com");
    expect(serialized).not.toContain("C:\\Users");
    expect(serialized).not.toContain("sample-user");
  });

  it("caps mismatch samples at three entries", () => {
    const artifact = buildHrcDryRunArtifactReport(
      baseDryRunReport({
        mismatchSummary: {
          hasMismatch: true,
          mismatchCount: 5,
          categories: ["length-mismatch"],
          sample: ["AA", "AKs", "AQs", "AJs", "ATs"],
          fatal: false,
        },
      }),
      { generatedAt },
    );

    expect(artifact.mismatchSummary.sample).toEqual(["AA", "AKs", "AQs"]);
  });

  it("builds a compact comparison summary", () => {
    const artifact = buildHrcDryRunArtifactReport(
      baseDryRunReport({
        warnings: ["MULTIPLE_NODE_ENTRIES"],
        mismatchSummary: {
          hasMismatch: true,
          mismatchCount: 2,
          categories: ["length-mismatch", "validator-warning"],
          sample: ["AA", "AKs"],
          fatal: false,
        },
      }),
      { generatedAt },
    );
    const summary = buildHrcDryRunComparisonSummary(artifact);

    expect(summary).toEqual({
      schemaVersion: "v2.6.0",
      generatedAt,
      sourceKind: "HRC_RAW_ZIP_DRY_RUN",
      zipFileNameSanitized: "hrc-sample.zip",
      status: "OK",
      actionCount: 3,
      handCount: 169,
      sequenceLength: 6,
      nodeEntryCount: 1,
      selectedNodeEntry: "nodes/0.json",
      validatorPass: true,
      mismatchCount: 2,
      mismatchCategories: ["length-mismatch", "validator-warning"],
      privacySafe: true,
      amountUnit: "UNKNOWN",
      warningsCount: 1,
      errorsCount: 0,
      rawZipCommitted: false,
      productImportConnected: false,
      dbWriteApplied: false,
    });
  });

  it("does not create artifacts folders or files", () => {
    const noWriteProbe = join(
      tmpdir(),
      `hrc-dry-run-artifact-no-write-${Date.now()}`,
      "artifacts",
      "hrc-dry-run-reports",
    );

    buildHrcDryRunArtifactReport(baseDryRunReport(), {
      generatedAt,
      zipPath: join(noWriteProbe, "raw.zip"),
    });

    expect(existsSync(noWriteProbe)).toBe(false);
  });
});

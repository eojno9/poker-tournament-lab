import assert from "node:assert/strict";
import test from "node:test";
import {
  HRC_ARTIFACT_ALLOWED_GET_ENDPOINTS,
  HRC_ARTIFACT_DASHBOARD_ACTION_LABELS,
  buildHrcArtifactDashboardSummary,
  filterHrcArtifactItems,
  formatHrcArtifactBoolean,
  formatHrcArtifactJsonPreview,
  isForbiddenHrcArtifactActionLabel,
  sanitizeHrcArtifactDisplayText
} from "../src/hrcArtifactDashboard.js";
import type { HrcDryRunArtifactsListResponse } from "../src/api.js";

const listResponse: HrcDryRunArtifactsListResponse = {
  directoryExists: true,
  baseDir: "artifacts/hrc-dry-run-reports",
  safety: {
    readOnly: true,
    dbWriteApplied: false,
    productImportConnected: false,
    batchRunnerExecuted: false,
    rawZipRead: false,
    uiUsed: false
  },
  invalidItems: [
    {
      fileName: "bad.json",
      reason: "MALFORMED_JSON",
      error: "parse error"
    }
  ],
  items: [
    {
      fileName: "hrc-dry-run-index-20260617-120000.json",
      kind: "INDEX",
      generatedAt: "2026-06-17T12:00:00.000Z",
      status: null,
      zipFileNameSanitized: null,
      selectedNodeEntry: null,
      privacySafe: true,
      validatorPass: null,
      warningsCount: 0,
      errorsCount: 0,
      mismatchCount: 1,
      safetyFlags: {
        rawZipCommitted: false,
        productImportConnected: false,
        dbWriteApplied: false,
        apiUsed: false,
        uiUsed: false,
        multiNodeAggregationApplied: false
      },
      sizeBytes: 512,
      modifiedAt: "2026-06-17T12:00:01.000Z"
    },
    {
      fileName: "hrc-dry-run-report-20260617-120000.json",
      kind: "REPORT",
      generatedAt: "2026-06-17T12:00:00.000Z",
      status: "OK",
      zipFileNameSanitized: "mtt-sample.zip",
      selectedNodeEntry: "nodes/0.json",
      privacySafe: true,
      validatorPass: true,
      warningsCount: 1,
      errorsCount: 0,
      mismatchCount: 0,
      safetyFlags: {
        rawZipCommitted: false,
        productImportConnected: false,
        dbWriteApplied: false,
        apiUsed: false,
        uiUsed: false,
        multiNodeAggregationApplied: false
      },
      sizeBytes: 1024,
      modifiedAt: "2026-06-17T12:00:02.000Z"
    },
    {
      fileName: "hrc-dry-run-comparison-20260617-120000.json",
      kind: "COMPARISON",
      generatedAt: "2026-06-17T12:00:00.000Z",
      status: null,
      zipFileNameSanitized: null,
      selectedNodeEntry: null,
      privacySafe: false,
      validatorPass: null,
      warningsCount: 2,
      errorsCount: 1,
      mismatchCount: 2,
      safetyFlags: {
        rawZipCommitted: false,
        productImportConnected: false,
        dbWriteApplied: false,
        apiUsed: false,
        uiUsed: false,
        multiNodeAggregationApplied: false
      },
      sizeBytes: 640,
      modifiedAt: "2026-06-17T12:00:03.000Z"
    }
  ]
};

test("builds read-only HRC artifact dashboard summary", () => {
  const summary = buildHrcArtifactDashboardSummary(listResponse);

  assert.equal(summary.directoryExists, true);
  assert.equal(summary.totalItems, 3);
  assert.equal(summary.invalidItemsCount, 1);
  assert.equal(summary.reportCount, 1);
  assert.equal(summary.indexCount, 1);
  assert.equal(summary.comparisonCount, 1);
  assert.deepEqual(summary.safetyBadges, [
    { label: "productImportConnected", value: "false" },
    { label: "dbWriteApplied", value: "false" },
    { label: "batchRunnerExecuted", value: "false" },
    { label: "rawZipRead", value: "false" }
  ]);
});

test("filters HRC artifact items without changing deterministic order", () => {
  const reportItems = filterHrcArtifactItems(listResponse.items, { kind: "REPORT", status: "OK", privacySafe: "SAFE" });

  assert.equal(reportItems.length, 1);
  assert.equal(reportItems[0]?.kind, "REPORT");
  assert.equal(reportItems[0]?.fileName, "hrc-dry-run-report-20260617-120000.json");
});

test("sanitizes raw paths, user token, field names, and emails for dashboard display", () => {
  const sanitized = sanitizeHrcArtifactDisplayText({
    path: "<sample-user-home>\\Documents\\raw\\sample.zip",
    email: "player@example.com",
    key: "playerName"
  });

  assert.equal(sanitized.includes("C:\\Users"), false);
  assert.equal(sanitized.includes("sample-user"), false);
  assert.equal(sanitized.includes("Documents"), false);
  assert.equal(sanitized.includes("player@example.com"), false);
  assert.equal(sanitized.includes("playerName"), false);
  assert.match(sanitized, /<redacted-windows-path>|<redacted-user>|<redacted-email>|<redacted-field>/);
});

test("keeps dashboard actions read-only and documents only GET endpoints", () => {
  assert.deepEqual(HRC_ARTIFACT_ALLOWED_GET_ENDPOINTS, [
    "GET /api/hrc-dry-run-artifacts",
    "GET /api/hrc-dry-run-artifacts/:fileName"
  ]);
  assert.deepEqual(HRC_ARTIFACT_DASHBOARD_ACTION_LABELS, ["Refresh list", "Details"]);
  for (const label of HRC_ARTIFACT_DASHBOARD_ACTION_LABELS) {
    assert.equal(isForbiddenHrcArtifactActionLabel(label), false);
  }
  assert.equal(isForbiddenHrcArtifactActionLabel("Import raw zip"), true);
  assert.equal(isForbiddenHrcArtifactActionLabel("Run batch"), true);
});

test("formats unknown booleans and redacted JSON previews", () => {
  assert.equal(formatHrcArtifactBoolean(null), "unknown");
  const preview = formatHrcArtifactJsonPreview({
    detail: "<sample-user-home>\\Desktop\\node.json",
    contact: "raw@example.com"
  });

  assert.equal(preview.includes("C:\\Users"), false);
  assert.equal(preview.includes("sample-user"), false);
  assert.equal(preview.includes("raw@example.com"), false);
});

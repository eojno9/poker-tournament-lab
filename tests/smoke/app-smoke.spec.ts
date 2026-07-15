import { expect, test } from "@playwright/test";

const hrcResponse = {
  source: "HRC_PRECOMPUTED_DB",
  sourceLabel: "HRC precomputed DB",
  canonicalKey: "smoke-hrc-key",
  assumptions: ["Input spot canonical key exactly matches the imported DB record."],
  limitations: ["Near match is not treated as solved."],
  strategy: {
    AA: {
      hand: "AA",
      actions: [
        {
          action: "RAISE",
          size: { sizeBb: 2.2, rawSizeLabel: "2.2bb" },
          frequency: 0.4,
          ev: 1.1,
          chipEv: 1.3,
          icmEv: 1.1,
          sourceActionLabel: "Raise 2.2bb",
          warnings: []
        },
        {
          action: "ALL_IN",
          size: { isAllIn: true },
          frequency: 0.6,
          ev: 1.2,
          chipEv: 1.4,
          icmEv: 1.2,
          sourceActionLabel: "Jam",
          warnings: []
        }
      ],
      totalFrequency: 1,
      warnings: []
    }
  },
  evSummary: {
    unit: "chips",
    shoveEv: 1.2,
    foldEv: 0.6,
    deltaEv: 0.6,
    bestAction: "SHOVE",
    notes: ["smoke-test-hrc"]
  },
  metadata: {
    importId: 1,
    importedAt: "2026-06-01T03:00:00.000Z",
    fileName: "smoke-db.zip",
    fileHash: "abc12345"
  }
};

const fallbackResponse = {
  source: "FALLBACK_ICM",
  sourceLabel: "Fallback ICM EV evaluator",
  canonicalKey: "smoke-fallback-key",
  assumptions: ["Villain calling ranges are seat-level assumptions from presets and user overrides."],
  limitations: ["Regular NLHE push/fold only.", "This is an ICM EV evaluation, not a Nash solution."],
  strategy: {
    AA: { action: "SHOVE", frequency: 1, evPush: 0.91, evFold: 0.33 }
  },
  evSummary: {
    unit: "prize",
    shoveEv: 0.91,
    bestAction: "SHOVE",
    notes: ["smoke-test-fallback"]
  },
  fallbackMetadata: {
    modelVersion: "fallback-icm-monte-carlo-v1",
    villainRanges: [
      {
        seat: 6,
        position: "BB",
        presetName: "standard",
        editedByUser: false,
        callRangePct: 16,
        rangeSource: "preset"
      }
    ],
    limitations: [
      "This is an ICM EV evaluation, not a Nash solution.",
      "Villain calling ranges are assumptions, not solved equilibrium ranges."
    ]
  }
};

const notSolvedResponse = {
  source: "NOT_SOLVED",
  sourceLabel: "NOT_SOLVED",
  canonicalKey: "smoke-not-solved-key",
  assumptions: [],
  limitations: [
    "No exact HRC_PRECOMPUTED_DB match and fallback requirements are incomplete.",
    "No guessing and no heuristic recommendation is produced in this state."
  ],
  strategy: null,
  evSummary: null,
  missingRequirements: ["fallback requires one payout value per remaining player, including 0 for unpaid places"]
};

const databaseSampleSolution = {
  id: 10,
  importId: 2,
  canonicalKey: "db-smoke-canonical-key",
  sourceLabel: "HRC Smoke DB",
  externalId: "sample-10",
  importedAt: "2026-06-01T04:10:00.000Z",
  fileName: "mtt_10p_rfi_20bb.zip",
  fileHash: "smoke-hash",
  databaseFeatures: {
    fileName: "mtt_10p_rfi_20bb.zip",
    playerCount: 10,
    stackDepthBb: 20,
    treeDepth: 5,
    calculationModel: "ChipEV",
    spotFamily: "RFI",
    actionTags: ["RFI", "OPEN"],
    streetScope: "PREFLOP_ONLY",
    preflopOnly: true,
    preflopOnlyReason: "file_name_limp_keyword",
    exportShape: "complete_export",
    warnings: []
  },
  spot: {
    gameType: "NLHE_MTT",
    tournamentType: "REGULAR",
    decisionType: "PUSH_FOLD",
    street: "PREFLOP",
    tableSize: 6,
    heroSeat: 4,
    heroPosition: "BTN",
    potBb: 2.2,
    blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
    players: [
      { seat: 1, position: "UTG", stackBb: 25, inHand: false },
      { seat: 2, position: "HJ", stackBb: 21, inHand: true },
      { seat: 3, position: "CO", stackBb: 19, inHand: true },
      { seat: 4, position: "BTN", stackBb: 18, inHand: true, isHero: true },
      { seat: 5, position: "SB", stackBb: 16, inHand: true },
      { seat: 6, position: "BB", stackBb: 22, inHand: true }
    ],
    payouts: [1000, 700, 500, 350, 0, 0],
    actionPath: ["FOLD", "FOLD", "HERO_DECISION"]
  },
  strategy: {
    AA: { action: "SHOVE", frequency: 1, evPush: 1.4, evFold: 1.0 },
    KK: { action: "SHOVE", frequency: 1, evPush: 1.2, evFold: 1.0 },
    AKo: { action: "MIXED", frequency: 0.5, evPush: 1.0, evFold: 0.9 }
  },
  evSummary: {
    unit: "chips",
    shoveEv: 1.4,
    foldEv: 1.0,
    deltaEv: 0.4,
    bestAction: "SHOVE",
    notes: []
  }
};

const databaseV2SampleSolution = {
  ...databaseSampleSolution,
  strategy: {
    AA: {
      hand: "AA",
      actions: [
        {
          action: "RAISE",
          size: { sizeBb: 2.2, rawSizeLabel: "2.2bb" },
          frequency: 0.45,
          ev: 1.32,
          chipEv: 1.5,
          icmEv: 1.32,
          sourceActionLabel: "Raise 2.2bb",
          warnings: []
        },
        {
          action: "ALL_IN",
          size: { isAllIn: true },
          frequency: 0.55,
          ev: 1.4,
          chipEv: 1.6,
          icmEv: 1.4,
          sourceActionLabel: "Jam",
          warnings: []
        }
      ],
      totalFrequency: 1,
      warnings: []
    },
    KK: {
      hand: "KK",
      actions: [
        {
          action: "CALL",
          size: null,
          frequency: 1,
          ev: null,
          chipEv: null,
          icmEv: null,
          sourceActionLabel: "Call",
          warnings: ["CALL size is not provided"]
        }
      ],
      totalFrequency: 1,
      warnings: ["CALL size is not provided"]
    }
  }
};

const latestReportsSummary = {
  importReport: {
    status: "available",
    fileName: "latest-import-report.json",
    generatedAt: "2026-06-01T04:20:00.000Z",
    error: null,
    summary: {
      importedFiles: 27,
      skippedFiles: 1,
      discardedHrczFiles: 3,
      importedRecords: 52746,
      failedRecords: 0,
      warnings: [],
      skippedDetails: [{ fileName: "sample-skipped.zip", reason: "no nodes/*.json entries" }],
      discardedHrczList: ["40bb set.hrcz", "Hand 6.hrcz", "Hand 7.hrcz"]
    }
  },
  verificationReport: {
    status: "available",
    fileName: "latest-verification-report.json",
    generatedAt: "2026-06-01T04:21:00.000Z",
    error: null,
    summary: {
      exactLookup: { success: 262, total: 262, successRatePct: 100, failures: [] },
      randomLookup: { success: 20, total: 20, successRatePct: 100, failures: [] },
      duplicateCanonicalKeyCount: 0,
      nearMatchFalsePositiveCount: 0,
      duplicateCanonicalKeyDetails: [],
      nearMatchFalsePositives: []
    }
  },
  canonicalKeyReport: {
    status: "available",
    fileName: "latest-canonical-key-report.json",
    generatedAt: "2026-06-01T04:22:00.000Z",
    error: null,
    summary: {
      mismatchCount: 1,
      updatedCount: 1,
      collisionCount: 0,
      invalidCount: 0
    }
  }
};

const dbHealthSummary = {
  totalSolutions: 262,
  totalStrategyEntries: 32014,
  distinctCanonicalKeys: 262,
  duplicateCanonicalKeyCount: 0,
  latestImportStatus: "available",
  latestVerificationStatus: "available",
  latestCanonicalKeyReportStatus: "available",
  exactLookup: { success: 262, total: 262, successRatePct: 100 },
  randomLookup: { success: 20, total: 20, successRatePct: 100 },
  nearMatchFalsePositiveCount: 0,
  discardedHrczCount: 3,
  skippedFileCount: 1,
  failedRecordCount: 0,
  canonicalKey: {
    mismatchCount: 1,
    updatedCount: 1,
    collisionCount: 0,
    invalidCount: 0
  }
};

const importValidationSummary = {
  status: "WARN",
  format: "json",
  totalRows: 3,
  validRows: 2,
  failedRows: 1,
  errorCount: 1,
  warningCount: 2,
  duplicateCanonicalKeyCount: 1,
  duplicateCanonicalKeyPreview: [
    {
      canonicalKey: "{\"actionPath\":[\"FOLD\",\"HERO_DECISION\"]}",
      rowNumbers: [1, 2],
      count: 2
    }
  ],
  issues: [
    {
      rowNumber: 3,
      severity: "error",
      code: "INVALID_FREQUENCY_RANGE",
      field: "strategy.AA.frequency",
      message: "frequency must be within 0 and 1"
    },
    {
      rowNumber: 1,
      severity: "warning",
      code: "STRATEGY_COUNT_NOT_169",
      field: "strategy",
      message: "strategy contains 120 hand keys (expected 169)."
    }
  ],
  generatedAt: "2026-06-01T04:25:00.000Z"
};

const canonicalDiffResponse = {
  sameCanonicalKey: false,
  leftCanonicalKey: "left-canonical-key",
  rightCanonicalKey: "right-canonical-key",
  differences: [
    {
      field: "ante",
      left: 0.1,
      right: 0.2,
      severity: "key_affecting"
    },
    {
      field: "stacks.BTN",
      left: 18,
      right: 19,
      severity: "key_affecting"
    }
  ],
  explanation: ["ante 값이 달라 canonical key가 달라졌습니다.", "BTN stack 값이 달라 canonical key가 달라졌습니다."]
};

const hrcArtifactListResponse = {
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
  items: [
    {
      fileName: "hrc-dry-run-report-smoke.json",
      kind: "REPORT",
      generatedAt: "2026-06-17T12:00:00.000Z",
      status: "OK",
      zipFileNameSanitized: "smoke-hrc-sample.zip",
      selectedNodeEntry: "nodes/0.json",
      privacySafe: true,
      validatorPass: true,
      warningsCount: 0,
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
      modifiedAt: "2026-06-17T12:00:01.000Z"
    },
    {
      fileName: "hrc-dry-run-index-smoke.json",
      kind: "INDEX",
      generatedAt: "2026-06-17T12:00:02.000Z",
      status: null,
      zipFileNameSanitized: null,
      selectedNodeEntry: null,
      privacySafe: true,
      validatorPass: null,
      warningsCount: 1,
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
      sizeBytes: 1536,
      modifiedAt: "2026-06-17T12:00:03.000Z"
    },
    {
      fileName: "hrc-dry-run-comparison-smoke.json",
      kind: "COMPARISON",
      generatedAt: "2026-06-17T12:00:04.000Z",
      status: null,
      zipFileNameSanitized: null,
      selectedNodeEntry: null,
      privacySafe: false,
      validatorPass: null,
      warningsCount: 2,
      errorsCount: 1,
      mismatchCount: 3,
      safetyFlags: {
        rawZipCommitted: false,
        productImportConnected: false,
        dbWriteApplied: false,
        apiUsed: false,
        uiUsed: false,
        multiNodeAggregationApplied: false
      },
      sizeBytes: 2048,
      modifiedAt: "2026-06-17T12:00:05.000Z"
    },
    {
      fileName: "hrc-dry-run-missing-smoke.json",
      kind: "REPORT",
      generatedAt: "2026-06-17T12:00:06.000Z",
      status: "OK",
      zipFileNameSanitized: "missing-detail.zip",
      selectedNodeEntry: "nodes/0.json",
      privacySafe: true,
      validatorPass: true,
      warningsCount: 0,
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
      sizeBytes: 256,
      modifiedAt: "2026-06-17T12:00:07.000Z"
    },
    {
      fileName: "hrc-dry-run-invalid-detail-smoke.json",
      kind: "REPORT",
      generatedAt: "2026-06-17T12:00:08.000Z",
      status: "OK",
      zipFileNameSanitized: "invalid-detail.zip",
      selectedNodeEntry: "nodes/0.json",
      privacySafe: true,
      validatorPass: true,
      warningsCount: 0,
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
      sizeBytes: 256,
      modifiedAt: "2026-06-17T12:00:09.000Z"
    }
  ],
  invalidItems: [
    {
      fileName: "broken-smoke.json",
      reason: "MALFORMED_JSON",
      error: "safe parse error"
    }
  ]
};

const hrcArtifactDetailResponse = {
  fileName: "hrc-dry-run-report-smoke.json",
  kind: "REPORT",
  summary: hrcArtifactListResponse.items[0],
  detail: {
    adapterReportSummary: {
      candidateBuilt: true,
      handCount: 169,
      actionCount: 3,
      hiddenRawPath: "<sample-user-home>\\Documents\\raw\\smoke.zip"
    },
    validatorResult: {
      pass: true,
      checkedHands: 169,
      sourceLabel: "smoke@example.com"
    },
    mismatchSummary: {
      hasMismatch: false,
      mismatchCount: 0,
      categories: [],
      sample: []
    },
    privacyWarnings: ["privacy pattern detected: <sample-user-home>\\Desktop\\raw.zip", "userName smoke@example.com"],
    indexSummary: null,
    comparisonSummary: null,
    safety: {
      rawZipCommitted: false,
      productImportConnected: false,
      dbWriteApplied: false,
      apiUsed: false,
      uiUsed: false,
      multiNodeAggregationApplied: false,
      readOnly: true,
      batchRunnerExecuted: false,
      rawZipRead: false
    }
  }
};

test.describe("public workflow smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/imports/validate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(importValidationSummary)
      });
    });
    await page.route("**/api/imports*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imports: [] })
      });
    });
    await page.route("**/api/solutions*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ solutions: [] })
      });
    });
    await page.route("**/api/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(hrcResponse)
      });
    });
    await page.route("**/api/reports/latest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(latestReportsSummary)
      });
    });
    await page.route("**/api/db/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dbHealthSummary)
      });
    });
    await page.route("**/api/canonical-key/diff", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(canonicalDiffResponse)
      });
    });
  });

  test("renders tabs and import report cards", async ({ page }) => {
    await page.route("**/api/solutions*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ solutions: [databaseV2SampleSolution] })
      });
    });

    await page.goto("/");
    const tabs = page.locator("nav.tabs");
    await expect(tabs.getByRole("button", { name: "Analyze", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Browser", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: /Trainer/i })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Import", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Database", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "HRC Artifacts", exact: true })).toBeVisible();
    await expect(page.getByLabel("남은 인원")).toBeVisible();
    await expect(page.getByLabel("Hero 포지션")).toBeVisible();
    await expect(page.getByLabel("프리셋 이름")).toBeVisible();
    await expect(page.getByTestId("recent-analyses-empty")).toBeVisible();
    await expect(page.getByTestId("preset-save-button")).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-selector")).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-selector")).toContainText("DB에 실제 존재하는 action/size 후보만 표시합니다.");
    await expect(page.getByTestId("analyze-action-sizing-selector")).toContainText("자동 분석하지 않습니다.");
    await expect(page.getByTestId("analyze-action-sizing-empty")).toBeVisible();

    await page.getByLabel("Hero 포지션").selectOption("BTN");
    await expect(page.getByTestId("analyze-action-sizing-candidate").first()).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-warning")).toBeVisible();
    await page.getByTestId("analyze-action-sizing-candidate").first().click();
    await expect(page.getByTestId("analyze-action-sizing-selected")).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-selected")).toContainText("선택된 action");

    await page.getByLabel("프리셋 이름").fill("Smoke Preset");
    await page.getByTestId("preset-save-button").click();
    await expect(page.getByTestId("analyze-preset-list")).toBeVisible();
    await expect(page.getByTestId("analyze-preset-list")).toContainText("Smoke Preset");

    await tabs.getByRole("button", { name: "Browser", exact: true }).click();
    await expect(page.getByTestId("solution-browser-view")).toBeVisible();
    await expect(page.getByTestId("browser-spot-selector-panel")).toContainText("DB에 있는 spot만 선택합니다.");
    await expect(page.getByTestId("browser-solution-candidate").first()).toBeVisible();
    await expect(page.getByTestId("browser-solution-candidate").first()).toContainText("HRC Smoke DB");
    await expect(page.getByTestId("browser-solution-candidate").first()).toContainText("BTN");
    await expect(page.getByTestId("browser-solution-candidate").first()).toContainText("mtt_10p_rfi_20bb.zip");
    await expect(page.getByTestId("browser-action-tree-breadcrumb")).toBeVisible();
    await expect(page.getByTestId("browser-action-tree-breadcrumb")).toContainText("Action Tree");
    await expect(page.getByTestId("browser-action-tree-breadcrumb")).toContainText("HRC Smoke DB");
    await expect(page.getByTestId("browser-action-tree-breadcrumb")).toContainText("RFI / Open Raise");
    await expect(page.getByTestId("browser-action-tree-breadcrumb")).toContainText("Open raise");
    await expect(page.getByTestId("browser-action-tree-badges")).toContainText("Available Actions");
    await expect(page.getByTestId("browser-action-tree-badges")).toContainText("Available Sizes");
    await expect(page.getByTestId("browser-action-tree-filters")).toBeVisible();
    await expect(page.getByLabel("Browser Spot Type 필터")).toBeVisible();
    await expect(page.getByLabel("Browser Spot Type 필터")).toContainText("RFI / Open Raise");
    await expect(page.getByLabel("Browser Action Node 필터")).toBeVisible();
    await expect(page.getByLabel("Browser Action Node 필터")).toContainText("Open raise");
    await page.getByLabel("Browser Spot Type 필터").selectOption("RFI");
    await expect(page.getByTestId("browser-solution-candidate").first()).toContainText("Spot Type RFI / Open Raise");
    await page.getByLabel("Browser Action Node 필터").selectOption("OPEN_RAISE");
    await expect(page.getByTestId("browser-solution-candidate").first()).toContainText("Tree Node Open raise");
    await expect(page.getByTestId("browser-node-candidate-summary")).toBeVisible();
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("Candidate Solutions");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("Current Node");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("RFI / Open Raise");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("Open raise");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("Available Actions");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("RAISE");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("ALL_IN");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("Available Sizes");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("2.2bb");
    await expect(page.getByTestId("browser-node-candidate-summary")).toContainText("Filtered by");
    await expect(page.getByTestId("browser-strategy-matrix-panel")).toContainText("13x13 Strategy Matrix");
    await expect(page.getByTestId("browser-strategy-matrix-panel")).toContainText("action frequency matrix");
    await expect(page.getByTestId("browser-selected-summary")).toContainText("HRC Smoke DB");
    await expect(page.getByTestId("browser-selected-summary")).toContainText("multi-action-v2 actions[]");
    await expect(page.getByTestId("browser-action-tree-summary")).toBeVisible();
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Action Tree Summary");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Spot Type");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("RFI / Open Raise");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Action Node");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Open raise");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Available Actions");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("RAISE");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("ALL_IN");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Available Sizes");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("2.2bb");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("Breadcrumb");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("HRC Smoke DB");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("LIMP");
    await expect(page.getByTestId("browser-action-tree-summary")).toContainText("CALL");
    await expect(page.getByTestId("solution-browser-controls")).toBeVisible();
    await expect(page.getByLabel("Solution Browser action kind 필터")).toBeVisible();
    await expect(page.getByLabel("Solution Browser action kind 필터")).toContainText("CALL");
    await expect(page.getByLabel("Solution Browser action kind 필터")).toContainText("RAISE");
    await expect(page.getByLabel("Solution Browser action kind 필터")).toContainText("ALL_IN");
    await expect(page.getByLabel("Solution Browser size label 필터")).toBeVisible();
    await expect(page.getByLabel("Solution Browser size label 필터")).toContainText("2.2bb");
    await expect(page.getByLabel("Solution Browser size label 필터")).toContainText("all-in");
    await expect(page.getByLabel("Solution Browser EV 표시 방식")).toBeVisible();
    await expect(page.getByLabel("Solution Browser EV 표시 방식")).toContainText("ChipEV");
    await expect(page.getByTestId("browser-action-size-filter-context")).toBeVisible();
    await expect(page.getByTestId("browser-action-size-filter-context")).toContainText("Action / Size Filter Context");
    await expect(page.getByTestId("browser-action-size-filter-context")).toContainText("Node available actions");
    await expect(page.getByTestId("browser-action-size-filter-context")).toContainText("Node available sizes");
    await expect(page.getByTestId("browser-action-size-filter-context")).toContainText("RAISE");
    await expect(page.getByTestId("browser-action-size-filter-context")).toContainText("2.2bb");
    await expect(page.getByTestId("browser-strategy-matrix")).toBeVisible();
    await expect(page.getByTestId("browser-matrix-node-context")).toContainText("Strategy Matrix");
    await expect(page.getByTestId("browser-matrix-node-context")).toContainText("RFI / Open Raise");
    await expect(page.getByTestId("browser-matrix-node-context")).toContainText("Open raise");
    await expect(page.getByTestId("browser-strategy-matrix")).toContainText("선택한 DB solution의 strategy");
    await expect(page.getByTestId("browser-matrix-hand-aa")).toContainText("AA");
    await expect(page.getByTestId("browser-matrix-hand-aa")).toContainText("RAISE 45%");
    await expect(page.getByTestId("browser-matrix-hand-aa")).toContainText("ALL_IN 55%");
    await expect(page.getByTestId("browser-hand-detail-panel")).toContainText("Hand Detail");
    await expect(page.getByTestId("browser-hand-detail-panel")).toContainText("action, size, frequency, EV");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("AA");
    await expect(page.getByTestId("browser-hand-node-context")).toContainText("Selected Hand: AA");
    await expect(page.getByTestId("browser-hand-node-context")).toContainText("RFI / Open Raise");
    await expect(page.getByTestId("browser-hand-node-context")).toContainText("Open raise");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("primary action");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("mixed action");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("RAISE");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("2.2bb");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("45%");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("ChipEV");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("ICM EV");
    await page.getByLabel("Solution Browser EV 표시 방식").selectOption("CHIP_EV");
    await expect(page.getByTestId("browser-matrix-hand-aa")).toContainText("ChipEV");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("ChipEV selected");
    await page.getByLabel("Solution Browser action kind 필터").selectOption("CALL");
    await expect(page.getByLabel("Solution Browser action kind 필터")).toHaveValue("CALL");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("KK");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("CALL");
    await expect(page.getByTestId("browser-matrix-hand-kk")).toContainText("CALL 100%");
    await page.getByLabel("Solution Browser size label 필터").selectOption("unknown/unspecified");
    await expect(page.getByLabel("Solution Browser size label 필터")).toHaveValue("unknown/unspecified");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("KK");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("CALL");
    await page.getByTestId("browser-matrix-hand-kk").click();
    await expect(page.getByTestId("browser-hand-detail")).toContainText("KK");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("CALL");
    await expect(page.getByTestId("browser-hand-detail")).toContainText("100%");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("db-smoke-canonical-key");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("FOLD > FOLD > HERO_DECISION");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Source / Metadata");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Action Tree Spot Type");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Action Tree Node");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Action Tree Breadcrumb");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Action Tree Available Actions");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Action Tree Available Sizes");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("Action Tree Warnings");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("HRC Smoke DB");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("multi-action-v2 actions[]");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("strategy hand count");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("action count");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("missing EV");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("missing size");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("unknown action");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("file hash");
    await expect(page.getByTestId("browser-selected-metadata")).toContainText("smoke-hash");
    await expect(page.getByTestId("solution-browser-view")).toContainText("read-only DB browser");
    await expect(page.getByTestId("solution-browser-view")).toContainText("/api/solutions");
    await expect(page.getByTestId("solution-browser-view")).toContainText("nearest recommendation 없음");
    await expect(page.getByTestId("solution-browser-view")).toContainText("RTA/live 기능 없음");

    await tabs.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByRole("heading", { name: /HRC DB Import/i })).toBeVisible();
    await expect(page.getByTestId("import-report-summary-card")).toBeVisible();
    await expect(page.getByTestId("db-health-summary-card")).toBeVisible();
    await expect(page.getByTestId("verification-report-summary-card")).toBeVisible();
    await expect(page.getByTestId("verification-report-detail-card")).toBeVisible();
    await expect(page.getByTestId("canonical-report-summary-card")).toBeVisible();
    await expect(page.getByTestId("report-status-verification-report-summary-card")).toContainText("정상");
    await expect(page.getByText("DB Health")).toBeVisible();
    await expect(page.getByText("latest-import-report.json")).toBeVisible();
    await expect(page.getByText("latest-verification-report.json")).toBeVisible();
    await expect(page.getByText("latest-canonical-key-report.json")).toBeVisible();
    await expect(page.getByTestId("verification-report-summary-card")).toContainText("262/262 (100.00%)");
    await expect(page.getByTestId("verification-report-summary-card")).toContainText("20/20 (100.00%)");
    await expect(page.getByTestId("verification-report-summary-card")).toContainText("near-match HRC 오탐");
    await expect(page.getByTestId("verification-report-detail-card")).toContainText("문제 없음");
    await expect(page.getByTestId("import-validation-summary-card")).toBeVisible();
    await expect(page.getByTestId("canonical-diff-card")).toBeVisible();
    await expect(page.getByTestId("canonical-diff-run-button")).toBeVisible();
    await page.getByTestId("canonical-diff-run-button").click();
    await expect(page.getByTestId("canonical-diff-card")).toContainText("left-canonical-key");
    await expect(page.getByTestId("canonical-diff-card")).toContainText("right-canonical-key");
    await expect(page.getByTestId("canonical-diff-card")).toContainText("ante");
    await expect(page.getByTestId("canonical-diff-card")).toContainText("BTN stack");
    await expect(page.getByTestId("import-validate-button")).toBeVisible();
    await page.getByTestId("import-validate-button").click();
    await expect(page.getByTestId("import-validation-summary-card")).toContainText("WARN");

    await tabs.getByRole("button", { name: "Database", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Imports$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Solutions$/ })).toBeVisible();
  });

  test("renders read-only HRC artifact dashboard", async ({ page }) => {
    const apiRequests: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) {
        apiRequests.push({ method: request.method(), url: request.url() });
      }
    });

    await page.route("**/api/hrc-dry-run-artifacts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(hrcArtifactListResponse)
      });
    });
    await page.route("**/api/hrc-dry-run-artifacts/*", async (route) => {
      const url = route.request().url();
      if (url.endsWith("hrc-dry-run-report-smoke.json")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(hrcArtifactDetailResponse)
        });
        return;
      }
      if (url.endsWith("hrc-dry-run-missing-smoke.json")) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "artifact file was not found" })
        });
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: "artifact JSON is invalid" })
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "HRC Artifacts", exact: true }).click();

    const dashboard = page.getByTestId("hrc-artifacts-view");
    await expect(dashboard).toBeVisible();
    await expect(page.getByTestId("hrc-artifact-readonly-notice")).toContainText("읽기 전용 대시보드입니다.");
    await expect(page.getByTestId("hrc-artifact-readonly-notice")).toContainText("GET /api/hrc-dry-run-artifacts");
    await expect(page.getByTestId("hrc-artifact-summary")).toContainText("reports");
    await expect(page.getByTestId("hrc-artifact-summary")).toContainText("comparisons");
    await expect(page.getByTestId("hrc-artifact-safety-badges")).toContainText("productImportConnected: false");
    await expect(page.getByTestId("hrc-artifact-safety-badges")).toContainText("dbWriteApplied: false");
    await expect(page.getByTestId("hrc-artifact-safety-badges")).toContainText("batchRunnerExecuted: false");
    await expect(page.getByTestId("hrc-artifact-safety-badges")).toContainText("rawZipRead: false");
    await expect(page.getByTestId("hrc-artifact-list")).toContainText("REPORT");
    await expect(page.getByTestId("hrc-artifact-list")).toContainText("INDEX");
    await expect(page.getByTestId("hrc-artifact-list")).toContainText("COMPARISON");
    await expect(page.getByTestId("hrc-artifact-invalid-items")).toContainText("MALFORMED_JSON");

    await dashboard.getByTestId("hrc-artifact-row").filter({ hasText: "hrc-dry-run-report-smoke.json" }).getByRole("button", { name: "상세" }).click();
    await expect(page.getByTestId("hrc-artifact-detail")).toBeVisible();
    await expect(page.getByTestId("hrc-artifact-detail")).toContainText("Adapter report summary");
    await expect(page.getByTestId("hrc-artifact-detail")).toContainText("Validator result");
    await expect(page.getByTestId("hrc-artifact-detail")).toContainText("Mismatch summary");
    await expect(page.getByTestId("hrc-artifact-detail")).toContainText("rawZipCommitted");
    await expect(page.getByTestId("hrc-artifact-detail")).toContainText("productImportConnected");
    await expect(page.getByTestId("hrc-artifact-detail")).toContainText("dbWriteApplied");

    await dashboard.getByTestId("hrc-artifact-row").filter({ hasText: "hrc-dry-run-missing-smoke.json" }).getByRole("button", { name: "상세" }).click();
    await expect(page.getByTestId("hrc-artifact-detail-panel")).toContainText("상세 조회에 실패했습니다");
    await expect(page.getByTestId("hrc-artifact-detail-panel")).toContainText("요청한 정보를 찾지 못했습니다");
    await expect(page.getByTestId("hrc-artifact-detail-panel")).not.toContainText("artifact file was not found");

    await dashboard.getByTestId("hrc-artifact-row").filter({ hasText: "hrc-dry-run-invalid-detail-smoke.json" }).getByRole("button", { name: "상세" }).click();
    await expect(page.getByTestId("hrc-artifact-detail-panel")).toContainText("상세 조회에 실패했습니다");
    await expect(page.getByTestId("hrc-artifact-detail-panel")).toContainText("요청 내용을 확인해 주세요");
    await expect(page.getByTestId("hrc-artifact-detail-panel")).not.toContainText("artifact JSON is invalid");

    await expect(dashboard).not.toContainText("C:\\Users");
    await expect(dashboard).not.toContainText("sample-user");
    await expect(dashboard).not.toContainText("smoke@example.com");
    await expect(dashboard.getByRole("button", { name: /Import|Export|Run|Upload|Delete|Write|Solver|Solve|Analyze/i })).toHaveCount(0);
    expect(apiRequests.some((request) => request.method !== "GET" && request.url.includes("hrc-dry-run-artifacts"))).toBe(false);
    expect(apiRequests.some((request) => request.url.includes("/api/imports/hrc") || request.url.includes("/api/imports/validate"))).toBe(false);
  });

  test("renders HRC artifact dashboard empty and list error states", async ({ page }) => {
    await page.route("**/api/hrc-dry-run-artifacts", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          directoryExists: false,
          baseDir: "artifacts/hrc-dry-run-reports",
          items: [],
          invalidItems: [],
          safety: {
            readOnly: true,
            dbWriteApplied: false,
            productImportConnected: false,
            batchRunnerExecuted: false,
            rawZipRead: false,
            uiUsed: false
          }
        })
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "HRC Artifacts", exact: true }).click();
    await expect(page.getByTestId("hrc-artifact-empty-state")).toBeVisible();
    await expect(page.getByTestId("hrc-artifact-empty-state")).toContainText("폴더나 파일을 만들지 않습니다");

    await page.route("**/api/hrc-dry-run-artifacts", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "mock list failure" })
      });
    });
    await page.getByLabel("목록 새로고침").click();
    await expect(page.getByTestId("hrc-artifact-list-error")).toContainText("HRC artifact 목록 조회에 실패했습니다");
    await expect(page.getByTestId("hrc-artifact-list-error")).toContainText("서버에서 요청을 처리하지 못했습니다");
    await expect(page.getByTestId("hrc-artifact-list-error")).not.toContainText("mock list failure");
  });

  test("renders trainer quiz loop from HRC solutions", async ({ page }) => {
    await page.route("**/api/solutions*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ solutions: [databaseSampleSolution] })
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Trainer", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Trainer 학습" })).toBeVisible();
    await expect(page.getByText("오프테이블 학습 전용 Trainer입니다.")).toBeVisible();
    await expect(page.getByText("실시간 플레이 보조, 화면 캡처, OCR, 오버레이, 핫키, 포커 클라이언트 연동 기능은 제공하지 않습니다.")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-controls")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-hero-position")).toHaveAttribute("aria-label", "Trainer 포지션 필터");
    await expect(page.getByTestId("trainer-filter-table-size")).toHaveAttribute("aria-label", "Trainer 테이블 인원 필터");
    await expect(page.getByTestId("trainer-filter-tree-config")).toHaveAttribute("aria-label", "Trainer 트리 유형 필터");
    await expect(page.getByTestId("trainer-filter-source-file")).toHaveAttribute("aria-label", "Trainer 로컬 소스 필터");
    await expect(page.getByTestId("trainer-hand-input")).toHaveAttribute("aria-label", "Trainer 핸드 입력");
    await expect(page.getByTestId("trainer-seed-input")).toHaveAttribute("aria-label", "Trainer 시드 입력");
    await expect(page.getByRole("button", { name: /필터 저장/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /저장된 필터 불러오기/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /필터 초기화/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /세션 다시 시작/ })).toBeVisible();
    await page.getByTestId("trainer-filter-save-button").click();
    await expect(page.getByTestId("trainer-filter-storage-notice")).toContainText("현재 필터를 이 브라우저에 저장했습니다.");
    await page.getByTestId("trainer-filter-load-button").click();
    await expect(page.getByTestId("trainer-filter-storage-notice")).toContainText("저장된 필터를 안전하게 불러왔습니다.");
    await expect(page.getByTestId("trainer-session-card")).toBeVisible();
    await expect(page.getByTestId("trainer-session-status")).toContainText("시작 전");
    await expect(page.getByTestId("trainer-session-card")).toContainText("세션 시도");
    await expect(page.getByTestId("trainer-candidate-count")).toContainText("후보 문제");
    await expect(page.getByTestId("trainer-summary-card")).toBeVisible();
    await expect(page.getByTestId("trainer-summary-card")).toContainText("아직 학습 기록이 없습니다.");
    await expect(page.getByTestId("trainer-problem-card")).toBeVisible();
    await expect(page.getByTestId("trainer-problem-card")).toContainText("로컬 사전 계산 학습 데이터");
    await expect(page.getByTestId("trainer-shove-button")).toBeVisible();
    await expect(page.getByTestId("trainer-shove-button")).toContainText("올인(Shove)");
    await expect(page.getByTestId("trainer-fold-button")).toBeVisible();
    await expect(page.getByTestId("trainer-fold-button")).toContainText("폴드(Fold)");
    await page.getByTestId("trainer-shove-button").focus();
    await expect(page.getByTestId("trainer-shove-button")).toBeFocused();
    await expect(page.getByTestId("trainer-recent-section")).toBeVisible();
    await expect(page.getByTestId("trainer-mistakes-section")).toBeVisible();
    await expect(page.getByTestId("trainer-mistake-status-grid")).toBeVisible();
    await expect(page.getByTestId("trainer-clear-recent-button")).toBeVisible();
    await expect(page.getByTestId("trainer-clear-mistakes-button")).toBeVisible();

    await page.getByTestId("trainer-shove-button").click();
    await expect(page.getByTestId("trainer-shove-button")).toBeDisabled();
    await expect(page.getByTestId("trainer-fold-button")).toBeDisabled();
    await expect(page.getByTestId("trainer-next-button")).toBeDisabled();
    await expect(page.getByTestId("trainer-result-card")).toBeVisible();
    await expect(page.getByTestId("trainer-result-card")).toContainText("선택한 액션");
    await expect(page.getByTestId("trainer-result-card")).toContainText("정답 액션");
    await expect(page.getByTestId("trainer-recent-list")).toBeVisible();
    await expect(page.getByTestId("trainer-recent-row")).toHaveCount(1);
    await expect(page.getByTestId("trainer-summary-total-attempts")).toContainText("1");
    await expect(page.getByTestId("trainer-summary-accuracy")).toContainText("%");
    await expect(page.getByTestId("trainer-session-card")).toContainText("세션 정답률");
    await expect(page.getByTestId("trainer-session-status")).toContainText("세션 완료");
    await expect(page.getByTestId("trainer-session-complete-summary")).toContainText("세션 완료");
    await page.getByTestId("trainer-session-reset-button").click();
    await expect(page.getByTestId("trainer-session-status")).toContainText("시작 전");
    await expect(page.getByTestId("trainer-recent-row")).toHaveCount(1);
    await expect(page.getByTestId("trainer-shove-button")).toBeEnabled();

    await page.getByTestId("trainer-fold-button").click();
    await expect(page.getByTestId("trainer-mistakes-list")).toBeVisible();
    await expect(page.getByTestId("trainer-mistake-row").first()).toBeVisible();
    await expect(page.getByTestId("trainer-retry-mistake-button").first()).toContainText("다시 풀기");
    await expect(page.getByTestId("trainer-dismiss-mistake-button").first()).toContainText("숨기기");
    await expect(page.getByTestId("trainer-mistake-filter-tabs")).toBeVisible();
    await page.getByTestId("trainer-mistake-filter-resolved").click();
    await expect(page.getByTestId("trainer-mistake-filter-resolved")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("trainer-mistakes-empty-state")).toContainText("해결됨 상태의 오답이 없습니다.");
    await page.getByTestId("trainer-mistake-filter-unresolved").click();
    await expect(page.getByTestId("trainer-mistake-row").first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 900 });
    await expect(page.getByTestId("trainer-filter-controls")).toBeVisible();
    await expect(page.getByTestId("trainer-session-card")).toBeVisible();
    await expect(page.getByTestId("trainer-mistake-filter-tabs")).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      .toBe(true);
  });

  test("renders source states and updates recent analyses", async ({ page }) => {
    const analyzeResponses = [hrcResponse, fallbackResponse, notSolvedResponse];
    let index = 0;

    await page.route("**/api/analyze", async (route) => {
      const payload = analyzeResponses[Math.min(index, analyzeResponses.length - 1)] ?? notSolvedResponse;
      index += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload)
      });
    });

    await page.goto("/");
    const runButton = page.getByTestId("analyze-run-button");

    await runButton.click();
    await expect(page.locator(".source-badge")).toContainText("HRC_PRECOMPUTED_DB");
    await expect(page.getByTestId("recent-analyses-list")).toBeVisible();
    await expect(page.getByTestId("recent-analyses-list")).toContainText("HRC_PRECOMPUTED_DB");
    await expect(page.getByTestId("ev-comparison-block")).toHaveCount(0);
    const hrcMultiActionDetail = page.getByTestId("analyze-multi-action-detail");
    await expect(hrcMultiActionDetail).toBeVisible();
    await expect(hrcMultiActionDetail).toContainText("Multi-action detail");
    await expect(hrcMultiActionDetail).toContainText("read-only");
    await expect(hrcMultiActionDetail).toContainText("v2 multi-action strategy");
    await expect(hrcMultiActionDetail).toContainText("multi-action-v2");
    await expect(hrcMultiActionDetail).toContainText("AA");
    await expect(hrcMultiActionDetail).toContainText("RAISE");
    await expect(hrcMultiActionDetail).toContainText("2.2bb");
    await expect(hrcMultiActionDetail).toContainText("ALL_IN");

    await runButton.click();
    await expect(page.locator(".source-badge")).toContainText("FALLBACK_ICM");
    await expect(page.getByRole("heading", { name: /^Assumptions$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Limitations" }).first()).toBeVisible();
    await expect(page.getByText(/ICM EV evaluation, not a Nash solution/i).first()).toBeVisible();
    const fallbackExplanation = page.getByTestId("fallback-explanation-block");
    await expect(fallbackExplanation).toBeVisible();
    await expect(fallbackExplanation).toContainText("fallback 결과");
    await expect(fallbackExplanation).toContainText("Nash solution이 아닙니다");
    await expect(fallbackExplanation).toContainText("제공되지 않음");
    const evComparison = page.getByTestId("ev-comparison-block");
    await expect(evComparison).toBeVisible();
    await expect(evComparison).toContainText("ChipEV vs ICM EV");
    await expect(evComparison).toContainText("제공되지 않음");
    await expect(evComparison).toContainText("새 계산이 아니라 기존 payload 표시입니다.");
    const rangePresetComparison = page.getByTestId("range-preset-comparison-block");
    await expect(rangePresetComparison).toBeVisible();
    await expect(rangePresetComparison).toContainText("Range preset 비교");
    await expect(rangePresetComparison).toContainText("입력/가정 비교");
    await expect(rangePresetComparison).toContainText("preset 이름");
    await expect(rangePresetComparison).toContainText("callRangePct");
    const sensitivity = page.getByTestId("sensitivity-summary-block");
    await expect(sensitivity).toBeVisible();
    await expect(sensitivity).toContainText("Villain Range Sensitivity");
    await expect(sensitivity).toContainText("Nash");
    const fallbackMultiActionDetail = page.getByTestId("analyze-multi-action-detail");
    await expect(fallbackMultiActionDetail).toBeVisible();
    await expect(fallbackMultiActionDetail).toContainText("FALLBACK_ICM");
    await expect(fallbackMultiActionDetail).toContainText("AA");
    await expect(sensitivity).toContainText("제공되지 않음");

    await runButton.click();
    await expect(page.locator(".source-badge")).toContainText("NOT_SOLVED");
    await expect(page.locator(".not-solved-box")).toContainText("NOT_SOLVED");
    await expect(page.getByTestId("ev-comparison-block")).toHaveCount(0);
    await expect(page.getByTestId("analyze-multi-action-detail")).toHaveCount(0);
    await expect(
      page.getByText("fallback requires one payout value per remaining player, including 0 for unpaid places").first()
    ).toBeVisible();
  });

  test("renders database filters/detail and supports Database -> Analyze", async ({ page }) => {
    await page.route("**/api/imports*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          imports: [
            {
              id: 2,
              name: "Smoke Import",
              format: "json",
              fileName: "mtt_10p_rfi_20bb.zip",
              fileHash: "smoke-hash",
              rowCount: 1,
              createdAt: "2026-06-01T04:00:00.000Z",
              databaseFeatures: null
            }
          ]
        })
      });
    });
    await page.route("**/api/solutions*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ solutions: [databaseV2SampleSolution] })
      });
    });

    await page.goto("/");
    await page.getByLabel("프리셋 이름").fill("Database Handoff Preset");
    await page.getByTestId("preset-save-button").click();
    await expect(page.getByTestId("analyze-preset-list")).toContainText("Database Handoff Preset");
    await page.getByRole("button", { name: /Database/i }).click();

    await expect(page.getByLabel("Database Hero 포지션 필터")).toBeVisible();
    await expect(page.getByLabel("Database 테이블 인원 필터")).toBeVisible();
    await expect(page.getByLabel("Database 트리 설정 필터")).toBeVisible();
    await expect(page.getByLabel("Database canonical key 검색")).toBeVisible();

    await expect(page.getByText("db-smoke-canonical-key").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Detail$/ })).toBeVisible();
    await expect(page.getByText("Spot JSON")).toBeVisible();
    await expect(page.getByText("Source metadata")).toBeVisible();
    await expect(page.getByText("Strategy Matrix")).toBeVisible();
    await expect(page.getByTestId("db-fill-analyze-button")).toBeVisible();
    await expect(page.getByTestId("db-action-sizing-summary")).toBeVisible();
    await expect(page.getByTestId("db-action-sizing-summary")).toContainText("Action / Sizing Summary");
    await expect(page.getByTestId("db-action-sizing-summary")).toContainText("이 정보는 DB에 저장된 spot/action/tree metadata에서 감지한 값입니다.");
    await expect(page.getByTestId("db-action-sizing-summary")).toContainText("DB에 없는 size를 임의 생성하지 않습니다.");
    await expect(page.getByTestId("db-action-sizing-summary")).toContainText("actionPath");
    await expect(page.getByTestId("db-action-sizing-summary")).toContainText("treeConfig");
    await expect(page.getByTestId("db-action-sizing-summary")).toContainText("sourceCount");
    const multiActionPreview = page.getByTestId("db-multi-action-preview");
    await expect(multiActionPreview).toBeVisible();
    await expect(multiActionPreview).toContainText("Multi-action preview");
    await expect(multiActionPreview).toContainText("read-only");
    await expect(multiActionPreview).toContainText("v2 multi-action strategy");
    await expect(multiActionPreview).toContainText("multi-action-v2");
    await expect(multiActionPreview).toContainText("hand");
    await expect(multiActionPreview).toContainText("frequency");
    await expect(multiActionPreview).toContainText("EV");
    await expect(multiActionPreview).toContainText("AA");
    await expect(multiActionPreview).toContainText("RAISE");
    await expect(multiActionPreview).toContainText("2.2bb");
    await expect(multiActionPreview).toContainText("ALL_IN");
    const browserV2 = page.getByTestId("db-browser-v2");
    await expect(browserV2).toBeVisible();
    await expect(browserV2).toContainText("Browser v2");
    await expect(browserV2).toContainText("Action Frequency Matrix");
    await expect(browserV2).toContainText("read-only");
    await expect(browserV2).toContainText("v2 원본 actions[]");
    await expect(page.getByLabel("Browser v2 action kind 필터")).toBeVisible();
    await expect(page.getByLabel("Browser v2 size 필터")).toBeVisible();
    await expect(page.getByLabel("Browser v2 EV 표시 방식")).toBeVisible();
    await expect(browserV2).toContainText("AA");
    await expect(browserV2).toContainText("RAISE 45%");
    await expect(browserV2).toContainText("ALL_IN 55%");
    const browserV2HandDetail = page.getByTestId("db-browser-v2-hand-detail");
    await expect(browserV2HandDetail).toContainText("Hand detail preview");
    await expect(browserV2HandDetail).toContainText("ChipEV");
    await expect(browserV2HandDetail).toContainText("ICM EV");
    await page.getByRole("button", { name: /Browser v2 hand KK/ }).click();
    await expect(browserV2HandDetail).toContainText("KK");
    await expect(browserV2HandDetail).toContainText("CALL");
    await page.getByLabel("Browser v2 EV 표시 방식").selectOption("CHIP_EV");
    await expect(browserV2).toContainText("EV display mode");
    await page.getByLabel("Browser v2 action kind 필터").selectOption("CALL");
    await expect(browserV2).toContainText("CALL 100%");
    await page.getByLabel("Browser v2 size 필터").selectOption("unknown/unspecified");
    await expect(browserV2).toContainText("사이즈 미지정");

    await page.getByTestId("db-fill-analyze-button").click();
    await expect(page.getByRole("heading", { name: "Analyze Spot" })).toBeVisible();
    await expect(page.getByText("Database에서 가져온 조건을 Analyze 폼에 채웠습니다")).toBeVisible();
    await expect(page.getByTestId("analyze-handoff-context")).toContainText("Database에서 가져온 Analyze 조건입니다.");
    await expect(page.getByTestId("analyze-handoff-context")).toContainText("자동 분석은 수행하지 않습니다.");
    await page.getByTestId("analyze-handoff-reset-button").click();
    await expect(page.getByText("전달 context 안내를 초기화했습니다")).toBeVisible();
    await expect(page.getByTestId("analyze-preset-list")).toContainText("Database Handoff Preset");
  });

  test("renders report missing fallback state", async ({ page }) => {
    await page.route("**/api/reports/latest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          importReport: {
            status: "missing",
            fileName: "latest-import-report.json",
            generatedAt: null,
            error: null,
            summary: null
          },
          verificationReport: {
            status: "missing",
            fileName: "latest-verification-report.json",
            generatedAt: null,
            error: null,
            summary: null
          },
          canonicalKeyReport: {
            status: "missing",
            fileName: "latest-canonical-key-report.json",
            generatedAt: null,
            error: null,
            summary: null
          }
        })
      });
    });
    await page.route("**/api/db/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          totalSolutions: 0,
          totalStrategyEntries: 0,
          distinctCanonicalKeys: 0,
          duplicateCanonicalKeyCount: 0,
          latestImportStatus: "missing",
          latestVerificationStatus: "missing",
          latestCanonicalKeyReportStatus: "missing",
          exactLookup: { success: null, total: null, successRatePct: null },
          randomLookup: { success: null, total: null, successRatePct: null },
          nearMatchFalsePositiveCount: null,
          discardedHrczCount: null,
          skippedFileCount: null,
          failedRecordCount: null,
          canonicalKey: { mismatchCount: null, updatedCount: null, collisionCount: null, invalidCount: null }
        })
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /Import/i }).click();
    await expect(page.getByTestId("db-health-summary-card")).toBeVisible();
    await expect(page.getByTestId("import-report-summary-card")).toBeVisible();
    await expect(page.getByText("latest-import-report.json")).toBeVisible();
    await expect(page.getByText("latest-verification-report.json")).toBeVisible();
    await expect(page.getByText("latest-canonical-key-report.json")).toBeVisible();
  });
});

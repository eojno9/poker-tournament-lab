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

test.describe("v1.2 smoke", () => {
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
        body: JSON.stringify({ solutions: [databaseSampleSolution] })
      });
    });

    await page.goto("/");
    const tabs = page.locator("nav.tabs");
    await expect(tabs.getByRole("button", { name: "Analyze", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: /Trainer/i })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Import", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Database", exact: true })).toBeVisible();
    await expect(page.getByLabel("remaining players")).toBeVisible();
    await expect(page.getByLabel("hero position")).toBeVisible();
    await expect(page.getByLabel("preset name")).toBeVisible();
    await expect(page.getByTestId("recent-analyses-empty")).toBeVisible();
    await expect(page.getByTestId("preset-save-button")).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-selector")).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-selector")).toContainText("DB에 실제 존재하는 action/size 후보만 표시합니다.");
    await expect(page.getByTestId("analyze-action-sizing-selector")).toContainText("자동 분석하지 않습니다.");
    await expect(page.getByTestId("analyze-action-sizing-empty")).toBeVisible();

    await page.getByLabel("hero position").selectOption("BTN");
    await expect(page.getByTestId("analyze-action-sizing-candidate").first()).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-warning")).toBeVisible();
    await page.getByTestId("analyze-action-sizing-candidate").first().click();
    await expect(page.getByTestId("analyze-action-sizing-selected")).toBeVisible();
    await expect(page.getByTestId("analyze-action-sizing-selected")).toContainText("선택된 action");

    await page.getByLabel("preset name").fill("Smoke Preset");
    await page.getByTestId("preset-save-button").click();
    await expect(page.getByTestId("analyze-preset-list")).toBeVisible();
    await expect(page.getByTestId("analyze-preset-list")).toContainText("Smoke Preset");

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

    await expect(page.getByRole("heading", { name: /^Trainer$/ })).toBeVisible();
    await expect(page.getByTestId("trainer-filter-controls")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-hero-position")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-table-size")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-tree-config")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-source-file")).toBeVisible();
    await expect(page.getByTestId("trainer-hand-input")).toBeVisible();
    await expect(page.getByTestId("trainer-seed-input")).toBeVisible();
    await expect(page.getByTestId("trainer-filter-reset-button")).toBeVisible();
    await expect(page.getByTestId("trainer-candidate-count")).toContainText("후보 문제");
    await expect(page.getByTestId("trainer-summary-card")).toBeVisible();
    await expect(page.getByTestId("trainer-summary-card")).toContainText("아직 Trainer 기록이 없습니다.");
    await expect(page.getByTestId("trainer-problem-card")).toBeVisible();
    await expect(page.getByText("오프테이블 학습용 문제입니다")).toBeVisible();
    await expect(page.getByTestId("trainer-problem-card")).toContainText("HRC_PRECOMPUTED_DB");
    await expect(page.getByTestId("trainer-shove-button")).toBeVisible();
    await expect(page.getByTestId("trainer-fold-button")).toBeVisible();
    await expect(page.getByTestId("trainer-recent-section")).toBeVisible();
    await expect(page.getByTestId("trainer-mistakes-section")).toBeVisible();
    await expect(page.getByTestId("trainer-clear-recent-button")).toBeVisible();
    await expect(page.getByTestId("trainer-clear-mistakes-button")).toBeVisible();

    await page.getByTestId("trainer-shove-button").click();
    await expect(page.getByTestId("trainer-result-card")).toBeVisible();
    await expect(page.getByTestId("trainer-result-card")).toContainText("선택한 action");
    await expect(page.getByTestId("trainer-result-card")).toContainText("정답 action");
    await expect(page.getByTestId("trainer-recent-list")).toBeVisible();
    await expect(page.getByTestId("trainer-recent-row")).toHaveCount(1);
    await expect(page.getByTestId("trainer-summary-total-attempts")).toContainText("1");
    await expect(page.getByTestId("trainer-summary-accuracy")).toContainText("%");

    await page.getByTestId("trainer-fold-button").click();
    await expect(page.getByTestId("trainer-mistakes-list")).toBeVisible();
    await expect(page.getByTestId("trainer-mistake-row").first()).toBeVisible();
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
    await expect(rangePresetComparison).toContainText("Range preset comparison");
    await expect(rangePresetComparison).toContainText("입력/가정 비교");
    await expect(rangePresetComparison).toContainText("presetName");
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
    await page.getByRole("button", { name: /Database/i }).click();

    await expect(page.getByLabel("db hero position filter")).toBeVisible();
    await expect(page.getByLabel("db table size filter")).toBeVisible();
    await expect(page.getByLabel("db tree config filter")).toBeVisible();
    await expect(page.getByLabel("db canonical key search")).toBeVisible();

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
    await expect(page.getByLabel("browser v2 action kind filter")).toBeVisible();
    await expect(page.getByLabel("browser v2 size filter")).toBeVisible();
    await expect(page.getByLabel("browser v2 EV display mode")).toBeVisible();
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
    await page.getByLabel("browser v2 EV display mode").selectOption("CHIP_EV");
    await expect(browserV2).toContainText("EV display mode");
    await page.getByLabel("browser v2 action kind filter").selectOption("CALL");
    await expect(browserV2).toContainText("CALL 100%");
    await page.getByLabel("browser v2 size filter").selectOption("unknown/unspecified");
    await expect(browserV2).toContainText("사이즈 미지정");

    await page.getByTestId("db-fill-analyze-button").click();
    await expect(page.getByRole("heading", { name: "Analyze Spot" })).toBeVisible();
    await expect(page.getByText("Database spot을 Analyze 폼에 채웠습니다")).toBeVisible();
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

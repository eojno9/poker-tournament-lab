import { expect, test } from "@playwright/test";

const hrcResponse = {
  source: "HRC_PRECOMPUTED_DB",
  sourceLabel: "HRC precomputed DB",
  canonicalKey: "smoke-hrc-key",
  assumptions: ["Input spot canonical key exactly matches the imported DB record."],
  limitations: ["Near match is not treated as solved."],
  strategy: {
    AA: { action: "SHOVE", frequency: 1, evPush: 1.2, evFold: 0.6 }
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
    foldEv: 0.33,
    deltaEv: 0.58,
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
      exactLookup: { success: 262, total: 262, successRatePct: 100 },
      randomLookup: { success: 20, total: 20, successRatePct: 100 },
      duplicateCanonicalKeyCount: 0,
      nearMatchFalsePositiveCount: 0
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

test.describe("v1.1 smoke", () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test("renders Analyze / Import / Database tabs and import report summary cards", async ({ page }) => {
    await page.goto("/");
    const tabs = page.locator("nav.tabs");
    await expect(tabs.getByRole("button", { name: "Analyze", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Import", exact: true })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Database", exact: true })).toBeVisible();
    await expect(page.getByLabel("remaining players")).toBeVisible();
    await expect(page.getByLabel("hero position")).toBeVisible();

    await tabs.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByRole("heading", { name: /HRC DB Import/i })).toBeVisible();
    await expect(page.getByTestId("import-report-summary-card")).toBeVisible();
    await expect(page.getByTestId("verification-report-summary-card")).toBeVisible();
    await expect(page.getByTestId("canonical-report-summary-card")).toBeVisible();
    await expect(page.getByText("latest-import-report.json")).toBeVisible();
    await expect(page.getByText("latest-verification-report.json")).toBeVisible();
    await expect(page.getByText("latest-canonical-key-report.json")).toBeVisible();

    await tabs.getByRole("button", { name: "Database", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Imports$/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Solutions$/ })).toBeVisible();

    const hasHangul = await page.locator("body").evaluate((el) => /[가-힣]/.test(el.innerText));
    expect(hasHangul).toBeTruthy();
  });

  test("renders source badges and key result states", async ({ page }) => {
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
    const runButton = page.locator("button.primary-action");

    await runButton.click();
    await expect(page.locator(".source-badge")).toContainText("HRC_PRECOMPUTED_DB");
    await expect(page.getByText("HRC 사전 계산 DB 정확 매칭")).toBeVisible();

    await runButton.click();
    await expect(page.locator(".source-badge")).toContainText("FALLBACK_ICM");
    await expect(page.getByText("Fallback ICM EV 평가")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assumptions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
    await expect(page.getByText(/ICM EV evaluation, not a Nash solution/i).first()).toBeVisible();

    await runButton.click();
    await expect(page.locator(".source-badge")).toContainText("NOT_SOLVED");
    await expect(page.getByText("분석 불가 / 지원 범위 밖")).toBeVisible();
    await expect(page.locator(".not-solved-box")).toContainText("NOT_SOLVED");
    await expect(
      page.getByText("fallback requires one payout value per remaining player, including 0 for unpaid places").first()
    ).toBeVisible();
  });

  test("renders database filters and detail panel", async ({ page }) => {
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
        body: JSON.stringify({ solutions: [databaseSampleSolution] })
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

    await page.goto("/");
    await page.getByRole("button", { name: /Import/i }).click();
    await expect(page.getByTestId("import-report-summary-card")).toBeVisible();
    await expect(page.getByText("latest-import-report.json")).toBeVisible();
    await expect(page.getByText("latest-verification-report.json")).toBeVisible();
    await expect(page.getByText("latest-canonical-key-report.json")).toBeVisible();
  });
});

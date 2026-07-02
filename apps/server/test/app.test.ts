import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HAND_KEYS, RESULT_SOURCES, type AnalyzeResult, type SpotInput } from "@poker-tournament-lab/core";
import { createApp } from "../src/app.js";
import { LabDatabase } from "../src/db.js";

const spot: SpotInput = {
  gameType: "NLHE_MTT",
  tournamentType: "REGULAR",
  decisionType: "PUSH_FOLD",
  street: "PREFLOP",
  tableSize: 3,
  heroSeat: 1,
  heroPosition: "BTN",
  potBb: 1.8,
  blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
  players: [
    { seat: 1, position: "BTN", stackBb: 10, inHand: true, isHero: true },
    { seat: 2, position: "SB", stackBb: 12, inHand: true, rangePreset: "standard", callRangePct: 16 },
    { seat: 3, position: "BB", stackBb: 14, inHand: true, rangePreset: "tight", callRangePct: 10 }
  ],
  payouts: [500, 300, 0],
  actionPath: ["HERO_DECISION"]
};

const fullStrategy = Object.fromEntries(HAND_KEYS.map((hand) => [hand, { action: "FOLD", frequency: 0 }]));
const fullStrategyShove = Object.fromEntries(HAND_KEYS.map((hand) => [hand, { action: "SHOVE", frequency: 1 }]));
const __dirname = dirname(fileURLToPath(import.meta.url));
const multiActionV2Fixture = readFileSync(
  join(__dirname, "..", "..", "..", "packages", "core", "test", "fixtures", "multi-action-import-v2.sample.json"),
  "utf8"
);

describe("API source routing", () => {
  let database: LabDatabase;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "ptl-"));
    database = new LabDatabase(join(dir, "test.db"));
    const server = createApp(database).listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to start test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
  });

  afterEach(async () => {
    await closeServer();
    database.close();
  });

  it("returns HRC_PRECOMPUTED_DB only for exact imported DB hits", async () => {
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "unit import",
      fileName: "MTT_10P_RFI_20BB_LIMP9_OPEN_9_3BET1_4BET1_DEPTH_5.zip",
      content: JSON.stringify([{ spot, strategy: { AA: 1 }, sourceLabel: "unit HRC" }])
    });

    const exact = await post<AnalyzeResult>("/api/analyze", { spot });
    expect(exact.source).toEqual(RESULT_SOURCES.HRC_PRECOMPUTED_DB);
    expect(exact.strategy?.AA?.action).toEqual("SHOVE");
    expect(exact.metadata?.databaseFeatures).toMatchObject({ preflopOnly: true, playerCount: 10, stackDepthBb: 20 });

    const near = await post<AnalyzeResult>("/api/analyze", {
      spot: { ...spot, potBb: 1.9 },
      villainRanges: [{ seat: 2, callRangePct: 18.5 }],
      fallbackOptions: { equitySamples: 20 }
    });
    expect(near.source).toEqual(RESULT_SOURCES.FALLBACK_ICM);
    expect(Object.keys(near.strategy ?? {})).toHaveLength(HAND_KEYS.length);
    expect(near.fallbackMetadata?.villainRanges.find((entry) => entry.seat === 2)).toMatchObject({
      presetName: "custom",
      editedByUser: true,
      rangeSource: "user_override"
    });
  });

  it("returns NOT_SOLVED instead of guessing when fallback requirements are incomplete", async () => {
    const result = await post<AnalyzeResult>("/api/analyze", {
      spot: { ...spot, payouts: [500, 300] }
    });

    expect(result.source).toEqual(RESULT_SOURCES.NOT_SOLVED);
    expect(result.strategy).toBeNull();
  });

  it("keeps one stored solution per exact canonical key", async () => {
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "first import",
      content: JSON.stringify([{ spot, strategy: { AA: 1 }, sourceLabel: "first HRC" }])
    });
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "second import",
      content: JSON.stringify([{ spot, strategy: { AA: 0 }, sourceLabel: "second HRC" }])
    });

    const listed = await get<{ solutions: Array<{ canonicalKey: string; sourceLabel: string }> }>("/api/solutions");
    expect(listed.solutions).toHaveLength(1);
    expect(listed.solutions[0]?.sourceLabel).toEqual("second HRC");
  });

  it("returns read-only DB health summary counts", async () => {
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "health import",
      content: JSON.stringify([{ spot, strategy: { AA: 1 }, sourceLabel: "health HRC" }])
    });

    const health = await get<{
      totalSolutions: number;
      totalStrategyEntries: number;
      distinctCanonicalKeys: number;
      duplicateCanonicalKeyCount: number;
      latestImportStatus: string;
      latestVerificationStatus: string;
      latestCanonicalKeyReportStatus: string;
    }>("/api/db/health");

    expect(health.totalSolutions).toEqual(1);
    expect(health.totalStrategyEntries).toEqual(169);
    expect(health.distinctCanonicalKeys).toEqual(1);
    expect(health.duplicateCanonicalKeyCount).toEqual(0);
    expect(["available", "missing", "invalid"]).toContain(health.latestImportStatus);
    expect(["available", "missing", "invalid"]).toContain(health.latestVerificationStatus);
    expect(["available", "missing", "invalid"]).toContain(health.latestCanonicalKeyReportStatus);
  });

  it("returns missing DB health report statuses when report files are absent", async () => {
    const previousCwd = process.cwd();
    const isolatedCwd = mkdtempSync(join(tmpdir(), "ptl-cwd-"));
    process.chdir(isolatedCwd);
    try {
      const health = await get<{
        latestImportStatus: string;
        latestVerificationStatus: string;
        latestCanonicalKeyReportStatus: string;
      }>("/api/db/health");
      expect(health.latestImportStatus).toEqual("missing");
      expect(health.latestVerificationStatus).toEqual("missing");
      expect(health.latestCanonicalKeyReportStatus).toEqual("missing");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("validates normalized JSON payload as PASS", async () => {
    const result = await post<{
      status: string;
      totalRows: number;
      failedRows: number;
      duplicateCanonicalKeyCount: number;
      errorCount: number;
      warningCount: number;
    }>("/api/imports/validate", {
      format: "json",
      content: JSON.stringify([{ spot, strategy: fullStrategy }])
    });

    expect(result.status).toEqual("PASS");
    expect(result.totalRows).toEqual(1);
    expect(result.failedRows).toEqual(0);
    expect(result.duplicateCanonicalKeyCount).toEqual(0);
    expect(result.errorCount).toEqual(0);
    expect(result.warningCount).toEqual(0);
  });

  it("validates normalized CSV payload as PASS", async () => {
    const csv = [
      "spot_json,strategy_json",
      `"${JSON.stringify(spot).replace(/"/g, "\"\"")}","${JSON.stringify(fullStrategy).replace(/"/g, "\"\"")}"`
    ].join("\n");

    const result = await post<{ status: string; totalRows: number; errorCount: number; warningCount: number }>(
      "/api/imports/validate",
      {
        format: "csv",
        content: csv
      }
    );
    expect(result.status).toEqual("PASS");
    expect(result.totalRows).toEqual(1);
    expect(result.errorCount).toEqual(0);
    expect(result.warningCount).toEqual(0);
  });

  it("fails validation on missing required spot fields", async () => {
    const badSpot = { ...spot };
    delete (badSpot as Partial<SpotInput>).heroPosition;
    const result = await post<{
      status: string;
      errorCount: number;
      issues: Array<{ code: string; field: string | null }>;
    }>("/api/imports/validate", {
      format: "json",
      content: JSON.stringify([{ spot: badSpot, strategy: fullStrategy }])
    });

    expect(result.status).toEqual("FAIL");
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.code === "MISSING_REQUIRED_FIELD" && issue.field === "spot.heroPosition")).toBe(true);
  });

  it("warns when strategy hand count is not 169", async () => {
    const result = await post<{
      status: string;
      errorCount: number;
      warningCount: number;
      issues: Array<{ code: string }>;
    }>("/api/imports/validate", {
      format: "json",
      content: JSON.stringify([{ spot, strategy: { AA: 1 } }])
    });

    expect(result.status).toEqual("WARN");
    expect(result.errorCount).toEqual(0);
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.code === "STRATEGY_COUNT_NOT_169")).toBe(true);
  });

  it("fails when strategy frequency is out of range", async () => {
    const invalidStrategy = { ...fullStrategy, AA: { action: "SHOVE", frequency: 1.2 } };
    const result = await post<{
      status: string;
      errorCount: number;
      issues: Array<{ code: string; field: string | null }>;
    }>("/api/imports/validate", {
      format: "json",
      content: JSON.stringify([{ spot, strategy: invalidStrategy }])
    });

    expect(result.status).toEqual("FAIL");
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.code === "INVALID_FREQUENCY_RANGE" && issue.field?.includes("AA"))).toBe(true);
  });

  it("shows duplicate canonical key preview for duplicate spots", async () => {
    const result = await post<{
      status: string;
      duplicateCanonicalKeyCount: number;
      duplicateCanonicalKeyPreview: Array<{ count: number; rowNumbers: number[] }>;
    }>("/api/imports/validate", {
      format: "json",
      content: JSON.stringify([
        { spot, strategy: fullStrategy },
        { spot, strategy: fullStrategyShove }
      ])
    });

    expect(result.status).toEqual("WARN");
    expect(result.duplicateCanonicalKeyCount).toEqual(1);
    expect(result.duplicateCanonicalKeyPreview).toHaveLength(1);
    expect(result.duplicateCanonicalKeyPreview[0]?.count).toEqual(2);
    expect(result.duplicateCanonicalKeyPreview[0]?.rowNumbers).toEqual([1, 2]);
  });

  it("validates multi-action v2 payloads as dry-run without writing DB rows", async () => {
    const result = await post<{
      status: string;
      schemaVersion: string;
      multiActionStrategyCount: number;
      multiActionHandCount: number;
      actionCount: number;
      warningCount: number;
      errorCount: number;
    }>("/api/imports/validate", {
      format: "json",
      content: multiActionV2Fixture
    });

    expect(result.status).toEqual("PASS");
    expect(result.schemaVersion).toEqual("multi-action-v2");
    expect(result.multiActionStrategyCount).toEqual(1);
    expect(result.multiActionHandCount).toEqual(1);
    expect(result.actionCount).toEqual(3);
    expect(result.warningCount).toEqual(0);
    expect(result.errorCount).toEqual(0);
    expect(database.getHealthCounts().totalSolutions).toEqual(0);
  });

  it("returns v2 validation issues for invalid multi-action payloads", async () => {
    const payload = JSON.parse(multiActionV2Fixture) as {
      strategy: { AKs: { actions: Array<{ frequency: number }> } };
    };
    payload.strategy.AKs.actions[0]!.frequency = -0.2;

    const result = await post<{
      status: string;
      schemaVersion: string;
      multiActionInvalidCount: number;
      issues: Array<{ code: string; field: string | null; message: string }>;
    }>("/api/imports/validate", {
      format: "json",
      content: JSON.stringify(payload)
    });

    expect(result.status).toEqual("FAIL");
    expect(result.schemaVersion).toEqual("multi-action-v2");
    expect(result.multiActionInvalidCount).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.code === "MULTI_ACTION_V2_INVALID" && issue.field?.includes("frequency"))).toBe(true);
    expect(database.getHealthCounts().totalSolutions).toEqual(0);
  });

  it("imports and stores multi-action v2 strategies without DB schema migration", async () => {
    const result = await post<{
      import: {
        rowCount: number;
        schemaVersion: string;
        multiActionStrategyCount: number;
        multiActionHandCount: number;
        multiActionActionCount: number;
      };
      canonicalKeys: string[];
    }>("/api/imports/hrc", {
      format: "json",
      sourceLabel: "v2 import",
      content: multiActionV2Fixture
    });

    expect(result.import.rowCount).toEqual(1);
    expect(result.import.schemaVersion).toEqual("multi-action-v2");
    expect(result.import.multiActionStrategyCount).toEqual(1);
    expect(result.import.multiActionHandCount).toEqual(2);
    expect(result.import.multiActionActionCount).toEqual(3);
    expect(result.canonicalKeys).toHaveLength(1);

    const listed = await get<{
      solutions: Array<{
        sourceLabel: string;
        strategy: {
          AKs?: { actions?: Array<{ action: string; frequency: number; ev: number | null }> };
        };
      }>;
    }>("/api/solutions");
    expect(listed.solutions).toHaveLength(1);
    expect(listed.solutions[0]?.sourceLabel).toEqual("v2 import");
    expect(listed.solutions[0]?.strategy.AKs?.actions).toHaveLength(2);
    expect(listed.solutions[0]?.strategy.AKs?.actions?.[0]).toMatchObject({
      action: "RAISE",
      frequency: 0.55,
      ev: 0.18
    });
    expect(database.getHealthCounts().totalSolutions).toEqual(1);
  });

  it("rejects invalid multi-action v2 imports before writing DB rows", async () => {
    const payload = JSON.parse(multiActionV2Fixture) as {
      strategy: { AKs: { actions: Array<{ frequency: number }> } };
    };
    payload.strategy.AKs.actions[0]!.frequency = 1.2;

    const response = await fetch(`${baseUrl}/api/imports/hrc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format: "json", content: JSON.stringify(payload) })
    });
    const body = (await response.json()) as {
      error: string;
      validation: { schemaVersion: string; issues: Array<{ code: string; field: string | null }> };
    };

    expect(response.status).toEqual(400);
    expect(body.error).toEqual("multi-action v2 validation failed");
    expect(body.validation.schemaVersion).toEqual("multi-action-v2");
    expect(body.validation.issues.some((issue) => issue.code === "MULTI_ACTION_V2_INVALID" && issue.field?.includes("frequency"))).toBe(true);
    expect(database.getHealthCounts().totalSolutions).toEqual(0);
  });

  it("returns same canonical key when spots are equivalent", async () => {
    const reordered = {
      ...spot,
      players: [...spot.players].reverse()
    };
    const result = await post<{
      sameCanonicalKey: boolean;
      differences: Array<{ field: string }>;
    }>("/api/canonical-key/diff", {
      left: spot,
      right: reordered
    });

    expect(result.sameCanonicalKey).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  it("returns field-level differences when canonical key differs", async () => {
    const modified = {
      ...spot,
      blinds: { ...spot.blinds, anteBb: 0.2 },
      players: spot.players.map((player) => (player.seat === 1 ? { ...player, stackBb: 11 } : player))
    };
    const result = await post<{
      sameCanonicalKey: boolean;
      differences: Array<{ field: string }>;
      explanation: string[];
    }>("/api/canonical-key/diff", {
      left: spot,
      right: { spot: modified, treeConfig: "open_shove_only" }
    });

    expect(result.sameCanonicalKey).toBe(false);
    expect(result.differences.some((item) => item.field === "ante")).toBe(true);
    expect(result.differences.some((item) => item.field.startsWith("stacks."))).toBe(true);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  async function post<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as T;
  }

  async function get<T = unknown>(path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as T;
  }
});

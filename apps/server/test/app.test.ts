import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

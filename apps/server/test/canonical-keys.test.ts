import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RESULT_SOURCES, stableStringify, type AnalyzeResult, type SpotInput } from "@poker-tournament-lab/core";
import { createApp } from "../src/app.js";
import { LabDatabase } from "../src/db.js";

const spotA: SpotInput = {
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

const spotB: SpotInput = {
  ...spotA,
  potBb: 2.1,
  actionPath: ["BTN_OPEN_2.1", "SB_DECISION"]
};

describe("canonical key reconciliation", () => {
  let database: LabDatabase;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "ptl-canonical-"));
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

  it("repairs legacy canonical keys and restores exact lookup", async () => {
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "legacy-key-case",
      content: JSON.stringify([{ spot: spotA, strategy: { AA: 1 } }])
    });

    const [stored] = await getSolutions();
    if (!stored) {
      throw new Error("expected one stored solution");
    }

    const keyObject = JSON.parse(stored.canonicalKey) as Record<string, unknown>;
    delete keyObject.street;
    const legacyKey = stableStringify(keyObject);
    rawDb()
      .prepare("UPDATE solutions SET canonical_key = ? WHERE id = ?")
      .run(legacyKey, stored.id);

    const before = await post<AnalyzeResult>("/api/analyze", { spot: spotA });
    expect(before.source).toEqual(RESULT_SOURCES.FALLBACK_ICM);

    const dryRun = database.reconcileCanonicalKeys({ apply: false });
    expect(dryRun.mismatchCount).toEqual(1);
    expect(dryRun.collisionCount).toEqual(0);
    expect(dryRun.updatesApplied).toEqual(0);
    expect(dryRun.entries[0]).toMatchObject({
      solutionId: stored.id,
      storedCanonicalKey: legacyKey,
      outcome: "MISMATCH"
    });

    const applied = database.reconcileCanonicalKeys({ apply: true });
    expect(applied.blocked).toBe(false);
    expect(applied.updatesApplied).toEqual(1);
    expect(applied.entries[0]).toMatchObject({
      solutionId: stored.id,
      storedCanonicalKey: legacyKey,
      outcome: "UPDATED"
    });

    const after = await post<AnalyzeResult>("/api/analyze", { spot: spotA });
    expect(after.source).toEqual(RESULT_SOURCES.HRC_PRECOMPUTED_DB);
  });

  it("does not update when recomputed key collides with another row", async () => {
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "spot-a",
      content: JSON.stringify([{ spot: spotA, strategy: { AA: 1 }, externalId: "spot-a" }])
    });
    await post("/api/imports/hrc", {
      format: "json",
      sourceLabel: "spot-b",
      content: JSON.stringify([{ spot: spotB, strategy: { KK: 1 }, externalId: "spot-b" }])
    });

    const solutions = await getSolutions();
    const rowA = solutions.find((solution) => solution.externalId === "spot-a");
    const rowB = solutions.find((solution) => solution.externalId === "spot-b");
    if (!rowA || !rowB) {
      throw new Error("expected both rows");
    }

    rawDb()
      .prepare("UPDATE solutions SET spot_json = ? WHERE id = ?")
      .run(JSON.stringify(spotB), rowA.id);

    const report = database.reconcileCanonicalKeys({ apply: true });
    expect(report.blocked).toBe(true);
    expect(report.updatesApplied).toEqual(0);
    expect(report.collisionCount).toBeGreaterThan(0);
    expect(report.entries.some((entry) => entry.outcome === "COLLISION" && entry.solutionId === rowA.id)).toBe(true);

    const stillStored = rawDb()
      .prepare("SELECT canonical_key AS canonicalKey FROM solutions WHERE id = ?")
      .get(rowA.id) as { canonicalKey: string };
    expect(stillStored.canonicalKey).toEqual(rowA.canonicalKey);
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

  async function getSolutions(): Promise<Array<{ id: number; canonicalKey: string; externalId: string | null }>> {
    const response = await fetch(`${baseUrl}/api/solutions?limit=200`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const payload = (await response.json()) as {
      solutions: Array<{ id: number; canonicalKey: string; externalId: string | null }>;
    };
    return payload.solutions;
  }

  function rawDb(): {
    prepare: (sql: string) => {
      run: (...args: unknown[]) => unknown;
      get: (...args: unknown[]) => unknown;
    };
  } {
    return (database as unknown as { db: { prepare: (sql: string) => unknown } }).db as {
      prepare: (sql: string) => {
        run: (...args: unknown[]) => unknown;
        get: (...args: unknown[]) => unknown;
      };
    };
  }
});

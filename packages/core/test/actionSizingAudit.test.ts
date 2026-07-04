import { describe, expect, it } from "vitest";
import { buildActionSizingAudit, canonicalSpotKey, type SpotInput } from "../src/index.js";

const baseSpot: SpotInput = {
  gameType: "NLHE_MTT",
  tournamentType: "REGULAR",
  decisionType: "PUSH_FOLD",
  street: "PREFLOP",
  tableSize: 6,
  heroSeat: 6,
  heroPosition: "BTN",
  potBb: 1.5,
  blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
  players: [
    { seat: 1, position: "UTG", stackBb: 16, inHand: true },
    { seat: 2, position: "HJ", stackBb: 15, inHand: true },
    { seat: 3, position: "CO", stackBb: 13, inHand: true },
    { seat: 4, position: "BTN", stackBb: 12, inHand: true, isHero: true },
    { seat: 5, position: "SB", stackBb: 10, inHand: true },
    { seat: 6, position: "BB", stackBb: 11, inHand: true }
  ],
  payouts: [0.5, 0.3, 0.2, 0, 0, 0],
  actionPath: ["FOLD", "FOLD", "HERO_DECISION"]
};

describe("action sizing audit", () => {
  it("confirms actionPath differences affect canonical key", () => {
    const modifiedSpot: SpotInput = {
      ...baseSpot,
      actionPath: ["FOLD", "OPEN_2.2BB", "HERO_DECISION"]
    };
    expect(canonicalSpotKey(baseSpot)).not.toEqual(canonicalSpotKey(modifiedSpot));
  });

  it("reports treeConfig canonical key gap as risk", () => {
    const report = buildActionSizingAudit({
      spot: baseSpot,
      treeConfig: "OPEN_2.2BB_ONLY"
    });
    expect(report.canonicalSensitivity.treeConfigAffectsCanonicalKey).toBe(false);
    expect(report.risks).toContain("treeConfig differences are not represented in canonical key");
  });

  it("captures size token differences in actionPath as key-affecting", () => {
    const report = buildActionSizingAudit({
      spot: {
        ...baseSpot,
        actionPath: ["OPEN_2.2BB", "HERO_DECISION"]
      },
      treeConfig: "OPEN_SHOVE_ONLY"
    });
    expect(report.canonicalSensitivity.sizeTokenInActionPathAffectsCanonicalKey).toBe(true);
  });

  it("reports risk when size signal is missing", () => {
    const report = buildActionSizingAudit({
      spot: baseSpot,
      treeConfig: "UNKNOWN_TREE"
    });
    expect(report.sizeSignals).toHaveLength(0);
    expect(report.risks).toContain(
      "size-related signal was not found in explicit fields/actionPath/treeConfig/source metadata"
    );
  });

  it("extracts explicit size fields when present in spot payload", () => {
    const enriched = {
      ...baseSpot,
      actionPath: ["OPEN_2.2BB", "HERO_DECISION"],
      raiseSizeBb: 2.2
    } as SpotInput & { raiseSizeBb: number };

    const report = buildActionSizingAudit({
      spot: enriched,
      treeConfig: "OPEN_2.2BB_ONLY",
      sourceMetadata: { openSizeBb: 2.2 }
    });

    expect(report.explicitSizeFieldPaths).toContain("raiseSizeBb");
    expect(report.sizeSignals.some((signal) => signal.valueBb === 2.2)).toBe(true);
  });
});

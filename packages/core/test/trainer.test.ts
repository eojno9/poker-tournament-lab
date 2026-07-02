import { describe, expect, it } from "vitest";
import {
  RESULT_SOURCES,
  buildTrainerProblemFromSolution,
  gradeTrainerAnswer,
  type SpotInput,
  type StrategyMatrix,
  type TrainerProblemSourceSolution
} from "../src/index.js";

const baseSpot: SpotInput = {
  gameType: "NLHE_MTT",
  tournamentType: "REGULAR",
  decisionType: "PUSH_FOLD",
  street: "PREFLOP",
  tableSize: 6,
  heroSeat: 1,
  heroPosition: "BTN",
  potBb: 1.5,
  blinds: { smallBb: 0.5, bigBb: 1, anteBb: 0.1 },
  players: [
    { seat: 1, position: "BTN", stackBb: 10, inHand: true, isHero: true },
    { seat: 2, position: "SB", stackBb: 8.5, inHand: true },
    { seat: 3, position: "BB", stackBb: 12, inHand: true },
    { seat: 4, position: "UTG", stackBb: 18, inHand: false },
    { seat: 5, position: "MP", stackBb: 16, inHand: false },
    { seat: 6, position: "CO", stackBb: 14, inHand: false }
  ],
  payouts: [100, 60, 40, 0, 0, 0],
  actionPath: ["FOLD", "FOLD", "HERO_DECISION"]
};

function buildSolution(
  source: TrainerProblemSourceSolution["source"],
  strategy: StrategyMatrix
): TrainerProblemSourceSolution {
  return {
    source,
    spot: baseSpot,
    strategy
  };
}

describe("trainer problem adapter", () => {
  it("builds a trainer problem from HRC_PRECOMPUTED_DB solution", () => {
    const solution = buildSolution(RESULT_SOURCES.HRC_PRECOMPUTED_DB, {
      K8s: { action: "SHOVE", frequency: 0.45, evPush: 0.01 }
    } as unknown as StrategyMatrix);

    const result = buildTrainerProblemFromSolution(solution, { hand: "K8s" });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.problem.source).toBe(RESULT_SOURCES.HRC_PRECOMPUTED_DB);
    expect(result.problem.hand).toBe("K8s");
    expect(result.problem.correctAction).toBe("SHOVE");
    expect(result.problem.frequency).toBe(0.45);
    expect(result.problem.ev).toBe(0.01);
  });

  it("rejects FALLBACK_ICM source", () => {
    const solution = buildSolution(RESULT_SOURCES.FALLBACK_ICM, {
      AA: { action: "SHOVE", frequency: 1 }
    } as unknown as StrategyMatrix);

    const result = buildTrainerProblemFromSolution(solution, { hand: "AA" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
  });

  it("rejects NOT_SOLVED source", () => {
    const solution = buildSolution(RESULT_SOURCES.NOT_SOLVED, {
      AA: { action: "SHOVE", frequency: 1 }
    } as unknown as StrategyMatrix);

    const result = buildTrainerProblemFromSolution(solution, { hand: "AA" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("UNSUPPORTED_SOURCE");
  });

  it("fails when requested hand is missing in strategy", () => {
    const solution = buildSolution(RESULT_SOURCES.HRC_PRECOMPUTED_DB, {
      AA: { action: "SHOVE", frequency: 1 }
    } as unknown as StrategyMatrix);

    const result = buildTrainerProblemFromSolution(solution, { hand: "K8s" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("HAND_NOT_FOUND");
  });

  it("grades SHOVE answers correctly", () => {
    const built = buildTrainerProblemFromSolution(
      buildSolution(RESULT_SOURCES.HRC_PRECOMPUTED_DB, {
        AKo: { action: "SHOVE", frequency: 1, evPush: 0.2 }
      } as unknown as StrategyMatrix),
      { hand: "AKo" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const grade = gradeTrainerAnswer(built.problem, "SHOVE");
    expect(grade.isCorrect).toBe(true);
    expect(grade.correctAction).toBe("SHOVE");
  });

  it("grades FOLD answers correctly", () => {
    const built = buildTrainerProblemFromSolution(
      buildSolution(RESULT_SOURCES.HRC_PRECOMPUTED_DB, {
        T4o: { action: "FOLD", frequency: 1, evFold: -0.03 }
      } as unknown as StrategyMatrix),
      { hand: "T4o" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }

    const grade = gradeTrainerAnswer(built.problem, "FOLD");
    expect(grade.isCorrect).toBe(true);
    expect(grade.correctAction).toBe("FOLD");
  });

  it("preserves mixed frequency values from strategy entry", () => {
    const built = buildTrainerProblemFromSolution(
      buildSolution(RESULT_SOURCES.HRC_PRECOMPUTED_DB, {
        Q9s: { action: "SHOVE", frequency: 0.33, evPush: 0.004 }
      } as unknown as StrategyMatrix),
      { hand: "Q9s" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.problem.frequency).toBe(0.33);
    expect(built.problem.correctAction).toBe("SHOVE");
  });

  it("returns '제공되지 않음' when EV is unavailable", () => {
    const built = buildTrainerProblemFromSolution(
      buildSolution(RESULT_SOURCES.HRC_PRECOMPUTED_DB, {
        "98s": { action: "SHOVE", frequency: 0.5 }
      } as unknown as StrategyMatrix),
      { hand: "98s" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(built.problem.ev).toBeNull();
    expect(built.problem.evLabel).toBe("제공되지 않음");
  });
});

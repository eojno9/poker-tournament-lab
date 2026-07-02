import { describe, expect, it } from "vitest";
import {
  buildMultiActionHandStrategy,
  buildMultiActionStrategyMatrix,
  formatActionEv,
  formatActionFrequency,
  formatActionSize,
  getPrimaryAction,
  normalizeActionSize,
  normalizeMultiActionKind,
  type MultiActionOption
} from "../src/index.js";

describe("multi-action strategy core", () => {
  it("normalizes common action labels", () => {
    expect(normalizeMultiActionKind("FOLD")).toBe("FOLD");
    expect(normalizeMultiActionKind("call")).toBe("CALL");
    expect(normalizeMultiActionKind("raise")).toBe("RAISE");
    expect(normalizeMultiActionKind("SHOVE")).toBe("ALL_IN");
    expect(normalizeMultiActionKind("all-in")).toBe("ALL_IN");
    expect(normalizeMultiActionKind("mystery")).toBe("UNKNOWN");
  });

  it("formats raise size in BB", () => {
    const size = normalizeActionSize({ sizeBb: 2.5 });
    expect(size).toEqual({ sizeBb: 2.5 });
    expect(formatActionSize(size)).toBe("2.5bb");
  });

  it("formats all-in size", () => {
    const size = normalizeActionSize({ isAllIn: true });
    expect(formatActionSize(size)).toBe("all-in");
  });

  it("keeps EV missing as not provided", () => {
    expect(formatActionEv(null)).toBe("제공되지 않음");
    const strategy = buildMultiActionHandStrategy({ hand: "AKo", action: "CALL", frequency: 1 });
    expect(strategy.actions[0]?.ev).toBeNull();
    expect(strategy.actions[0]?.evLabel).toBe("제공되지 않음");
  });

  it("keeps frequency missing as null and not provided", () => {
    const strategy = buildMultiActionHandStrategy({ hand: "AQs", action: "FOLD" });
    expect(strategy.actions[0]?.frequency).toBeNull();
    expect(strategy.totalFrequency).toBeNull();
    expect(formatActionFrequency(strategy.totalFrequency)).toBe("제공되지 않음");
  });

  it("computes primaryAction from highest frequency", () => {
    const actions: MultiActionOption[] = [
      {
        action: "FOLD",
        size: null,
        frequency: 0.2,
        ev: null,
        chipEv: null,
        icmEv: null,
        evLabel: "제공되지 않음",
        sourceActionLabel: "FOLD",
        warnings: []
      },
      {
        action: "RAISE",
        size: { sizeBb: 2.2 },
        frequency: 0.8,
        ev: 0.03,
        chipEv: null,
        icmEv: null,
        evLabel: "0.03",
        sourceActionLabel: "RAISE",
        warnings: []
      }
    ];
    expect(getPrimaryAction(actions)).toBe("RAISE");
  });

  it("builds mixed action hand strategy", () => {
    const strategy = buildMultiActionHandStrategy({
      hand: "KQs",
      actions: [
        { action: "RAISE", sizeBb: 2.2, frequency: 0.6, ev: 0.05 },
        { action: "CALL", frequency: 0.4, ev: 0.01 }
      ]
    });

    expect(strategy.actions).toHaveLength(2);
    expect(strategy.primaryAction).toBe("RAISE");
    expect(strategy.totalFrequency).toBeCloseTo(1);
    expect(strategy.actions[1]?.warnings).toContain("CALL size is not provided");
  });

  it("warns when frequency total is invalid", () => {
    const strategy = buildMultiActionHandStrategy({
      hand: "JTs",
      actions: [
        { action: "RAISE", sizeBb: 2.2, frequency: 0.8 },
        { action: "CALL", frequency: 0.4 }
      ]
    });

    expect(strategy.warnings).toContain("frequency total exceeds 1");
  });

  it("converts legacy single-action entry into one action", () => {
    const strategy = buildMultiActionHandStrategy({
      hand: "AA",
      action: "SHOVE",
      frequency: 1,
      ev: 0.12,
      sourceActionLabel: "SHOVE"
    });

    expect(strategy.actions).toHaveLength(1);
    expect(strategy.actions[0]).toEqual(
      expect.objectContaining({
        action: "ALL_IN",
        frequency: 1,
        ev: 0.12,
        sourceActionLabel: "SHOVE"
      })
    );
    expect(formatActionSize(strategy.actions[0]?.size ?? null)).toBe("all-in");
  });

  it("extracts matrix actionKinds and mixed flag", () => {
    const matrix = buildMultiActionStrategyMatrix([
      { hand: "AA", action: "SHOVE", frequency: 1 },
      {
        hand: "KQs",
        actions: [
          { action: "RAISE", sizeBb: 2.2, frequency: 0.5 },
          { action: "CALL", frequency: 0.5 }
        ]
      }
    ]);

    expect(matrix.actionKinds).toEqual(["CALL", "RAISE", "ALL_IN"]);
    expect(matrix.hasMixedActions).toBe(true);
  });

  it("handles UNKNOWN action with warning", () => {
    const strategy = buildMultiActionHandStrategy({ hand: "72o", action: "hover", frequency: 1 });
    expect(strategy.primaryAction).toBe("UNKNOWN");
    expect(strategy.actions[0]?.warnings).toContain("action is UNKNOWN");
  });
});

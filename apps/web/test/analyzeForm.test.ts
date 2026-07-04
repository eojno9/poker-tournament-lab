import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalyzeRequestFromForm, defaultAnalyzeFormState } from "../src/analyzeForm.js";
import { defaultSpot } from "../src/sampleData.js";

test("builds a valid 6max BTN shove/fold request", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  state.tableSize = 6;
  state.heroSeat = 4;
  state.heroPosition = "BTN";
  state.players = state.players.map((player) => ({
    ...player,
    isHero: player.seat === 4
  }));
  state.actionPathText = "FOLD, FOLD, HERO_DECISION";
  state.payoutsText = "1000, 700, 500, 300, 0, 0";

  const { request, errors } = buildAnalyzeRequestFromForm(state);

  assert.deepEqual(errors, []);
  assert.ok(request);
  assert.equal(request.spot.tableSize, 6);
  assert.equal(request.spot.heroSeat, 4);
  assert.equal(request.spot.heroPosition, "BTN");
  assert.equal(request.spot.decisionType, "PUSH_FOLD");
});

test("parses payouts into number array", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  state.payoutsText = "1000, 750\n500, 250, 0, 0";

  const { request, errors } = buildAnalyzeRequestFromForm(state);

  assert.deepEqual(errors, []);
  assert.deepEqual(request?.spot.payouts, [1000, 750, 500, 250, 0, 0]);
});

test("maps stackBB by seat and includes villain range preset", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  state.players = state.players.map((player) => {
    if (player.seat === 2) {
      return {
        ...player,
        stackBb: 33.5,
        villainPreset: "loose" as const,
        callRangePct: 28
      };
    }
    return player;
  });

  const { request, errors } = buildAnalyzeRequestFromForm(state);

  assert.deepEqual(errors, []);
  const seat2 = request?.spot.players.find((player) => player.seat === 2);
  assert.equal(seat2?.stackBb, 33.5);

  const seat2Range = request?.villainRanges?.find((range) => range.seat === 2);
  assert.deepEqual(seat2Range, {
    seat: 2,
    preset: "loose",
    callRangePct: 28
  });
});

test("keeps custom villain preset as callRangePct override without preset", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  state.players = state.players.map((player) => {
    if (player.seat === 3) {
      return {
        ...player,
        villainPreset: "custom" as const,
        callRangePct: 12.5
      };
    }
    return player;
  });

  const { request, errors } = buildAnalyzeRequestFromForm(state);

  assert.deepEqual(errors, []);
  const seat3Range = request?.villainRanges?.find((range) => range.seat === 3);
  assert.deepEqual(seat3Range, {
    seat: 3,
    callRangePct: 12.5
  });
});

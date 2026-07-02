import assert from "node:assert/strict";
import test from "node:test";
import { analyzeFormStateFromSpot, buildAnalyzeRequestFromForm, defaultAnalyzeFormState } from "../src/analyzeForm.js";
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

test("converts spot JSON into analyze form state", () => {
  const result = analyzeFormStateFromSpot(defaultSpot);

  assert.equal(result.formState.tableSize, defaultSpot.tableSize);
  assert.equal(result.formState.heroSeat, defaultSpot.heroSeat);
  assert.equal(result.formState.heroPosition, defaultSpot.heroPosition);
  assert.equal(result.formState.payoutsText, defaultSpot.payouts.join(", "));
  assert.equal(result.formState.actionPathText, defaultSpot.actionPath.join(", "));
  assert.equal(result.formState.players.length, defaultSpot.tableSize);
});

test("returns korean validation errors for invalid form values", () => {
  const state = defaultAnalyzeFormState(defaultSpot);
  state.tableSize = 11;
  state.blinds.smallBb = Number.NaN;
  state.blinds.bigBb = 0;
  state.blinds.anteBb = Number.NaN;
  state.players[0] = { ...state.players[0], stackBb: 0 };
  state.payoutsText = "1000, abc, , 0";
  state.actionPathText = " ";

  const { request, errors } = buildAnalyzeRequestFromForm(state);

  assert.equal(request, null);
  assert.ok(errors.some((item) => item.includes("remaining players는 2~10")));
  assert.ok(errors.some((item) => item.includes("small blind")));
  assert.ok(errors.some((item) => item.includes("big blind")));
  assert.ok(errors.some((item) => item.includes("ante")));
  assert.ok(errors.some((item) => item.includes("action path")));
  assert.ok(errors.some((item) => item.includes("payout에 숫자가 아닌 값")));
  assert.ok(errors.some((item) => item.includes("payout에 빈 값")));
  assert.ok(errors.some((item) => item.includes("stackBB")));
});

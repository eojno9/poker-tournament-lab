import assert from "node:assert/strict";
import test from "node:test";
import { ApiRequestError, createApiRequestError, toUserFacingApiError } from "../src/apiError.js";

test("maps HTTP status groups to Korean-first public messages", () => {
  assert.match(createApiRequestError(400).message, /요청/);
  assert.match(createApiRequestError(404).message, /찾지 못했습니다/);
  assert.match(createApiRequestError(500).message, /서버/);
  assert.match(createApiRequestError(503).message, /사용할 수 없습니다/);
  assert.match(createApiRequestError(504).message, /지연/);
});

test("provides safe network and not-solved messages", () => {
  assert.match(new ApiRequestError("network").message, /연결/);
  assert.match(new ApiRequestError("not_solved").message, /해결된 결과/);
});

test("keeps raw response details out of user-facing errors", () => {
  const rawDetail = "<html>internal failure at /private/path</html>";
  const mapped = createApiRequestError(500);

  assert.equal(mapped.message.includes(rawDetail), false);
  assert.equal(JSON.stringify(mapped).includes(rawDetail), false);
  assert.equal(toUserFacingApiError(mapped).includes(rawDetail), false);
});

test("uses a caller-owned fallback for unknown exceptions", () => {
  const rawError = new Error("raw transport detail");
  assert.equal(toUserFacingApiError(rawError, "목록을 불러오지 못했습니다."), "목록을 불러오지 못했습니다.");
  assert.equal(toUserFacingApiError(new ApiRequestError("network")), "서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
  assert.equal(toUserFacingApiError(rawError).includes("raw transport detail"), false);
});

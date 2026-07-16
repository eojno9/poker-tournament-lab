export type ApiErrorKind =
  | "invalid_request"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "delayed"
  | "server"
  | "network"
  | "not_solved"
  | "unavailable"
  | "invalid_response"
  | "unknown";

export type ServerApiErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "NOT_SOLVED"
  | "UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR";

const SERVER_API_ERROR_CODES = new Set<ServerApiErrorCode>([
  "INVALID_REQUEST",
  "NOT_FOUND",
  "NOT_SOLVED",
  "UNAVAILABLE",
  "INTERNAL_SERVER_ERROR"
]);

const API_ERROR_MESSAGES: Record<ApiErrorKind, string> = {
  invalid_request: "요청 내용을 확인해 주세요.",
  forbidden: "이 요청을 수행할 권한이 없습니다.",
  not_found: "요청한 정보를 찾지 못했습니다.",
  conflict: "현재 상태와 요청이 충돌했습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  delayed: "요청이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.",
  server: "서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  network: "서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
  not_solved: "이 항목은 현재 해결된 결과를 제공하지 않습니다.",
  unavailable: "이 기능은 현재 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  invalid_response: "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  unknown: "요청 처리 중 문제가 발생했습니다."
};

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly serverCode: ServerApiErrorCode | null;

  constructor(kind: ApiErrorKind, status: number | null = null, serverCode: ServerApiErrorCode | null = null) {
    super(API_ERROR_MESSAGES[kind]);
    this.name = "ApiRequestError";
    this.kind = kind;
    this.status = status;
    this.serverCode = serverCode;
  }
}

export function createApiRequestError(status: number, code: unknown = null): ApiRequestError {
  const serverCode = isServerApiErrorCode(code) ? code : null;
  return new ApiRequestError(serverCode ? apiErrorKindFromCode(serverCode) : apiErrorKindFromStatus(status), status, serverCode);
}

export function toUserFacingApiError(error: unknown, fallback = API_ERROR_MESSAGES.unknown): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

export function isServerApiErrorCode(value: unknown): value is ServerApiErrorCode {
  return typeof value === "string" && SERVER_API_ERROR_CODES.has(value as ServerApiErrorCode);
}

function apiErrorKindFromCode(code: ServerApiErrorCode): ApiErrorKind {
  switch (code) {
    case "INVALID_REQUEST":
      return "invalid_request";
    case "NOT_FOUND":
      return "not_found";
    case "NOT_SOLVED":
      return "not_solved";
    case "UNAVAILABLE":
      return "unavailable";
    case "INTERNAL_SERVER_ERROR":
      return "server";
  }
}

function apiErrorKindFromStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) {
    return "invalid_request";
  }
  if (status === 401 || status === 403) {
    return "forbidden";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 409) {
    return "conflict";
  }
  if (status === 408 || status === 429 || status === 504) {
    return "delayed";
  }
  if (status === 501 || status === 503) {
    return "unavailable";
  }
  if (status >= 500) {
    return "server";
  }
  return "unknown";
}

import { type ParsedCopiedDbRehearsalArgs } from "./copiedDbRehearsalConfig.js";

export type CopiedDbSafetyGateVerdict = "DRY_RUN_PASS" | "DRY_RUN_BLOCKED";

export interface CopiedDbSafetyGateResult {
  verdict: CopiedDbSafetyGateVerdict;
  allowed: boolean;
  reasons: string[];
  mode: "dry-run" | "blocked";
  writeStatus: "no-write";
  rawDataStatus: "not accessed" | "blocked";
  productionDbStatus: "not targeted" | "blocked";
  scopeStatus: "off-table study only" | "blocked";
  targetKind: string | null;
  dbWriteAllowed: false;
  productionDbWriteAllowed: false;
  reportFileWriteAllowed: false;
}

const WRITE_FLAGS = new Set(["--write", "--import", "--apply", "--migrate", "--commit"]);
const PRODUCTION_FLAGS = new Set(["--prod", "--production"]);
const API_UI_FLAGS = new Set(["--api", "--ui"]);
const LIVE_SCOPE_FLAGS = new Set([
  "--live",
  "--watch",
  "--watcher",
  "--ocr",
  "--overlay",
  "--hotkey",
  "--screen-capture",
  "--poker-client"
]);
const REPORT_FILE_FLAGS = new Set(["--output-file", "--report-file"]);

const RAW_DB_PATTERN = /(^|[\\/.\s_-])[^\\/]*\.(db|sqlite|sqlite3|db-wal|db-shm)(?:$|[?#\s])/i;
const ARCHIVE_PATTERN = /(^|[\\/.\s_-])[^\\/]*\.(zip|hrcz|tar|tgz|gz|7z|rar)(?:$|[?#\s])/i;
const PRODUCTION_PATTERN = /(^|[\\/.\s_-])(prod|production|production-db|prod-db)(?:$|[\\/.\s_-])|apps[\\/]server[\\/]data/i;
const LIVE_SCOPE_PATTERN = /(^|[\\/.\s_-])(rta|live|real-time|realtime|ocr|overlay|hotkey|watcher|poker-client|screen-capture)(?:$|[\\/.\s_-])/i;

export function evaluateCopiedDbSafetyGate(input: ParsedCopiedDbRehearsalArgs): CopiedDbSafetyGateResult {
  const reasons: string[] = [];

  if (!input.dryRun) {
    reasons.push("Refused: dry-run mode is required.");
  }

  if (input.configPath === null || input.configPath.trim().length === 0) {
    reasons.push("Refused: local config is required.");
  }

  if (input.targetKind !== "copied-local") {
    reasons.push("Refused: copied-local target kind is required.");
  }

  if (input.approval === null || input.approval.trim().length === 0) {
    reasons.push("Refused: local rehearsal approval is required.");
  }

  if (!input.consoleOnly) {
    reasons.push("Refused: console-only output is required.");
  }

  if (input.missingValueFlags.length > 0) {
    reasons.push("Refused: required flag value is missing.");
  }

  if (input.unknownFlags.length > 0 || input.positionalArgs.length > 0) {
    reasons.push("Refused: unsupported command input.");
  }

  if (hasAnyFlag(input, WRITE_FLAGS)) {
    reasons.push("Refused: write operations are not available for this command.");
  }

  if (hasAnyFlag(input, PRODUCTION_FLAGS) || hasProductionPattern(input)) {
    reasons.push("Refused: production targets are not supported.");
  }

  if (hasRawDataPattern(input)) {
    reasons.push("Refused: raw data inputs are not supported.");
  }

  if (hasAnyFlag(input, API_UI_FLAGS)) {
    reasons.push("Refused: API/UI/live integrations are not supported.");
  }

  if (hasAnyFlag(input, LIVE_SCOPE_FLAGS) || hasLiveScopePattern(input)) {
    reasons.push("Refused: this tool is for off-table study only.");
  }

  if (hasAnyFlag(input, REPORT_FILE_FLAGS)) {
    reasons.push("Refused: generated report output is not available for this command.");
  }

  const uniqueReasons = Array.from(new Set(reasons));
  const allowed = uniqueReasons.length === 0;
  const rawBlocked = hasRawDataPattern(input);
  const productionBlocked = hasAnyFlag(input, PRODUCTION_FLAGS) || hasProductionPattern(input);
  const scopeBlocked = hasAnyFlag(input, LIVE_SCOPE_FLAGS) || hasLiveScopePattern(input);

  return {
    verdict: allowed ? "DRY_RUN_PASS" : "DRY_RUN_BLOCKED",
    allowed,
    reasons: uniqueReasons,
    mode: allowed ? "dry-run" : input.dryRun ? "dry-run" : "blocked",
    writeStatus: "no-write",
    rawDataStatus: rawBlocked ? "blocked" : "not accessed",
    productionDbStatus: productionBlocked ? "blocked" : "not targeted",
    scopeStatus: scopeBlocked ? "blocked" : "off-table study only",
    targetKind: input.targetKind,
    dbWriteAllowed: false,
    productionDbWriteAllowed: false,
    reportFileWriteAllowed: false
  };
}

function hasAnyFlag(input: ParsedCopiedDbRehearsalArgs, flags: Set<string>): boolean {
  return input.forbiddenFlags.some((flag) => flags.has(flag));
}

function hasRawDataPattern(input: ParsedCopiedDbRehearsalArgs): boolean {
  return allInputValues(input).some((value) => RAW_DB_PATTERN.test(value) || ARCHIVE_PATTERN.test(value));
}

function hasProductionPattern(input: ParsedCopiedDbRehearsalArgs): boolean {
  return allInputValues(input).some((value) => PRODUCTION_PATTERN.test(value));
}

function hasLiveScopePattern(input: ParsedCopiedDbRehearsalArgs): boolean {
  return allInputValues(input).some((value) => LIVE_SCOPE_PATTERN.test(value));
}

function allInputValues(input: ParsedCopiedDbRehearsalArgs): string[] {
  return [
    input.configPath,
    input.targetKind,
    input.approval,
    ...input.originalArgs,
    ...input.positionalArgs,
    ...input.unknownFlags
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

export interface HrcCopiedDbPathGuardInput {
  targetDbPath: string;
  productionDbPath: string;
  repoRootPath: string;
  backupRootPath: string;
  allowPlaceholderPathsOnly?: boolean;
}

export type HrcCopiedDbPathGuardDecision =
  | "ALLOWED_COPIED_DB_TARGET"
  | "BLOCKED_PRODUCTION_DB_TARGET"
  | "BLOCKED_REPO_LOCAL_TARGET"
  | "BLOCKED_RAW_HRC_PATH"
  | "BLOCKED_PRIVATE_PATH_EXPOSURE"
  | "BLOCKED_INVALID_EXTENSION"
  | "BLOCKED_EMPTY_PATH"
  | "BLOCKED_SIDE_CAR_FILE"
  | "BLOCKED_UNKNOWN";

export interface HrcCopiedDbPathGuardResult {
  allowed: boolean;
  decision: HrcCopiedDbPathGuardDecision;
  normalizedTargetDbPathRedacted: string;
  normalizedProductionDbPathRedacted: string;
  reasons: string[];
  warnings: string[];
}

export function guardHrcCopiedDbTargetPath(
  input: HrcCopiedDbPathGuardInput
): HrcCopiedDbPathGuardResult {
  const normalizedTarget = normalizeHrcDbPathForComparison(input.targetDbPath);
  const normalizedProduction = normalizeHrcDbPathForComparison(input.productionDbPath);
  const normalizedRepoRoot = normalizeHrcDbPathForComparison(input.repoRootPath);
  const normalizedBackupRoot = normalizeHrcDbPathForComparison(input.backupRootPath);
  const targetForCompare = normalizeForCaseInsensitiveComparison(normalizedTarget);
  const productionForCompare = normalizeForCaseInsensitiveComparison(normalizedProduction);
  const warnings = buildWarnings(input);

  if (normalizedTarget.length === 0) {
    return result(input, "BLOCKED_EMPTY_PATH", ["target DB path is empty"], warnings);
  }

  if (targetForCompare === productionForCompare && productionForCompare.length > 0) {
    return result(input, "BLOCKED_PRODUCTION_DB_TARGET", ["target DB path matches production DB path"], warnings);
  }

  if (isPathWithin(normalizedTarget, normalizedRepoRoot)) {
    return result(input, "BLOCKED_REPO_LOCAL_TARGET", ["target DB path is inside the repo"], warnings);
  }

  if (containsRawHrcPathToken(normalizedTarget)) {
    return result(input, "BLOCKED_RAW_HRC_PATH", ["target DB path contains raw HRC path markers"], warnings);
  }

  if (isSidecarDbFile(normalizedTarget)) {
    return result(input, "BLOCKED_SIDE_CAR_FILE", ["target DB path points to a SQLite sidecar file"], warnings);
  }

  if (!hasDbExtension(normalizedTarget)) {
    return result(input, "BLOCKED_INVALID_EXTENSION", ["target DB path must end with .db"], warnings);
  }

  if (input.allowPlaceholderPathsOnly === true && containsPrivatePathToken(normalizedTarget)) {
    return result(input, "BLOCKED_PRIVATE_PATH_EXPOSURE", ["target DB path contains private local path markers"], warnings);
  }

  if (isPathWithin(normalizedTarget, normalizedBackupRoot)) {
    return result(input, "ALLOWED_COPIED_DB_TARGET", ["target DB path is under the copied DB backup root"], warnings);
  }

  return result(input, "BLOCKED_UNKNOWN", ["target DB path is not under the approved copied DB backup root"], warnings);
}

export function normalizeHrcDbPathForComparison(value: string): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  return normalized.replace(/\/+$/g, "");
}

export function redactHrcLocalPathForGuardOutput(value: string): string {
  const normalized = normalizeHrcDbPathForComparison(value);
  if (normalized.length === 0) {
    return "";
  }

  const fileName = normalized.split("/").filter(Boolean).pop() ?? "";

  if (containsRawHrcPathToken(normalized)) {
    return fileName.length > 0 ? `<redacted-hrc-path>/${redactPrivateTokens(fileName)}` : "<redacted-hrc-path>";
  }

  if (containsPrivatePathToken(normalized) || /^[A-Za-z]:\//.test(normalized)) {
    return fileName.length > 0 ? `<redacted-local-path>/${redactPrivateTokens(fileName)}` : "<redacted-local-path>";
  }

  return redactPrivateTokens(normalized);
}

function result(
  input: HrcCopiedDbPathGuardInput,
  decision: HrcCopiedDbPathGuardDecision,
  reasons: string[],
  warnings: string[]
): HrcCopiedDbPathGuardResult {
  return {
    allowed: decision === "ALLOWED_COPIED_DB_TARGET",
    decision,
    normalizedTargetDbPathRedacted: redactHrcLocalPathForGuardOutput(input.targetDbPath),
    normalizedProductionDbPathRedacted: redactHrcLocalPathForGuardOutput(input.productionDbPath),
    reasons,
    warnings
  };
}

function buildWarnings(input: HrcCopiedDbPathGuardInput): string[] {
  const warnings: string[] = [];

  if (containsPrivatePathToken(input.targetDbPath)) {
    warnings.push("target DB path required redaction");
  }
  if (containsPrivatePathToken(input.productionDbPath)) {
    warnings.push("production DB path required redaction");
  }
  if (containsPrivatePathToken(input.repoRootPath)) {
    warnings.push("repo root path required redaction");
  }
  if (containsPrivatePathToken(input.backupRootPath)) {
    warnings.push("backup root path required redaction");
  }

  return warnings.map(redactPrivateTokens);
}

function isPathWithin(pathValue: string, rootValue: string): boolean {
  if (pathValue.length === 0 || rootValue.length === 0) {
    return false;
  }

  const pathForCompare = normalizeForCaseInsensitiveComparison(pathValue);
  const rootForCompare = normalizeForCaseInsensitiveComparison(rootValue);
  return pathForCompare === rootForCompare || pathForCompare.startsWith(`${rootForCompare}/`);
}

function normalizeForCaseInsensitiveComparison(value: string): string {
  return normalizeHrcDbPathForComparison(value).toLowerCase();
}

function hasDbExtension(pathValue: string): boolean {
  return normalizeForCaseInsensitiveComparison(pathValue).endsWith(".db");
}

function isSidecarDbFile(pathValue: string): boolean {
  const normalized = normalizeForCaseInsensitiveComparison(pathValue);
  return normalized.endsWith(".db-shm") || normalized.endsWith(".db-wal");
}

function containsRawHrcPathToken(value: string): boolean {
  return /raw[ _-]?hrc|hrc[ _-]?raw|mtt_.*\.zip/i.test(value);
}

function containsPrivatePathToken(value: string): boolean {
  return /[A-Za-z]:[\\/]|C:\\Users|\/Users\/|sample-user|sample-private-token|sample-external-hrc-folder|@privaterelay\.appleid\.com/i.test(
    value
  );
}

function redactPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/\/Users\//gi, "/<redacted-users>/")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

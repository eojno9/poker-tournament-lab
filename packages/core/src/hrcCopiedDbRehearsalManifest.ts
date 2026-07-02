import type { HrcCopiedDbPathGuardDecision } from "./hrcCopiedDbPathGuard.js";
import type { HrcImportBackupJsonValue } from "./hrcImportBackupManifest.js";

export interface HrcCopiedDbRehearsalSafetyChecks {
  gitStatusClean: boolean;
  testPassed: boolean;
  buildPassed: boolean;
  smokePassed: boolean;
  productionDbShaUnchanged: boolean;
  copiedDbTargetAllowed: boolean;
  productImportRouteDisabled: boolean;
  dbReadWriteNotPerformed: boolean;
  reportJsonNotGenerated: boolean;
  rawZipAbsent: boolean;
  generatedArtifactJsonAbsent: boolean;
  hrcDryRunReportsAbsent: boolean;
  privacyPathScanPassed: boolean;
}

export interface HrcCopiedDbRehearsalManifestInput {
  rehearsalId: string;
  timestampIso: string;
  branchName: string;
  commitHash: string;
  productionDbSha256Before: string;
  productionDbSha256After: string;
  copiedDbSha256Before: string;
  copiedDbSha256After: string;
  copiedDbPathGuardDecision: HrcCopiedDbPathGuardDecision;
  dryRunExitCode: number;
  importPreviewAllowed: number;
  validationSummary: HrcImportBackupJsonValue;
  safetyChecks: HrcCopiedDbRehearsalSafetyChecks;
  rollbackPlanAvailable: boolean;
  explicitApprovalRecorded: boolean;
}

export interface HrcCopiedDbRehearsalManifest {
  version: "v3.0-copied-db-rehearsal-manifest-preview";
  rehearsalId: string;
  timestampIso: string;
  branchName: string;
  commitHash: string;
  productionDbSha256Before: string;
  productionDbSha256After: string;
  productionDbSha256Unchanged: boolean;
  copiedDbSha256Before: string;
  copiedDbSha256After: string;
  copiedDbSha256Changed: boolean;
  copiedDbPathGuardDecision: HrcCopiedDbPathGuardDecision;
  dryRunExitCode: number;
  importPreviewAllowed: number;
  validationSummary: HrcImportBackupJsonValue;
  safetyChecks: HrcCopiedDbRehearsalSafetyChecks;
  rollbackPlanAvailable: boolean;
  explicitApprovalRecorded: boolean;
  productionDbWriteAllowed: false;
  copiedDbWriteAllowed: false;
  reportFileWriteAllowed: false;
  warnings: string[];
}

export interface HrcCopiedDbRehearsalSafetyValidationResult {
  pass: boolean;
  failedChecks: Array<keyof HrcCopiedDbRehearsalSafetyChecks>;
  warnings: string[];
}

export interface HrcCopiedDbRehearsalManifestSummary {
  version: HrcCopiedDbRehearsalManifest["version"];
  rehearsalId: string;
  branchName: string;
  commitHash: string;
  productionDbSha256Unchanged: boolean;
  copiedDbSha256Changed: boolean;
  copiedDbPathGuardDecision: HrcCopiedDbPathGuardDecision;
  dryRunExitCode: number;
  importPreviewAllowed: number;
  allSafetyChecksPassed: boolean;
  failedSafetyChecks: Array<keyof HrcCopiedDbRehearsalSafetyChecks>;
  rollbackPlanAvailable: boolean;
  explicitApprovalRecorded: boolean;
  warningCount: number;
  productionDbWriteAllowed: false;
  copiedDbWriteAllowed: false;
  reportFileWriteAllowed: false;
}

export function buildHrcCopiedDbRehearsalManifest(
  input: HrcCopiedDbRehearsalManifestInput
): HrcCopiedDbRehearsalManifest {
  const sanitize = createSanitizer();
  const manifest: HrcCopiedDbRehearsalManifest = {
    version: "v3.0-copied-db-rehearsal-manifest-preview",
    rehearsalId: sanitize.requiredString("rehearsalId", input.rehearsalId),
    timestampIso: sanitize.requiredString("timestampIso", input.timestampIso),
    branchName: sanitize.requiredString("branchName", input.branchName),
    commitHash: sanitize.requiredString("commitHash", input.commitHash),
    productionDbSha256Before: sanitize.requiredString(
      "productionDbSha256Before",
      input.productionDbSha256Before
    ),
    productionDbSha256After: sanitize.requiredString(
      "productionDbSha256After",
      input.productionDbSha256After
    ),
    productionDbSha256Unchanged: input.productionDbSha256Before === input.productionDbSha256After,
    copiedDbSha256Before: sanitize.requiredString("copiedDbSha256Before", input.copiedDbSha256Before),
    copiedDbSha256After: sanitize.requiredString("copiedDbSha256After", input.copiedDbSha256After),
    copiedDbSha256Changed: input.copiedDbSha256Before !== input.copiedDbSha256After,
    copiedDbPathGuardDecision: input.copiedDbPathGuardDecision,
    dryRunExitCode: sanitize.number("dryRunExitCode", input.dryRunExitCode),
    importPreviewAllowed: sanitize.number("importPreviewAllowed", input.importPreviewAllowed),
    validationSummary: sanitize.jsonValue("validationSummary", input.validationSummary),
    safetyChecks: { ...input.safetyChecks },
    rollbackPlanAvailable: input.rollbackPlanAvailable,
    explicitApprovalRecorded: input.explicitApprovalRecorded,
    productionDbWriteAllowed: false,
    copiedDbWriteAllowed: false,
    reportFileWriteAllowed: false,
    warnings: []
  };

  const safety = validateHrcCopiedDbRehearsalSafetyChecks(manifest);
  manifest.warnings = [...sanitize.warnings, ...buildManifestWarnings(manifest), ...safety.warnings];

  return manifest;
}

export function validateHrcCopiedDbRehearsalSafetyChecks(
  manifest: HrcCopiedDbRehearsalManifest
): HrcCopiedDbRehearsalSafetyValidationResult {
  const failedChecks = (
    Object.keys(manifest.safetyChecks) as Array<keyof HrcCopiedDbRehearsalSafetyChecks>
  ).filter((key) => manifest.safetyChecks[key] !== true);

  return {
    pass: failedChecks.length === 0,
    failedChecks,
    warnings: failedChecks.map((key) => `safety check failed: ${key}`)
  };
}

export function summarizeHrcCopiedDbRehearsalManifest(
  manifest: HrcCopiedDbRehearsalManifest
): HrcCopiedDbRehearsalManifestSummary {
  const safety = validateHrcCopiedDbRehearsalSafetyChecks(manifest);

  return {
    version: manifest.version,
    rehearsalId: manifest.rehearsalId,
    branchName: manifest.branchName,
    commitHash: manifest.commitHash,
    productionDbSha256Unchanged: manifest.productionDbSha256Unchanged,
    copiedDbSha256Changed: manifest.copiedDbSha256Changed,
    copiedDbPathGuardDecision: manifest.copiedDbPathGuardDecision,
    dryRunExitCode: manifest.dryRunExitCode,
    importPreviewAllowed: manifest.importPreviewAllowed,
    allSafetyChecksPassed: safety.pass,
    failedSafetyChecks: safety.failedChecks,
    rollbackPlanAvailable: manifest.rollbackPlanAvailable,
    explicitApprovalRecorded: manifest.explicitApprovalRecorded,
    warningCount: manifest.warnings.length,
    productionDbWriteAllowed: false,
    copiedDbWriteAllowed: false,
    reportFileWriteAllowed: false
  };
}

function buildManifestWarnings(manifest: HrcCopiedDbRehearsalManifest): string[] {
  const warnings: string[] = [];

  if (!manifest.productionDbSha256Unchanged) {
    warnings.push("production DB SHA256 changed during copied-DB rehearsal preview");
  }
  if (manifest.copiedDbPathGuardDecision !== "ALLOWED_COPIED_DB_TARGET") {
    warnings.push(`copied DB path guard did not allow target: ${manifest.copiedDbPathGuardDecision}`);
  }
  if (manifest.dryRunExitCode !== 0) {
    warnings.push(`dry-run exitCode was non-zero: ${manifest.dryRunExitCode}`);
  }
  if (!manifest.rollbackPlanAvailable) {
    warnings.push("rollback plan is not available");
  }
  if (manifest.productionDbWriteAllowed || manifest.copiedDbWriteAllowed || manifest.reportFileWriteAllowed) {
    warnings.push("write flag unexpectedly true");
  }

  return warnings;
}

function createSanitizer() {
  const warnings: string[] = [];

  function requiredString(fieldName: string, value: string): string {
    const sanitized = string(fieldName, value);
    if (sanitized.trim().length === 0) {
      warnings.push(`missing required field: ${fieldName}`);
    }

    return sanitized;
  }

  function string(fieldName: string, value: string): string {
    if (typeof value !== "string") {
      warnings.push(`invalid string field: ${fieldName}`);
      return "";
    }

    const sanitized = redactPrivateTokens(value);
    if (sanitized !== value) {
      warnings.push(`redacted private token in ${fieldName}`);
    }

    return sanitized;
  }

  function number(fieldName: string, value: number): number {
    if (!Number.isFinite(value)) {
      warnings.push(`invalid number field: ${fieldName}`);
      return 0;
    }

    return value;
  }

  function jsonValue(fieldName: string, value: HrcImportBackupJsonValue): HrcImportBackupJsonValue {
    if (typeof value === "string") {
      return string(fieldName, value);
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => jsonValue(`${fieldName}[${index}]`, item));
    }

    const sanitized: { [key: string]: HrcImportBackupJsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const safeKey = redactPrivateTokens(key);
      if (safeKey !== key) {
        warnings.push(`redacted private token in ${fieldName} key`);
      }
      sanitized[safeKey] = jsonValue(`${fieldName}.${safeKey}`, item);
    }

    return sanitized;
  }

  return {
    warnings,
    requiredString,
    number,
    jsonValue
  };
}

function redactPrivateTokens(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>")
    .replace(/C:\\Users/gi, "<redacted-local-path>")
    .replace(/sample-user/gi, "<redacted-user>")
    .replace(/sample-private-token/gi, "<redacted-user>")
    .replace(/sample-external-hrc-folder/gi, "<redacted-cloud-path>");
}

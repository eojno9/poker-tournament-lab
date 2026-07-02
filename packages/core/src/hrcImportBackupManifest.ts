export type HrcImportBackupJsonValue =
  | string
  | number
  | boolean
  | null
  | HrcImportBackupJsonValue[]
  | { [key: string]: HrcImportBackupJsonValue };

export interface HrcImportBackupSafetyChecks {
  gitStatusClean: boolean;
  testPassed: boolean;
  buildPassed: boolean;
  smokePassed: boolean;
  privacyScanPassed: boolean;
  rawZipAbsent: boolean;
  generatedArtifactJsonAbsent: boolean;
  hrcDryRunReportsAbsent: boolean;
  productImportRouteDisabled: boolean;
  dbReadWriteNotPerformed: boolean;
}

export interface HrcImportBackupManifestInput {
  backupId: string;
  timestampIso: string;
  branchName: string;
  commitHash: string;
  dbFileName: string;
  dbSha256Before: string;
  importPreviewSummary: HrcImportBackupJsonValue;
  validationSummary: HrcImportBackupJsonValue;
  classificationSummary: HrcImportBackupJsonValue;
  safetyChecks: HrcImportBackupSafetyChecks;
  rollbackInstructions: string[];
}

export interface HrcImportBackupManifest {
  version: "v3.0-backup-manifest-preview";
  backupId: string;
  timestampIso: string;
  branchName: string;
  commitHash: string;
  dbFileName: string;
  dbSha256Before: string;
  importPreviewSummary: HrcImportBackupJsonValue;
  validationSummary: HrcImportBackupJsonValue;
  classificationSummary: HrcImportBackupJsonValue;
  safetyChecks: HrcImportBackupSafetyChecks;
  rollbackInstructions: string[];
  writeAllowed: false;
  restoreRehearsalRequired: true;
  warnings: string[];
}

export interface HrcImportBackupSafetyValidationResult {
  pass: boolean;
  failedChecks: Array<keyof HrcImportBackupSafetyChecks>;
  warnings: string[];
}

export interface HrcImportBackupManifestSummary {
  version: HrcImportBackupManifest["version"];
  backupId: string;
  branchName: string;
  commitHash: string;
  dbFileName: string;
  dbSha256BeforePresent: boolean;
  allSafetyChecksPassed: boolean;
  failedSafetyChecks: Array<keyof HrcImportBackupSafetyChecks>;
  warningCount: number;
  writeAllowed: false;
  restoreRehearsalRequired: true;
}

export function buildHrcImportBackupManifest(input: HrcImportBackupManifestInput): HrcImportBackupManifest {
  const sanitize = createSanitizer();
  const manifest: HrcImportBackupManifest = {
    version: "v3.0-backup-manifest-preview",
    backupId: sanitize.requiredString("backupId", input.backupId),
    timestampIso: sanitize.requiredString("timestampIso", input.timestampIso),
    branchName: sanitize.requiredString("branchName", input.branchName),
    commitHash: sanitize.requiredString("commitHash", input.commitHash),
    dbFileName: sanitize.requiredDbFileName(input.dbFileName),
    dbSha256Before: sanitize.requiredString("dbSha256Before", input.dbSha256Before),
    importPreviewSummary: sanitize.jsonValue("importPreviewSummary", input.importPreviewSummary),
    validationSummary: sanitize.jsonValue("validationSummary", input.validationSummary),
    classificationSummary: sanitize.jsonValue("classificationSummary", input.classificationSummary),
    safetyChecks: { ...input.safetyChecks },
    rollbackInstructions: input.rollbackInstructions.map((instruction, index) =>
      sanitize.string(`rollbackInstructions[${index}]`, instruction)
    ),
    writeAllowed: false,
    restoreRehearsalRequired: true,
    warnings: []
  };

  const safety = validateHrcImportBackupSafetyChecks(manifest);
  manifest.warnings = [...sanitize.warnings, ...safety.warnings];

  return manifest;
}

export function validateHrcImportBackupSafetyChecks(
  manifest: HrcImportBackupManifest
): HrcImportBackupSafetyValidationResult {
  const failedChecks = (Object.keys(manifest.safetyChecks) as Array<keyof HrcImportBackupSafetyChecks>).filter(
    (key) => manifest.safetyChecks[key] !== true
  );

  return {
    pass: failedChecks.length === 0,
    failedChecks,
    warnings: failedChecks.map((key) => `safety check failed: ${key}`)
  };
}

export function summarizeHrcImportBackupManifest(
  manifest: HrcImportBackupManifest
): HrcImportBackupManifestSummary {
  const safety = validateHrcImportBackupSafetyChecks(manifest);

  return {
    version: manifest.version,
    backupId: manifest.backupId,
    branchName: manifest.branchName,
    commitHash: manifest.commitHash,
    dbFileName: manifest.dbFileName,
    dbSha256BeforePresent: manifest.dbSha256Before.trim().length > 0,
    allSafetyChecksPassed: safety.pass,
    failedSafetyChecks: safety.failedChecks,
    warningCount: manifest.warnings.length,
    writeAllowed: false,
    restoreRehearsalRequired: true
  };
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

  function requiredDbFileName(value: string): string {
    const rawFileName = typeof value === "string" ? value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value : "";
    if (rawFileName !== value) {
      warnings.push("redacted path-like dbFileName to file name only");
    }

    const sanitized = string("dbFileName", rawFileName);
    if (sanitized.trim().length === 0) {
      warnings.push("missing required field: dbFileName");
      return "";
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
    requiredDbFileName,
    string,
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

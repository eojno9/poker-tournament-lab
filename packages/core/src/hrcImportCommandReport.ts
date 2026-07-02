export type HrcImportCommandJsonValue =
  | string
  | number
  | boolean
  | null
  | HrcImportCommandJsonValue[]
  | { [key: string]: HrcImportCommandJsonValue };

export type HrcImportDryRunCommandName = "import:hrc:preview" | "import:hrc:dry-run";

export type HrcImportCommandMode = "DRY_RUN";

export type HrcImportCommandExitCode = 0 | 1 | 2 | 3 | 4;

export type HrcImportCommandStatus =
  | "OK"
  | "VALIDATION_BLOCKED"
  | "SAFETY_FAILED"
  | "PRIVACY_PATH_FAILED"
  | "INVALID_INPUT";

export interface HrcImportCommandValidationSummary {
  blockingIssueCount?: number;
  duplicateExistingDbCount?: number;
  duplicateInBatchCount?: number;
  missingCanonicalKeyCount?: number;
  privacyBlockedCount?: number;
  dbWriteAllowedTrueCount?: number;
  [key: string]: HrcImportCommandJsonValue | undefined;
}

export interface HrcImportCommandReportInput {
  commandName: HrcImportDryRunCommandName;
  mode: HrcImportCommandMode;
  timestampIso: string;
  previewSummary: HrcImportCommandJsonValue;
  validationSummary: HrcImportCommandValidationSummary;
  backupManifestSummary: HrcImportCommandJsonValue;
  safetyGateSummary: HrcImportCommandJsonValue;
  privacyScanPassed: boolean;
  dbSha256Before: string;
  dbSha256After: string;
  productImportRouteDisabled: boolean;
  dbReadWritePerformed: boolean;
  localPathExposureDetected: boolean;
  rawArtifactExposureDetected: boolean;
  warnings: string[];
}

export interface HrcImportCommandReport {
  version: "v3.0-import-command-report-preview";
  commandName: HrcImportDryRunCommandName | "<invalid-command>";
  mode: HrcImportCommandMode | "<invalid-mode>";
  timestampIso: string;
  exitCode: HrcImportCommandExitCode;
  status: HrcImportCommandStatus;
  previewSummary: HrcImportCommandJsonValue;
  validationSummary: HrcImportCommandJsonValue;
  backupManifestSummary: HrcImportCommandJsonValue;
  safetyGateSummary: HrcImportCommandJsonValue;
  dbSha256Before: string;
  dbSha256After: string;
  dbSha256Unchanged: boolean;
  writeAllowed: false;
  dbWriteAllowed: false;
  reportFileWriteAllowed: false;
  productImportRouteDisabled: boolean;
  warnings: string[];
  nextAction: string;
}

export interface HrcImportCommandReportSummary {
  version: HrcImportCommandReport["version"];
  commandName: HrcImportCommandReport["commandName"];
  mode: HrcImportCommandReport["mode"];
  exitCode: HrcImportCommandExitCode;
  status: HrcImportCommandStatus;
  dbSha256Unchanged: boolean;
  warningCount: number;
  writeAllowed: false;
  dbWriteAllowed: false;
  reportFileWriteAllowed: false;
  productImportRouteDisabled: boolean;
}

export function buildHrcImportCommandReport(input: HrcImportCommandReportInput): HrcImportCommandReport {
  const sanitizer = createSanitizer();
  const privacyPathFailure = hasPrivacyPathFailure(input);
  const safetyFailure = hasSafetyFailure(input);
  const validationFailure = hasValidationBlockingIssue(input.validationSummary);
  const invalidInput = hasInvalidInput(input);
  const exitCode = determineHrcImportCommandExitCode(input);
  const status = statusFromExitCode(exitCode);
  const generatedWarnings = buildGeneratedWarnings({
    privacyPathFailure,
    safetyFailure,
    validationFailure,
    invalidInput,
    dbSha256Unchanged: input.dbSha256Before === input.dbSha256After,
    productImportRouteDisabled: input.productImportRouteDisabled,
    dbReadWritePerformed: input.dbReadWritePerformed
  });
  const commandName = isValidCommandName(input.commandName) ? input.commandName : "<invalid-command>";
  const mode = input.mode === "DRY_RUN" ? input.mode : "<invalid-mode>";

  return {
    version: "v3.0-import-command-report-preview",
    commandName,
    mode,
    timestampIso: sanitizer.string("timestampIso", input.timestampIso),
    exitCode,
    status,
    previewSummary: sanitizer.jsonValue("previewSummary", input.previewSummary),
    validationSummary: sanitizer.jsonValue("validationSummary", input.validationSummary as HrcImportCommandJsonValue),
    backupManifestSummary: sanitizer.jsonValue("backupManifestSummary", input.backupManifestSummary),
    safetyGateSummary: sanitizer.jsonValue("safetyGateSummary", input.safetyGateSummary),
    dbSha256Before: sanitizer.string("dbSha256Before", input.dbSha256Before),
    dbSha256After: sanitizer.string("dbSha256After", input.dbSha256After),
    dbSha256Unchanged: input.dbSha256Before === input.dbSha256After,
    writeAllowed: false,
    dbWriteAllowed: false,
    reportFileWriteAllowed: false,
    productImportRouteDisabled: input.productImportRouteDisabled,
    warnings: [
      ...input.warnings.map((warning, index) => sanitizer.string(`warnings[${index}]`, warning)),
      ...generatedWarnings,
      ...sanitizer.warnings
    ],
    nextAction: nextActionFromExitCode(exitCode)
  };
}

export function determineHrcImportCommandExitCode(input: HrcImportCommandReportInput): HrcImportCommandExitCode {
  if (hasPrivacyPathFailure(input)) {
    return 3;
  }

  if (hasSafetyFailure(input)) {
    return 2;
  }

  if (hasValidationBlockingIssue(input.validationSummary)) {
    return 1;
  }

  if (hasInvalidInput(input)) {
    return 4;
  }

  return 0;
}

export function summarizeHrcImportCommandReport(report: HrcImportCommandReport): HrcImportCommandReportSummary {
  return {
    version: report.version,
    commandName: report.commandName,
    mode: report.mode,
    exitCode: report.exitCode,
    status: report.status,
    dbSha256Unchanged: report.dbSha256Unchanged,
    warningCount: report.warnings.length,
    writeAllowed: false,
    dbWriteAllowed: false,
    reportFileWriteAllowed: false,
    productImportRouteDisabled: report.productImportRouteDisabled
  };
}

function hasPrivacyPathFailure(input: HrcImportCommandReportInput): boolean {
  return (
    input.localPathExposureDetected ||
    input.rawArtifactExposureDetected ||
    !input.privacyScanPassed ||
    containsPrivateToken(JSON.stringify(input))
  );
}

function hasSafetyFailure(input: HrcImportCommandReportInput): boolean {
  return (
    input.dbSha256Before !== input.dbSha256After ||
    !input.productImportRouteDisabled ||
    input.dbReadWritePerformed
  );
}

function hasValidationBlockingIssue(validationSummary: HrcImportCommandValidationSummary): boolean {
  return (
    readCount(validationSummary.blockingIssueCount) > 0 ||
    readCount(validationSummary.duplicateExistingDbCount) > 0 ||
    readCount(validationSummary.duplicateInBatchCount) > 0 ||
    readCount(validationSummary.missingCanonicalKeyCount) > 0 ||
    readCount(validationSummary.privacyBlockedCount) > 0 ||
    readCount(validationSummary.dbWriteAllowedTrueCount) > 0
  );
}

function hasInvalidInput(input: HrcImportCommandReportInput): boolean {
  return (
    !isValidCommandName(input.commandName) ||
    input.mode !== "DRY_RUN" ||
    input.timestampIso.trim().length === 0 ||
    input.dbSha256Before.trim().length === 0 ||
    input.dbSha256After.trim().length === 0
  );
}

function buildGeneratedWarnings(input: {
  privacyPathFailure: boolean;
  safetyFailure: boolean;
  validationFailure: boolean;
  invalidInput: boolean;
  dbSha256Unchanged: boolean;
  productImportRouteDisabled: boolean;
  dbReadWritePerformed: boolean;
}): string[] {
  const warnings: string[] = [];

  if (input.privacyPathFailure) {
    warnings.push("privacy/path failure detected");
  }
  if (input.safetyFailure) {
    warnings.push("safety gate failure detected");
  }
  if (input.validationFailure) {
    warnings.push("validation blocking issue detected");
  }
  if (input.invalidInput) {
    warnings.push("invalid command report input detected");
  }
  if (!input.dbSha256Unchanged) {
    warnings.push("DB SHA256 changed during dry-run command preview");
  }
  if (!input.productImportRouteDisabled) {
    warnings.push("product import route is not disabled");
  }
  if (input.dbReadWritePerformed) {
    warnings.push("DB read/write was performed");
  }

  return warnings;
}

function statusFromExitCode(exitCode: HrcImportCommandExitCode): HrcImportCommandStatus {
  switch (exitCode) {
    case 0:
      return "OK";
    case 1:
      return "VALIDATION_BLOCKED";
    case 2:
      return "SAFETY_FAILED";
    case 3:
      return "PRIVACY_PATH_FAILED";
    case 4:
      return "INVALID_INPUT";
  }
}

function nextActionFromExitCode(exitCode: HrcImportCommandExitCode): string {
  switch (exitCode) {
    case 0:
      return "Review dry-run command summary; DB write remains disabled.";
    case 1:
      return "Resolve blocking validation issues before any import planning continues.";
    case 2:
      return "Resolve safety gate failure and re-run dry-run preview.";
    case 3:
      return "Remove privacy/path exposure and re-run privacy-safe dry-run preview.";
    case 4:
      return "Fix command report input shape before continuing.";
  }
}

function isValidCommandName(value: string): value is HrcImportDryRunCommandName {
  return value === "import:hrc:preview" || value === "import:hrc:dry-run";
}

function readCount(value: HrcImportCommandJsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function createSanitizer() {
  const warnings: string[] = [];

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

  function jsonValue(fieldName: string, value: HrcImportCommandJsonValue): HrcImportCommandJsonValue {
    if (typeof value === "string") {
      return string(fieldName, value);
    }

    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => jsonValue(`${fieldName}[${index}]`, item));
    }

    const sanitized: { [key: string]: HrcImportCommandJsonValue } = {};
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
    string,
    jsonValue
  };
}

function containsPrivateToken(value: string): boolean {
  return /[A-Za-z]:[\\/]|C:\\Users|sample-user|sample-private-token|sample-external-hrc-folder|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(
    value
  );
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

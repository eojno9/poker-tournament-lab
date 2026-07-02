import {
  buildHrcImportDryRunOrchestration,
  buildHrcImportNoWriteCliCommandPlan,
  getHrcImportNoWriteCliHelpText,
  guardHrcCopiedDbTargetPath,
  renderHrcImportCommandReport,
  type HrcCopiedDbPathGuardResult,
  type HrcExistingSolutionSnapshotInputRow,
  type HrcImportBackupJsonValue,
  type HrcImportCommandExitCode,
  type HrcImportCommandReport,
  type HrcImportDryRunCommandName,
  type HrcImportDryRunOrchestrationSafetyChecks,
  type HrcImportNoWriteCliCommandPlan,
  type HrcImportPreviewRow
} from "@poker-tournament-lab/core";

export interface HrcImportPreviewEntrypointContext {
  previewRows: HrcImportPreviewRow[];
  existingSolutionRows: HrcExistingSolutionSnapshotInputRow[];
  classificationSummary: HrcImportBackupJsonValue;
  safetyChecks: HrcImportDryRunOrchestrationSafetyChecks;
  dbSha256Before: string;
  dbSha256After: string;
  timestampIso: string;
  branchName: string;
  commitHash: string;
  dbFileName: string;
  targetDbPath?: string;
  productionDbPath: string;
  repoRootPath: string;
  backupRootPath: string;
}

export interface HrcImportPreviewParsedArgs {
  ok: boolean;
  commandName: HrcImportDryRunCommandName | "<invalid-command>";
  helpRequested: boolean;
  dryRunRequested: boolean;
  targetDbPathRedacted: string | null;
  copiedDbPathGuardResult?: HrcCopiedDbPathGuardResult;
  commandPlan: HrcImportNoWriteCliCommandPlan;
  errors: string[];
  warnings: string[];
  rejectedFlags: string[];
  exitCode: HrcImportCommandExitCode;
}

export interface HrcImportPreviewEntrypointResult {
  exitCode: HrcImportCommandExitCode;
  stdoutLines: string[];
  stderrLines: string[];
  report: HrcImportCommandReport | null;
  commandPlan: HrcImportNoWriteCliCommandPlan;
  writeAllowed: false;
  dbWriteAllowed: false;
  reportFileWriteAllowed: false;
}

export interface HrcImportPreviewRenderedOutput {
  stdoutLines: string[];
  stderrLines: string[];
  stdoutText: string;
  stderrText: string;
}

const ALLOWED_COMMANDS: HrcImportDryRunCommandName[] = ["import:hrc:preview", "import:hrc:dry-run"];
const VALUE_FLAGS = new Set(["--target-db", "--command-name"]);
const ALLOWED_FLAGS = new Set(["--help", "--dry-run", "--target-db", "--command-name"]);
const SAFETY_FORBIDDEN_FLAGS = new Set([
  "--write",
  "--force",
  "--db-write",
  "--production",
  "--production-db",
  "--output-json",
  "--report-json",
  "--artifact-json"
]);
const PRIVACY_FORBIDDEN_FLAGS = new Set(["--raw", "--raw-hrc", "--raw-hrc-path"]);

export function parseHrcImportPreviewArgs(
  argv: string[],
  context: HrcImportPreviewEntrypointContext
): HrcImportPreviewParsedArgs {
  const args = Array.isArray(argv) ? argv : [];
  const helpRequested = args.includes("--help");
  const dryRunRequested = args.includes("--dry-run");
  const rejectedFlags = args.filter((arg) => SAFETY_FORBIDDEN_FLAGS.has(arg) || PRIVACY_FORBIDDEN_FLAGS.has(arg));
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const flag of rejectedFlags) {
    errors.push(`forbidden flag rejected: ${flag}`);
  }

  for (const flag of args.filter((arg) => arg.startsWith("--"))) {
    if (!ALLOWED_FLAGS.has(flag) && !SAFETY_FORBIDDEN_FLAGS.has(flag) && !PRIVACY_FORBIDDEN_FLAGS.has(flag)) {
      errors.push(`unsupported flag rejected: ${redactPrivateTokens(flag)}`);
    }
  }

  const commandFlag = readFlagValue(args, "--command-name");
  const targetFlag = readFlagValue(args, "--target-db");

  if (commandFlag.seen && commandFlag.value === null) {
    errors.push("missing value for --command-name");
  }
  if (targetFlag.seen && targetFlag.value === null) {
    errors.push("missing value for --target-db");
  }

  const positionalCommand = readPositionalCommand(args);
  const commandCandidate = commandFlag.value ?? positionalCommand;
  const commandName = isAllowedCommand(commandCandidate) ? commandCandidate : "<invalid-command>";

  if (!helpRequested && commandName === "<invalid-command>") {
    errors.push("invalid or missing command name");
  }
  if (commandFlag.value !== null && positionalCommand !== null && commandFlag.value !== positionalCommand) {
    errors.push("conflicting command names were supplied");
  }
  if (!dryRunRequested && !helpRequested) {
    warnings.push("dry-run mode is assumed; write mode is unavailable");
  }

  const targetDbPath = targetFlag.value ?? context.targetDbPath ?? null;
  let copiedDbPathGuardResult: HrcCopiedDbPathGuardResult | undefined;
  if (targetDbPath !== null && targetDbPath.trim().length > 0) {
    copiedDbPathGuardResult = guardHrcCopiedDbTargetPath({
      targetDbPath,
      productionDbPath: context.productionDbPath,
      repoRootPath: context.repoRootPath,
      backupRootPath: context.backupRootPath
    });

    if (!copiedDbPathGuardResult.allowed) {
      errors.push(`copied DB target rejected: ${copiedDbPathGuardResult.decision}`);
    }
  }

  const exitCode = determineParseExitCode({
    helpRequested,
    rejectedFlags,
    errors,
    copiedDbPathGuardResult
  });
  const commandPlan = buildCommandPlan({
    originalArgs: args,
    commandName: helpRequested && commandName === "<invalid-command>" ? "import:hrc:preview" : commandName,
    helpRequested,
    rejectedFlags,
    warnings,
    copiedDbPathGuardResult,
    exitCode
  });

  const result: HrcImportPreviewParsedArgs = {
    ok: exitCode === 0,
    commandName,
    helpRequested,
    dryRunRequested,
    targetDbPathRedacted: copiedDbPathGuardResult?.normalizedTargetDbPathRedacted ?? null,
    commandPlan,
    errors: errors.map(redactPrivateTokens),
    warnings: warnings.map(redactPrivateTokens),
    rejectedFlags,
    exitCode
  };

  if (copiedDbPathGuardResult) {
    result.copiedDbPathGuardResult = copiedDbPathGuardResult;
  }

  return result;
}

export function runHrcImportPreviewEntrypoint(
  argv: string[],
  context: HrcImportPreviewEntrypointContext
): HrcImportPreviewEntrypointResult {
  const parsed = parseHrcImportPreviewArgs(argv, context);

  if (parsed.helpRequested && parsed.errors.length === 0) {
    return noReportResult({
      exitCode: 0,
      stdoutLines: buildHelpLines(),
      stderrLines: [],
      commandPlan: parsed.commandPlan
    });
  }

  if (!parsed.ok || parsed.commandName === "<invalid-command>") {
    return noReportResult({
      exitCode: parsed.exitCode,
      stdoutLines: [],
      stderrLines: parsed.errors.length > 0 ? parsed.errors : ["invalid no-write import preview input"],
      commandPlan: parsed.commandPlan
    });
  }

  const orchestration = buildHrcImportDryRunOrchestration({
    commandName: parsed.commandName,
    timestampIso: context.timestampIso,
    branchName: context.branchName,
    commitHash: context.commitHash,
    dbFileName: context.dbFileName,
    dbSha256Before: context.dbSha256Before,
    dbSha256After: context.dbSha256After,
    previewRows: context.previewRows,
    existingSolutionRows: context.existingSolutionRows,
    classificationSummary: context.classificationSummary,
    safetyChecks: context.safetyChecks
  });
  const rendered = renderHrcImportCommandReport({
    commandReport: orchestration.commandReport,
    commandPlan: parsed.commandPlan
  });

  return {
    exitCode: orchestration.exitCode,
    stdoutLines: rendered.lines.map(redactPrivateTokens),
    stderrLines: [],
    report: orchestration.commandReport,
    commandPlan: parsed.commandPlan,
    writeAllowed: false,
    dbWriteAllowed: false,
    reportFileWriteAllowed: false
  };
}

export function renderHrcImportPreviewOutput(
  result: HrcImportPreviewEntrypointResult
): HrcImportPreviewRenderedOutput {
  const stdoutLines = result.stdoutLines.map(redactPrivateTokens);
  const stderrLines = result.stderrLines.map(redactPrivateTokens);

  return {
    stdoutLines,
    stderrLines,
    stdoutText: stdoutLines.join("\n"),
    stderrText: stderrLines.join("\n")
  };
}

function noReportResult(input: {
  exitCode: HrcImportCommandExitCode;
  stdoutLines: string[];
  stderrLines: string[];
  commandPlan: HrcImportNoWriteCliCommandPlan;
}): HrcImportPreviewEntrypointResult {
  return {
    exitCode: input.exitCode,
    stdoutLines: input.stdoutLines.map(redactPrivateTokens),
    stderrLines: input.stderrLines.map(redactPrivateTokens),
    report: null,
    commandPlan: input.commandPlan,
    writeAllowed: false,
    dbWriteAllowed: false,
    reportFileWriteAllowed: false
  };
}

function buildCommandPlan(input: {
  originalArgs: string[];
  commandName: HrcImportDryRunCommandName | "<invalid-command>";
  helpRequested: boolean;
  rejectedFlags: string[];
  warnings: string[];
  copiedDbPathGuardResult: HrcCopiedDbPathGuardResult | undefined;
  exitCode: HrcImportCommandExitCode;
}): HrcImportNoWriteCliCommandPlan {
  const normalizedArgs = normalizeArgsForCorePlan(input);
  const basePlan = buildHrcImportNoWriteCliCommandPlan(normalizedArgs);
  const plan: HrcImportNoWriteCliCommandPlan = {
    ...basePlan,
    commandName: input.helpRequested && input.commandName === "<invalid-command>" ? "import:hrc:preview" : input.commandName,
    args: input.originalArgs.map(redactArgForPlan),
    rejectedFlags: [...input.rejectedFlags],
    warnings: input.warnings.map(redactPrivateTokens),
    helpText: getHrcImportPreviewHelpText(),
    requiresCopiedDbPathGuard: Boolean(input.copiedDbPathGuardResult),
    exitCodePreview: input.exitCode
  };

  if (input.copiedDbPathGuardResult) {
    return {
      ...plan,
      copiedDbPathGuardResult: input.copiedDbPathGuardResult
    };
  }

  return plan;
}

function normalizeArgsForCorePlan(input: {
  commandName: HrcImportDryRunCommandName | "<invalid-command>";
  helpRequested: boolean;
  copiedDbPathGuardResult: HrcCopiedDbPathGuardResult | undefined;
}): string[] {
  if (input.helpRequested) {
    return ["--help"];
  }

  const args: string[] = [input.commandName === "<invalid-command>" ? "import:hrc:preview" : input.commandName, "--dry-run"];
  if (input.copiedDbPathGuardResult) {
    args.push("--copied-db-path", input.copiedDbPathGuardResult.normalizedTargetDbPathRedacted);
  }

  return args;
}

function buildHelpLines(): string[] {
  return getHrcImportPreviewHelpText().split("\n").map(redactPrivateTokens);
}

function getHrcImportPreviewHelpText(): string {
  return [
    "HRC import preview entrypoint (no-write).",
    "Allowed commands: import:hrc:preview, import:hrc:dry-run.",
    "Allowed flags: --dry-run, --help, --target-db <copied-db-path>, --command-name <command>.",
    "Forbidden flags: --write, --force, --db-write, --production, --raw, --raw-hrc, --output-json, --report-json, --artifact-json.",
    getHrcImportNoWriteCliHelpText(),
    "This entrypoint returns stdout/stderr lines and an exitCode; it does not print, exit, read or write the DB, write files, or create reports."
  ].join("\n");
}

function determineParseExitCode(input: {
  helpRequested: boolean;
  rejectedFlags: string[];
  errors: string[];
  copiedDbPathGuardResult: HrcCopiedDbPathGuardResult | undefined;
}): HrcImportCommandExitCode {
  if (input.helpRequested && input.errors.length === 0) {
    return 0;
  }

  if (
    input.rejectedFlags.some((flag) => PRIVACY_FORBIDDEN_FLAGS.has(flag)) ||
    input.copiedDbPathGuardResult?.decision === "BLOCKED_RAW_HRC_PATH" ||
    input.copiedDbPathGuardResult?.decision === "BLOCKED_PRIVATE_PATH_EXPOSURE"
  ) {
    return 3;
  }

  if (input.copiedDbPathGuardResult && !input.copiedDbPathGuardResult.allowed) {
    return 2;
  }

  if (input.rejectedFlags.length > 0) {
    return 2;
  }

  if (input.errors.length > 0) {
    return 4;
  }

  return 0;
}

function readFlagValue(args: string[], flag: string): { seen: boolean; value: string | null } {
  const index = args.indexOf(flag);
  if (index === -1) {
    return { seen: false, value: null };
  }

  const value = args[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) {
    return { seen: true, value: null };
  }

  return { seen: true, value };
}

function readPositionalCommand(args: string[]): HrcImportDryRunCommandName | null {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (typeof arg !== "string") {
      continue;
    }
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg)) {
        index += 1;
      }
      continue;
    }
    if (isAllowedCommand(arg)) {
      return arg;
    }
  }

  return null;
}

function isAllowedCommand(value: string | null | undefined): value is HrcImportDryRunCommandName {
  return typeof value === "string" && ALLOWED_COMMANDS.includes(value as HrcImportDryRunCommandName);
}

function redactArgForPlan(value: string): string {
  if (value.startsWith("--")) {
    return value;
  }

  return redactPrivateTokens(value);
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

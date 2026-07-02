import {
  guardHrcCopiedDbTargetPath,
  redactHrcLocalPathForGuardOutput,
  type HrcCopiedDbPathGuardResult
} from "./hrcCopiedDbPathGuard.js";

export type HrcImportNoWriteCliCommandName = "import:hrc:preview" | "import:hrc:dry-run";

export type HrcImportNoWriteCliCommandMode = "DRY_RUN";

export type HrcImportNoWriteCliExitCodePreview = 0 | 1 | 2 | 3 | 4;

export interface HrcImportNoWriteCliCommandPlan {
  commandName: HrcImportNoWriteCliCommandName | "<invalid-command>";
  mode: HrcImportNoWriteCliCommandMode;
  args: string[];
  dryRunOnly: true;
  writeAllowed: false;
  forceAllowed: false;
  dbWriteAllowed: false;
  reportFileWriteAllowed: false;
  requiresCopiedDbPathGuard: boolean;
  copiedDbPathGuardResult?: HrcCopiedDbPathGuardResult;
  rejectedFlags: string[];
  warnings: string[];
  helpText: string;
  exitCodePreview: HrcImportNoWriteCliExitCodePreview;
}

export interface HrcImportNoWriteCliParseResult {
  ok: boolean;
  plan: HrcImportNoWriteCliCommandPlan;
  errors: string[];
  warnings: string[];
}

const ALLOWED_COMMANDS: HrcImportNoWriteCliCommandName[] = ["import:hrc:preview", "import:hrc:dry-run"];

const FORBIDDEN_FLAGS = new Set([
  "--write",
  "--force",
  "--db-write",
  "--production-db",
  "--raw-hrc-path",
  "--output-json"
]);

const ALLOWED_FLAGS = new Set(["--dry-run", "--help", "--copied-db-path"]);

const DEFAULT_PRODUCTION_DB_PATH = "<repo-root>/apps/server/data/poker-tournament-lab.db";
const DEFAULT_REPO_ROOT_PATH = "<repo-root>";
const DEFAULT_BACKUP_ROOT_PATH = "<local-backup-root>";

export function parseHrcImportNoWriteCliArgs(args: string[]): HrcImportNoWriteCliParseResult {
  return analyzeArgs(args);
}

export function buildHrcImportNoWriteCliCommandPlan(args: string[]): HrcImportNoWriteCliCommandPlan {
  return analyzeArgs(args).plan;
}

export function getHrcImportNoWriteCliHelpText(): string {
  return [
    "HRC import preview command skeleton (no-write).",
    "Allowed commands: import:hrc:preview, import:hrc:dry-run.",
    "Allowed flags: --dry-run, --help, --copied-db-path <path>.",
    "Forbidden flags: --write, --force, --db-write, --production-db, --raw-hrc-path, --output-json.",
    "This helper never reads or writes the DB, writes files, or connects product import routes."
  ].join("\n");
}

function analyzeArgs(args: string[]): HrcImportNoWriteCliParseResult {
  const inputArgs = Array.isArray(args) ? args : [];
  const commandName = readCommandName(inputArgs);
  const hasHelp = inputArgs.includes("--help");
  const rejectedFlags = inputArgs.filter((arg) => FORBIDDEN_FLAGS.has(arg));
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasHelp && commandName === "<invalid-command>") {
    errors.push("invalid or missing command name");
  }

  for (const flag of rejectedFlags) {
    errors.push(`forbidden flag rejected: ${flag}`);
  }

  for (const flag of inputArgs.filter((arg) => arg.startsWith("--"))) {
    if (!ALLOWED_FLAGS.has(flag) && !FORBIDDEN_FLAGS.has(flag)) {
      errors.push(`unsupported flag rejected: ${redactCliArg(flag)}`);
    }
  }

  const copiedDbPathParse = readFlagValue(inputArgs, "--copied-db-path");
  let copiedDbPathGuardResult: HrcCopiedDbPathGuardResult | undefined;

  if (copiedDbPathParse.seen && copiedDbPathParse.value === null) {
    errors.push("missing value for --copied-db-path");
  }

  if (copiedDbPathParse.value !== null) {
    copiedDbPathGuardResult = guardHrcCopiedDbTargetPath({
      targetDbPath: copiedDbPathParse.value,
      productionDbPath: DEFAULT_PRODUCTION_DB_PATH,
      repoRootPath: DEFAULT_REPO_ROOT_PATH,
      backupRootPath: DEFAULT_BACKUP_ROOT_PATH
    });

    if (!copiedDbPathGuardResult.allowed) {
      errors.push(`copied DB path guard rejected target: ${copiedDbPathGuardResult.decision}`);
    }
  }

  if (!inputArgs.includes("--dry-run") && !hasHelp) {
    warnings.push("dry-run mode is assumed; write mode is unavailable");
  }

  const plan: HrcImportNoWriteCliCommandPlan = {
    commandName: hasHelp && commandName === "<invalid-command>" ? "import:hrc:preview" : commandName,
    mode: "DRY_RUN",
    args: inputArgs.map(redactCliArg),
    dryRunOnly: true,
    writeAllowed: false,
    forceAllowed: false,
    dbWriteAllowed: false,
    reportFileWriteAllowed: false,
    requiresCopiedDbPathGuard: copiedDbPathParse.seen,
    rejectedFlags,
    warnings: warnings.map(redactPrivateTokens),
    helpText: getHrcImportNoWriteCliHelpText(),
    exitCodePreview: determineExitCode({
      hasHelp,
      commandName,
      rejectedFlags,
      errors,
      copiedDbPathGuardResult
    })
  };

  if (copiedDbPathGuardResult) {
    plan.copiedDbPathGuardResult = copiedDbPathGuardResult;
  }

  return {
    ok: plan.exitCodePreview === 0,
    plan,
    errors: errors.map(redactPrivateTokens),
    warnings: plan.warnings
  };
}

function readCommandName(args: string[]): HrcImportNoWriteCliCommandName | "<invalid-command>" {
  const firstNonFlag = args.find((arg) => !arg.startsWith("--"));
  return isAllowedCommand(firstNonFlag) ? firstNonFlag : "<invalid-command>";
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

function determineExitCode(input: {
  hasHelp: boolean;
  commandName: HrcImportNoWriteCliCommandName | "<invalid-command>";
  rejectedFlags: string[];
  errors: string[];
  copiedDbPathGuardResult: HrcCopiedDbPathGuardResult | undefined;
}): HrcImportNoWriteCliExitCodePreview {
  if (input.hasHelp && input.errors.length === 0) {
    return 0;
  }

  if (
    input.copiedDbPathGuardResult?.decision === "BLOCKED_RAW_HRC_PATH" ||
    input.copiedDbPathGuardResult?.decision === "BLOCKED_PRIVATE_PATH_EXPOSURE" ||
    input.rejectedFlags.includes("--raw-hrc-path")
  ) {
    return 3;
  }

  if (input.copiedDbPathGuardResult && !input.copiedDbPathGuardResult.allowed) {
    return 2;
  }

  if (input.commandName === "<invalid-command>" || input.errors.some((error) => error.startsWith("missing value"))) {
    return 4;
  }

  if (input.rejectedFlags.length > 0 || input.errors.length > 0) {
    return 1;
  }

  return 0;
}

function isAllowedCommand(value: string | undefined): value is HrcImportNoWriteCliCommandName {
  return typeof value === "string" && ALLOWED_COMMANDS.includes(value as HrcImportNoWriteCliCommandName);
}

function redactCliArg(value: string): string {
  if (value.startsWith("--")) {
    return value;
  }

  return redactPrivateTokens(redactHrcLocalPathForGuardOutput(value));
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

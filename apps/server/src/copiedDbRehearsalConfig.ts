export interface ParsedCopiedDbRehearsalArgs {
  originalArgs: string[];
  dryRun: boolean;
  consoleOnly: boolean;
  configPath: string | null;
  targetKind: string | null;
  approval: string | null;
  forbiddenFlags: string[];
  unknownFlags: string[];
  missingValueFlags: string[];
  positionalArgs: string[];
  warnings: string[];
}

const SAFE_BOOLEAN_FLAGS = new Set(["--dry-run", "--console-only"]);
const SAFE_VALUE_FLAGS = new Set(["--config", "--target-kind", "--approval"]);
const FORBIDDEN_FLAGS = new Set([
  "--write",
  "--import",
  "--apply",
  "--migrate",
  "--commit",
  "--prod",
  "--production",
  "--api",
  "--ui",
  "--live",
  "--watch",
  "--watcher",
  "--ocr",
  "--overlay",
  "--hotkey",
  "--screen-capture",
  "--poker-client",
  "--output-file",
  "--report-file"
]);
const FORBIDDEN_VALUE_FLAGS = new Set(["--output-file", "--report-file"]);

export function parseCopiedDbRehearsalArgs(argv: string[]): ParsedCopiedDbRehearsalArgs {
  const args = Array.isArray(argv) ? argv : [];
  const result: ParsedCopiedDbRehearsalArgs = {
    originalArgs: args.map(redactCopiedDbRehearsalValue),
    dryRun: false,
    consoleOnly: false,
    configPath: null,
    targetKind: null,
    approval: null,
    forbiddenFlags: [],
    unknownFlags: [],
    missingValueFlags: [],
    positionalArgs: [],
    warnings: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (typeof arg !== "string" || arg.length === 0) {
      continue;
    }

    if (!arg.startsWith("--")) {
      result.positionalArgs.push(redactCopiedDbRehearsalValue(arg));
      continue;
    }

    const parsedFlag = splitFlagValue(arg);
    const flag = parsedFlag.flag;

    if (FORBIDDEN_FLAGS.has(flag)) {
      result.forbiddenFlags.push(flag);
      if (parsedFlag.inlineValue === null && FORBIDDEN_VALUE_FLAGS.has(flag) && isFlagValue(args[index + 1])) {
        index += 1;
      }
      continue;
    }

    if (SAFE_BOOLEAN_FLAGS.has(flag)) {
      if (flag === "--dry-run") {
        result.dryRun = true;
      }
      if (flag === "--console-only") {
        result.consoleOnly = true;
      }
      if (parsedFlag.inlineValue !== null) {
        result.warnings.push("boolean flag value ignored");
      }
      continue;
    }

    if (SAFE_VALUE_FLAGS.has(flag)) {
      const inlineValue = parsedFlag.inlineValue;
      const nextValue = args[index + 1];
      const value = inlineValue ?? (isFlagValue(nextValue) ? nextValue : null);

      if (value === null) {
        result.missingValueFlags.push(flag);
        continue;
      }

      if (inlineValue === null) {
        index += 1;
      }

      assignValueFlag(result, flag, value);
      continue;
    }

    result.unknownFlags.push(redactCopiedDbRehearsalValue(flag));
  }

  return result;
}

export function redactCopiedDbRehearsalValue(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/\/Users\/[^\s/\\]+/g, "/Users/<redacted-user>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>");
}

function assignValueFlag(result: ParsedCopiedDbRehearsalArgs, flag: string, value: string): void {
  if (flag === "--config") {
    result.configPath = value;
    return;
  }

  if (flag === "--target-kind") {
    result.targetKind = value;
    return;
  }

  if (flag === "--approval") {
    result.approval = value;
  }
}

function splitFlagValue(arg: string): { flag: string; inlineValue: string | null } {
  const separatorIndex = arg.indexOf("=");
  if (separatorIndex === -1) {
    return { flag: arg, inlineValue: null };
  }

  return {
    flag: arg.slice(0, separatorIndex),
    inlineValue: arg.slice(separatorIndex + 1)
  };
}

function isFlagValue(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("--");
}

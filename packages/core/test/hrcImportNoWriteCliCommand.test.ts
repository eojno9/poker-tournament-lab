import { describe, expect, it } from "vitest";
import {
  buildHrcImportNoWriteCliCommandPlan,
  getHrcImportNoWriteCliHelpText,
  parseHrcImportNoWriteCliArgs
} from "../src/hrcImportNoWriteCliCommand.js";

describe("HRC import no-write CLI command skeleton", () => {
  it("accepts import:hrc:preview --dry-run", () => {
    const result = parseHrcImportNoWriteCliArgs(["import:hrc:preview", "--dry-run"]);

    expect(result.ok).toBe(true);
    expect(result.plan.commandName).toBe("import:hrc:preview");
    expect(result.plan.mode).toBe("DRY_RUN");
    expect(result.plan.exitCodePreview).toBe(0);
    expect(result.errors).toEqual([]);
    expectNoWriteFlags(result.plan);
  });

  it("accepts import:hrc:dry-run --dry-run", () => {
    const result = parseHrcImportNoWriteCliArgs(["import:hrc:dry-run", "--dry-run"]);

    expect(result.ok).toBe(true);
    expect(result.plan.commandName).toBe("import:hrc:dry-run");
    expect(result.plan.exitCodePreview).toBe(0);
    expectNoWriteFlags(result.plan);
  });

  it("returns help text for --help without creating output side effects", () => {
    const result = parseHrcImportNoWriteCliArgs(["--help"]);
    const helpText = getHrcImportNoWriteCliHelpText();

    expect(result.ok).toBe(true);
    expect(result.plan.helpText).toBe(helpText);
    expect(result.plan.helpText).toContain("Allowed commands");
    expect(result.plan.helpText).toContain("Forbidden flags");
    expectNoWriteFlags(result.plan);
  });

  it.each(["--write", "--force", "--db-write", "--production-db", "--raw-hrc-path", "--output-json"])(
    "rejects forbidden flag %s",
    (flag) => {
      const result = parseHrcImportNoWriteCliArgs(["import:hrc:preview", "--dry-run", flag]);

      expect(result.ok).toBe(false);
      expect(result.plan.rejectedFlags).toContain(flag);
      expect(result.errors.some((error) => error.includes(`forbidden flag rejected: ${flag}`))).toBe(true);
      expectNoWriteFlags(result.plan);
    }
  );

  it("keeps all write and force allowances false", () => {
    const plan = buildHrcImportNoWriteCliCommandPlan(["import:hrc:preview", "--dry-run"]);

    expect(plan.dryRunOnly).toBe(true);
    expect(plan.writeAllowed).toBe(false);
    expect(plan.forceAllowed).toBe(false);
    expect(plan.dbWriteAllowed).toBe(false);
    expect(plan.reportFileWriteAllowed).toBe(false);
  });

  it("accepts an allowed copied DB path through the path guard", () => {
    const result = parseHrcImportNoWriteCliArgs([
      "import:hrc:preview",
      "--dry-run",
      "--copied-db-path",
      "<local-backup-root>\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db"
    ]);

    expect(result.ok).toBe(true);
    expect(result.plan.requiresCopiedDbPathGuard).toBe(true);
    expect(result.plan.copiedDbPathGuardResult?.allowed).toBe(true);
    expect(result.plan.copiedDbPathGuardResult?.decision).toBe("ALLOWED_COPIED_DB_TARGET");
    expectNoForbiddenOutput(result);
  });

  it("rejects a production DB target through the copied DB path guard", () => {
    const result = parseHrcImportNoWriteCliArgs([
      "import:hrc:preview",
      "--dry-run",
      "--copied-db-path",
      "<repo-root>\\apps\\server\\data\\poker-tournament-lab.db"
    ]);

    expect(result.ok).toBe(false);
    expect(result.plan.exitCodePreview).toBe(2);
    expect(result.plan.copiedDbPathGuardResult?.decision).toBe("BLOCKED_PRODUCTION_DB_TARGET");
  });

  it("rejects copied DB path guard raw HRC path failures without exposing raw path text", () => {
    const result = parseHrcImportNoWriteCliArgs([
      "import:hrc:preview",
      "--dry-run",
      "--copied-db-path",
      "<local-backup-root>\\raw-hrc-folder\\poker-tournament-lab.db"
    ]);

    expect(result.ok).toBe(false);
    expect(result.plan.exitCodePreview).toBe(3);
    expect(result.plan.copiedDbPathGuardResult?.decision).toBe("BLOCKED_RAW_HRC_PATH");
    expectNoForbiddenOutput(result);
  });

  it("redacts private copied DB path values from plan args and guard output", () => {
    const result = parseHrcImportNoWriteCliArgs([
      "import:hrc:preview",
      "--dry-run",
      "--copied-db-path",
      "C:\\Users\\sample-user\\Documents\\GTO Lab Backup\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db"
    ]);

    expect(result.plan.args).toContain("<redacted-local-path>/poker-tournament-lab.db");
    expectNoForbiddenOutput(result);
  });

  it("does not expose email-like or user-token arguments in output", () => {
    const result = parseHrcImportNoWriteCliArgs([
      "import:hrc:preview",
      "--dry-run",
      "--unknown",
      "hero@example.com",
      "sample-private-token"
    ]);

    expect(result.ok).toBe(false);
    expectNoForbiddenOutput(result);
  });

  it("rejects missing command input as invalid input", () => {
    const result = parseHrcImportNoWriteCliArgs(["--dry-run"]);

    expect(result.ok).toBe(false);
    expect(result.plan.commandName).toBe("<invalid-command>");
    expect(result.plan.exitCodePreview).toBe(4);
  });

  it("rejects missing copied DB path value as invalid input", () => {
    const result = parseHrcImportNoWriteCliArgs(["import:hrc:preview", "--dry-run", "--copied-db-path"]);

    expect(result.ok).toBe(false);
    expect(result.plan.exitCodePreview).toBe(4);
    expect(result.errors).toContain("missing value for --copied-db-path");
  });

  it("uses only injected args and never reports process, console, fs, DB, API, or file write operations", () => {
    const result = parseHrcImportNoWriteCliArgs(["import:hrc:preview", "--dry-run"]);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("process.argv");
    expect(serialized).not.toContain("console.log");
    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("existsSync");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("mkdir");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function expectNoWriteFlags(plan: ReturnType<typeof buildHrcImportNoWriteCliCommandPlan>): void {
  expect(plan.dryRunOnly).toBe(true);
  expect(plan.writeAllowed).toBe(false);
  expect(plan.forceAllowed).toBe(false);
  expect(plan.dbWriteAllowed).toBe(false);
  expect(plan.reportFileWriteAllowed).toBe(false);
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("hero@example.com");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toContain("raw hrc");
}

import { describe, expect, it } from "vitest";
import { runCopiedDbRehearsalCli } from "../src/cli/copiedDbRehearsal.js";
import { parseCopiedDbRehearsalArgs } from "../src/copiedDbRehearsalConfig.js";
import { renderCopiedDbRehearsalReport } from "../src/copiedDbRehearsalReport.js";
import { evaluateCopiedDbSafetyGate } from "../src/copiedDbSafetyGate.js";

const VALID_ARGS = [
  "--dry-run",
  "--config",
  "local-copied-rehearsal.config.json",
  "--target-kind",
  "copied-local",
  "--approval",
  "approve-local-rehearsal",
  "--console-only"
];

describe("copied DB rehearsal dry-run skeleton", () => {
  it("blocks missing --dry-run", () => {
    const result = runCopiedDbRehearsalCli(VALID_ARGS.filter((arg) => arg !== "--dry-run"));

    expect(result.exitCode).toBe(1);
    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.reportText).toContain("Refused: dry-run mode is required.");
    expectNoForbiddenOutput(result);
  });

  it("blocks missing config", () => {
    const result = runCopiedDbRehearsalCli(["--dry-run", "--target-kind", "copied-local", "--console-only"]);

    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.reportText).toContain("Refused: local config is required.");
    expectNoForbiddenOutput(result);
  });

  it("blocks missing console-only output", () => {
    const result = runCopiedDbRehearsalCli(VALID_ARGS.filter((arg) => arg !== "--console-only"));

    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.reportText).toContain("Refused: console-only output is required.");
    expectNoForbiddenOutput(result);
  });

  it("blocks target kind other than copied-local", () => {
    const result = runCopiedDbRehearsalCli([
      "--dry-run",
      "--config",
      "local-copied-rehearsal.config.json",
      "--target-kind",
      "production",
      "--approval",
      "approve-local-rehearsal",
      "--console-only"
    ]);

    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.reportText).toContain("Refused: copied-local target kind is required.");
    expect(result.reportText).toContain("Refused: production targets are not supported.");
  });

  it("blocks missing local rehearsal approval", () => {
    const result = runCopiedDbRehearsalCli([
      "--dry-run",
      "--config",
      "local-copied-rehearsal.config.json",
      "--target-kind",
      "copied-local",
      "--console-only"
    ]);

    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.reportText).toContain("Refused: local rehearsal approval is required.");
    expectNoForbiddenOutput(result);
  });

  it("blocks production-like target or path wording", () => {
    const result = runCopiedDbRehearsalCli([
      "--dry-run",
      "--config",
      "configs/production/rehearsal.json",
      "--target-kind",
      "copied-local",
      "--approval",
      "approve-local-rehearsal",
      "--console-only"
    ]);

    expect(result.safetyGate.productionDbStatus).toBe("blocked");
    expect(result.reportText).toContain("Refused: production targets are not supported.");
  });

  it("blocks raw DB path-like config strings", () => {
    const result = runCopiedDbRehearsalCli([
      "--dry-run",
      "--config",
      "copied-rehearsal/poker-tournament-lab.db",
      "--target-kind",
      "copied-local",
      "--approval",
      "approve-local-rehearsal",
      "--console-only"
    ]);

    expect(result.safetyGate.rawDataStatus).toBe("blocked");
    expect(result.reportText).toContain("Refused: raw data inputs are not supported.");
  });

  it("blocks raw zip or archive path-like config strings", () => {
    const result = runCopiedDbRehearsalCli([
      "--dry-run",
      "--config",
      "copied-rehearsal/raw-input.zip",
      "--target-kind",
      "copied-local",
      "--approval",
      "approve-local-rehearsal",
      "--console-only"
    ]);

    expect(result.safetyGate.rawDataStatus).toBe("blocked");
    expect(result.reportText).toContain("Refused: raw data inputs are not supported.");
  });

  it.each(["--write", "--import", "--apply", "--migrate", "--commit"])(
    "blocks write-like flag %s",
    (flag) => {
      const result = runCopiedDbRehearsalCli([...VALID_ARGS, flag]);

      expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
      expect(result.reportText).toContain("Refused: write operations are not available for this command.");
    }
  );

  it.each(["--api", "--ui"])("blocks API/UI flag %s", (flag) => {
    const result = runCopiedDbRehearsalCli([...VALID_ARGS, flag]);

    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.reportText).toContain("Refused: API/UI/live integrations are not supported.");
  });

  it.each(["--live", "--watch", "--watcher", "--ocr", "--overlay", "--hotkey", "--screen-capture", "--poker-client"])(
    "blocks live-scope flag %s",
    (flag) => {
      const result = runCopiedDbRehearsalCli([...VALID_ARGS, flag]);

      expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
      expect(result.reportText).toContain("Refused: this tool is for off-table study only.");
    }
  );

  it.each(["--output-file", "--report-file"])("blocks generated report output flag %s", (flag) => {
    const result = runCopiedDbRehearsalCli([...VALID_ARGS, flag, "report.json"]);

    expect(result.safetyGate.verdict).toBe("DRY_RUN_BLOCKED");
    expect(result.safetyGate.reportFileWriteAllowed).toBe(false);
    expect(result.reportText).toContain("Refused: generated report output is not available for this command.");
  });

  it("passes valid copied-local dry-run args", () => {
    const result = runCopiedDbRehearsalCli(VALID_ARGS);

    expect(result.exitCode).toBe(0);
    expect(result.safetyGate.verdict).toBe("DRY_RUN_PASS");
    expect(result.safetyGate.allowed).toBe(true);
    expect(result.safetyGate.dbWriteAllowed).toBe(false);
    expect(result.safetyGate.productionDbWriteAllowed).toBe(false);
    expect(result.safetyGate.reportFileWriteAllowed).toBe(false);
    expect(result.reportText).toContain("Mode: dry-run");
    expect(result.reportText).toContain("Write status: no-write");
    expect(result.reportText).toContain("Raw data status: not accessed");
    expect(result.reportText).toContain("Production DB status: not targeted");
    expect(result.reportText).toContain("Scope: off-table study only");
    expect(result.reportText).toContain("Verdict: DRY_RUN_PASS");
    expectNoForbiddenOutput(result);
  });

  it("renders blocked output without source/provider/dataset/permission wording", () => {
    const result = runCopiedDbRehearsalCli(["--dry-run", "--provider", "private", "--console-only"]);
    const report = renderCopiedDbRehearsalReport(result.safetyGate);
    const lowerReport = report.toLowerCase();

    expect(report).toContain("Verdict: DRY_RUN_BLOCKED");
    expect(lowerReport).not.toContain("source");
    expect(lowerReport).not.toContain("provider");
    expect(lowerReport).not.toContain("dataset");
    expect(lowerReport).not.toContain("permission");
    expectNoForbiddenOutput(report);
  });

  it("parses args without reading config files", () => {
    const parsed = parseCopiedDbRehearsalArgs(VALID_ARGS);

    expect(parsed.configPath).toBe("local-copied-rehearsal.config.json");
    expect(parsed.targetKind).toBe("copied-local");
    expect(parsed.dryRun).toBe(true);
    expect(parsed.consoleOnly).toBe(true);
  });

  it("returns non-zero exit code for unsafe input through CLI skeleton", () => {
    const result = runCopiedDbRehearsalCli(["--config", "local-copied-rehearsal.config.json", "--console-only"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderrLines).toContain("Refused: dry-run mode is required.");
  });

  it("can emit console-ready output through injected writers", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const result = runCopiedDbRehearsalCli(["--config", "local-copied-rehearsal.config.json"], {
      writeStdout: (text) => stdout.push(text),
      writeStderr: (text) => stderr.push(text)
    });

    expect(result.exitCode).toBe(1);
    expect(stdout.join("\n")).toContain("Verdict: DRY_RUN_BLOCKED");
    expect(stderr.join("\n")).toContain("Refused: dry-run mode is required.");
  });

  it("keeps implementation result free of file IO, DB, raw archive, and generated artifact claims", () => {
    const result = runCopiedDbRehearsalCli(VALID_ARGS);
    const serialized = JSON.stringify(result);

    for (const token of ["readFile", "writeFile", "sqlite", "generated artifact created", "artifacts/latest"]) {
      expect(serialized).not.toContain(token);
    }
  });
});

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);
  const lowerSerialized = serialized.toLowerCase();
  const privateRelayLiteral = `@${["privaterelay", "appleid", "com"].join(".")}`;

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("C:/Users");
  expect(serialized).not.toContain(privateRelayLiteral);
  expect(lowerSerialized).not.toContain("provided by");
  expect(lowerSerialized).not.toContain("permission granted");
  expect(lowerSerialized).not.toContain("poker client integration enabled");
}

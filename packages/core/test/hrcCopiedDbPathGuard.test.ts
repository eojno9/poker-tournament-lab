import { describe, expect, it } from "vitest";
import {
  guardHrcCopiedDbTargetPath,
  normalizeHrcDbPathForComparison,
  redactHrcLocalPathForGuardOutput,
  type HrcCopiedDbPathGuardInput
} from "../src/hrcCopiedDbPathGuard.js";

describe("HRC copied DB path guard", () => {
  it("allows a copied DB target under the approved backup root", () => {
    const result = guardHrcCopiedDbTargetPath(validInput());

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe("ALLOWED_COPIED_DB_TARGET");
    expect(result.normalizedTargetDbPathRedacted).toBe(
      "<local-backup-root>/v3.0-copied-db-rehearsal-20260620-120000/poker-tournament-lab.db"
    );
    expectNoForbiddenOutput(result);
  });

  it("blocks the production DB target even when slash style differs", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath: " <repo-root>/apps/server/data/poker-tournament-lab.db ",
        productionDbPath: "<repo-root>\\apps\\server\\data\\poker-tournament-lab.db"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_PRODUCTION_DB_TARGET");
  });

  it("blocks targets under the repo root", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath: "<repo-root>\\tmp\\copied-db\\poker-tournament-lab.db"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_REPO_LOCAL_TARGET");
  });

  it("blocks non-.db target files", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath: "<local-backup-root>\\v3.0-copied-db-rehearsal-20260620-120000\\notes.txt"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_INVALID_EXTENSION");
  });

  it("blocks SQLite sidecar shm files", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath: "<local-backup-root>\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db-shm"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_SIDE_CAR_FILE");
  });

  it("blocks SQLite sidecar wal files", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath: "<local-backup-root>\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db-wal"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_SIDE_CAR_FILE");
  });

  it("blocks an empty target path", () => {
    const result = guardHrcCopiedDbTargetPath(validInput({ targetDbPath: "   " }));

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_EMPTY_PATH");
  });

  it("blocks raw HRC path markers", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath: "<local-backup-root>\\raw-hrc-folder\\poker-tournament-lab.db"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_RAW_HRC_PATH");
    expectNoForbiddenOutput(result);
  });

  it("redacts private local paths from allowed output", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath:
          "C:\\Users\\sample-user\\Documents\\GTO Lab Backup\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db",
        backupRootPath: "C:\\Users\\sample-user\\Documents\\GTO Lab Backup"
      })
    );

    expect(result.allowed).toBe(true);
    expect(result.decision).toBe("ALLOWED_COPIED_DB_TARGET");
    expect(result.normalizedTargetDbPathRedacted).toBe("<redacted-local-path>/poker-tournament-lab.db");
    expectNoForbiddenOutput(result);
  });

  it("can block private local paths when placeholder-only mode is requested", () => {
    const result = guardHrcCopiedDbTargetPath(
      validInput({
        targetDbPath:
          "C:\\Users\\sample-user\\Documents\\GTO Lab Backup\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db",
        backupRootPath: "C:\\Users\\sample-user\\Documents\\GTO Lab Backup",
        allowPlaceholderPathsOnly: true
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.decision).toBe("BLOCKED_PRIVATE_PATH_EXPOSURE");
    expectNoForbiddenOutput(result);
  });

  it("normalizes slash style, case, spaces, and trailing slash for comparison", () => {
    expect(normalizeHrcDbPathForComparison("  <repo-root>\\Apps\\Server\\Data\\  ")).toBe(
      "<repo-root>/Apps/Server/Data"
    );
  });

  it("redacts local paths, raw path markers, user tokens, and email-like values", () => {
    const localPath = redactHrcLocalPathForGuardOutput(
      "C:\\Users\\sample-user\\Documents\\GTO Lab Backup\\poker-tournament-lab.db"
    );
    const rawPath = redactHrcLocalPathForGuardOutput("<local-backup-root>\\raw-hrc-folder\\raw.db");
    const emailPath = redactHrcLocalPathForGuardOutput("<local-backup-root>\\hero@example.com\\copy.db");

    expect(localPath).toBe("<redacted-local-path>/poker-tournament-lab.db");
    expect(rawPath).toBe("<redacted-hrc-path>/raw.db");
    expect(emailPath).not.toContain("hero@example.com");
    expectNoForbiddenOutput({ localPath, rawPath, emailPath });
  });

  it("uses plain string logic without filesystem, DB, API, command, or report operations", () => {
    const result = guardHrcCopiedDbTargetPath(validInput());
    const serialized = JSON.stringify(result);

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

function validInput(overrides: Partial<HrcCopiedDbPathGuardInput> = {}): HrcCopiedDbPathGuardInput {
  return {
    targetDbPath:
      "<local-backup-root>\\v3.0-copied-db-rehearsal-20260620-120000\\poker-tournament-lab.db",
    productionDbPath: "<repo-root>\\apps\\server\\data\\poker-tournament-lab.db",
    repoRootPath: "<repo-root>",
    backupRootPath: "<local-backup-root>",
    ...overrides
  };
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toContain("raw hrc");
}

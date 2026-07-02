import { describe, expect, it } from "vitest";
import type { HrcCopiedDbPathGuardResult } from "../src/hrcCopiedDbPathGuard.js";
import {
  assertNoHrcCopiedDbApprovalForbiddenExposure,
  buildHrcCopiedDbTargetApprovalContract,
  summarizeHrcCopiedDbTargetApprovalContract,
  type HrcCopiedDbTargetApprovalContractInput
} from "../src/hrcCopiedDbTargetApprovalContract.js";

describe("HRC copied DB target approval contract helper", () => {
  it("marks an explicit token-approved copied DB write rehearsal as eligible without enabling writes", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(validInput());
    const summary = summarizeHrcCopiedDbTargetApprovalContract(contract);

    expect(contract.ok).toBe(true);
    expect(contract.decision).toBe("ELIGIBLE_COPIED_DB_REHEARSAL_APPROVAL");
    expect(contract.approvalRequired).toBe(true);
    expect(contract.approvalRecorded).toBe(true);
    expect(contract.futureCopiedDbWriteRehearsalEligible).toBe(true);
    expect(contract.approvalTokenStored).toBe(false);
    expect(contract.productionDbWriteAllowed).toBe(false);
    expect(contract.copiedDbWriteAllowed).toBe(false);
    expect(contract.reportFileWriteAllowed).toBe(false);
    expect(summary.futureCopiedDbWriteRehearsalEligible).toBe(true);
    expectNoForbiddenOutput(contract);
  });

  it("supports explicit flag approval without storing a token", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        approvalMode: "EXPLICIT_FLAG",
        approvalFlagPresent: true,
        approvalToken: undefined,
        expectedApprovalToken: undefined
      })
    );

    expect(contract.ok).toBe(true);
    expect(contract.decision).toBe("ELIGIBLE_COPIED_DB_REHEARSAL_APPROVAL");
    expect(contract.approvalRecorded).toBe(true);
    expect(contract.approvalTokenStored).toBe(false);
    expectNoForbiddenOutput(contract);
  });

  it("treats preview-only requests as safe without copied DB write approval", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        requestedOperation: "PREVIEW_ONLY",
        approvalMode: "NONE",
        approvalToken: undefined,
        expectedApprovalToken: undefined,
        copiedDbWriteRequested: false
      })
    );

    expect(contract.ok).toBe(true);
    expect(contract.decision).toBe("PREVIEW_ONLY_NO_APPROVAL_REQUIRED");
    expect(contract.approvalRequired).toBe(false);
    expect(contract.futureCopiedDbWriteRehearsalEligible).toBe(false);
  });

  it("blocks copied DB write rehearsal when approval is missing", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        approvalMode: "NONE",
        approvalToken: undefined,
        expectedApprovalToken: undefined
      })
    );

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_MISSING_APPROVAL");
    expect(contract.futureCopiedDbWriteRehearsalEligible).toBe(false);
  });

  it("blocks copied DB write rehearsal when token approval does not match", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        approvalToken: "wrong-token"
      })
    );

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_INVALID_APPROVAL");
    expect(contract.approvalRecorded).toBe(true);
    expect(contract.futureCopiedDbWriteRehearsalEligible).toBe(false);
    expectNoForbiddenOutput(contract);
  });

  it("blocks when the copied DB path guard rejects the target", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        copiedDbPathGuardResult: pathGuardResult({
          allowed: false,
          decision: "BLOCKED_PRODUCTION_DB_TARGET",
          reasons: ["target DB path matches production DB path"]
        })
      })
    );

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_COPIED_DB_TARGET");
    expect(contract.futureCopiedDbWriteRehearsalEligible).toBe(false);
  });

  it("blocks production DB write requests even with approval", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        productionDbWriteRequested: true
      })
    );

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_PRODUCTION_DB_WRITE");
    expect(contract.productionDbWriteAllowed).toBe(false);
  });

  it("blocks schema migration requests", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(validInput({ schemaMigrationRequested: true }));

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_SCHEMA_MIGRATION");
  });

  it("blocks product import route, API, or UI exposure requests", () => {
    const routeContract = buildHrcCopiedDbTargetApprovalContract(
      validInput({ productImportRouteConnectionRequested: true })
    );
    const apiUiContract = buildHrcCopiedDbTargetApprovalContract(validInput({ apiUiImportFlowRequested: true }));

    expect(routeContract.decision).toBe("BLOCKED_PRODUCT_IMPORT_SURFACE");
    expect(apiUiContract.decision).toBe("BLOCKED_PRODUCT_IMPORT_SURFACE");
  });

  it("blocks package script requests", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(validInput({ packageScriptRequested: true }));

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_PACKAGE_SCRIPT");
  });

  it("blocks raw HRC access requests", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(validInput({ rawHrcAccessRequested: true }));

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_RAW_HRC_ACCESS");
  });

  it("blocks report JSON write requests", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(validInput({ reportJsonWriteRequested: true }));

    expect(contract.ok).toBe(false);
    expect(contract.decision).toBe("BLOCKED_REPORT_JSON_WRITE");
    expect(contract.reportFileWriteAllowed).toBe(false);
  });

  it("redacts forbidden local/private/email path strings from output", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(
      validInput({
        rehearsalId: "C:\\Users\\sample-user\\sample-private-token@example.test\\approval",
        copiedDbPathGuardResult: pathGuardResult({
          normalizedTargetDbPathRedacted:
            "C:\\Users\\sample-user\\Documents\\sample-external-hrc-folder\\poker-tournament-lab.db",
          warnings: ["sample-private-token@example.test required redaction"]
        })
      })
    );

    expect(contract.warnings.length).toBeGreaterThan(0);
    expect(assertNoHrcCopiedDbApprovalForbiddenExposure(contract)).toBe(true);
    expectNoForbiddenOutput(contract);
  });

  it("uses only in-memory inputs without filesystem, DB, API, process, console, Date.now, random, or report operations", () => {
    const contract = buildHrcCopiedDbTargetApprovalContract(validInput());
    const serialized = JSON.stringify({
      contract,
      buildSource: buildHrcCopiedDbTargetApprovalContract.toString()
    });

    expect(serialized).not.toContain("fs.");
    expect(serialized).not.toContain("readFile");
    expect(serialized).not.toContain("writeFile");
    expect(serialized).not.toContain("sqlite");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("process.argv");
    expect(serialized).not.toContain("process.exit");
    expect(serialized).not.toContain("console.log");
    expect(serialized).not.toContain("Date.now");
    expect(serialized).not.toContain("Math.random");
    expect(serialized).not.toContain("artifacts/hrc-dry-run-reports");
  });
});

function validInput(
  overrides: Partial<HrcCopiedDbTargetApprovalContractInput> = {}
): HrcCopiedDbTargetApprovalContractInput {
  return {
    rehearsalId: "v3.1-copied-db-approval-001",
    requestedOperation: "COPIED_DB_WRITE_REHEARSAL",
    approvalMode: "EXPLICIT_TOKEN",
    approvalToken: "approve-copied-db-rehearsal",
    expectedApprovalToken: "approve-copied-db-rehearsal",
    copiedDbPathGuardResult: pathGuardResult(),
    copiedDbWriteRequested: true,
    productionDbWriteRequested: false,
    schemaMigrationRequested: false,
    productImportRouteConnectionRequested: false,
    apiUiImportFlowRequested: false,
    packageScriptRequested: false,
    rawHrcAccessRequested: false,
    reportJsonWriteRequested: false,
    ...overrides
  };
}

function pathGuardResult(overrides: Partial<HrcCopiedDbPathGuardResult> = {}): HrcCopiedDbPathGuardResult {
  return {
    allowed: true,
    decision: "ALLOWED_COPIED_DB_TARGET",
    normalizedTargetDbPathRedacted:
      "<local-backup-root>/v3.1-copied-db-rehearsal-20260628-120000/poker-tournament-lab.db",
    normalizedProductionDbPathRedacted: "<repo-root>/apps/server/data/poker-tournament-lab.db",
    reasons: ["target DB path is under the copied DB backup root"],
    warnings: [],
    ...overrides
  };
}

function expectNoForbiddenOutput(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain("C:\\Users");
  expect(serialized).not.toContain("sample-user");
  expect(serialized).not.toContain("sample-private-token");
  expect(serialized).not.toContain("sample@example.test");
  expect(serialized).not.toContain("sample-external-hrc-folder");
  expect(serialized).not.toContain("private@example.invalid");
  expect(serialized).not.toContain("raw hrc");
}

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { convertHrcRawNodeToMultiActionStrategy } from "../src/index.js";
import { buildHrcRawZipDryRunReport } from "./helpers/hrcRawZipDryRunReader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");
const rawZipFileName = "mtt_10p_btn_vs_co_open_25bb_bba_chipev_depth3.zip";
const defaultRawZipPath = join(homedir(), "<sample-external-hrc-folder>", "Gto\uC790\uB8CC", "<sample-external-hrc-folder> \uC790\uB8CC)", rawZipFileName);
const rawZipPath = process.env.HRC_RAW_ZIP_PATH ?? defaultRawZipPath;

describe("HRC raw zip dry-run reader", () => {
  it("returns a safe not_found report when the repo-external raw zip is unavailable", () => {
    const report = buildHrcRawZipDryRunReport(join(homedir(), "missing-hrc-raw-export.zip"), repoRoot);

    expect(report.status).toBe("ZIP_NOT_FOUND");
    expect(report.zipDetected).toBe(false);
    expect(report.zipPathMasked).toBe("<repo-external>/missing-hrc-raw-export.zip");
    expect(report.zipPathMasked).not.toContain(homedir());
    expect(report.rawZipCommitted).toBe(false);
    expect(report.productImportConnected).toBe(false);
    expect(report.amountUnit).toBe("UNKNOWN");
    expect(report.amountInterpretation).toBe("RAW_HRC_AMOUNT_UNINTERPRETED");
    expect(report.warnings).toEqual(["raw HRC zip fixture not provided"]);
    expect(report.errors).toHaveLength(0);
  });

  it("reads settings.json and nodes/0.json from the raw HRC zip without extracting or importing", () => {
    const report = buildHrcRawZipDryRunReport(rawZipPath, repoRoot);

    if (!existsSync(rawZipPath)) {
      expect(report.status).toBe("ZIP_NOT_FOUND");
      expect(report.zipDetected).toBe(false);
      return;
    }

    expect(report.status).toBe("OK");
    expect(report.zipDetected).toBe(true);
    expect(report.zipPathMasked).toBe(`<repo-external>/${rawZipFileName}`);
    expect(report.zipPathMasked).not.toContain(homedir());
    expect(report.zipPathInsideRepo).toBe(false);
    expect(report.entryCount).toBe(2);
    expect(report.hasSettingsJson).toBe(true);
    expect(report.nodeEntryCount).toBe(1);
    expect(report.nodeEntriesSample).toEqual(["nodes/0.json"]);
    expect(report.selectedNodeEntry).toBe("nodes/0.json");
    expect(report.selectedNodeReason).toBe("nodes/0.json is present and is the default dry-run node");
    expect(report.multipleNodeEntriesDetected).toBe(false);
    expect(report.nodeSelectionPolicy).toBe("PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST");
    expect(report.multiNodeAggregationApplied).toBe(false);
    expect(report.settingsTopLevelKeys).toEqual(expect.arrayContaining(["handdata", "eqmodel", "treeconfig", "engine"]));
    expect(report.nodeTopLevelKeys).toEqual(expect.arrayContaining(["actions", "hands", "sequence"]));
    expect(report.rawNodeRecognized).toBe(true);
    expect(report.actionCount).toBe(3);
    expect(report.handCount).toBe(169);
    expect(report.sequenceLength).toBe(6);
    expect(report.privacySafe).toBe(true);
    expect(report.privacyPatternMatches).toHaveLength(0);
    expect(report.rawZipCommitted).toBe(false);
    expect(report.productImportConnected).toBe(false);
    expect(report.amountUnit).toBe("UNKNOWN");
    expect(report.amountInterpretation).toBe("RAW_HRC_AMOUNT_UNINTERPRETED");
    expect(report.adapterCandidateBuilt).toBe(true);
    expect(report.adapterReportSummary).toEqual(
      expect.objectContaining({
        sourceShape: "HRC_RAW_NODE",
        targetShape: "APP_V2_MULTI_ACTION_CANDIDATE",
        handCount: 169,
        actionCount: 3,
        candidateValidatorPass: true,
        amountUnit: "UNKNOWN",
        productImportRouteConnected: false
      })
    );
    expect(report.adapterValidatorPass).toBe(true);
    expect(report.validatorResult.valid).toBe(true);
    expect(report.validatorResult.pass).toBe(true);
    expect(report.validatorResult.errorCount).toBe(0);
    expect(report.validatorResult.warningCount).toBe(report.adapterReport?.candidateValidator.warningMessages.length);
    expect(report.validatorResult.checkedHands).toBe(169);
    expect(report.validatorResult.expectedHands).toBe(169);
    expect(report.validatorResult.sourceLabel).toBe("APP_V2_MULTI_ACTION_CANDIDATE");
    expect(report.mismatchSummary).toEqual({
      hasMismatch: false,
      mismatchCount: 0,
      categories: [],
      sample: [],
      fatal: false
    });
    expect(report.adapterReport?.candidateValidator.valid).toBe(true);
    expect(report.adapterReport?.handCount).toBe(169);
    expect(report.adapterReport?.actionCount).toBe(3);
    expect(report.adapterReport?.amountSemantics.amountUnit).toBe("UNKNOWN");
    expect(report.adapterReport?.amountSemantics.bbConversionApplied).toBe(false);
    expect(report.adapterReport?.amountSemantics.chipConversionApplied).toBe(false);
    expect(JSON.stringify(report)).not.toContain(rawZipPath);
  });

  it("reports missing settings.json without promoting the zip to product import", () => {
    withTempZip({ "nodes/0.json": JSON.stringify(validNode()) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("SETTINGS_MISSING");
      expect(report.hasSettingsJson).toBe(false);
      expect(report.nodeEntryCount).toBe(1);
      expect(report.rawZipCommitted).toBe(false);
      expect(report.productImportConnected).toBe(false);
      expect(report.errors).toContain("settings.json was not found in raw HRC zip");
    });
  });

  it("reports missing nodes/*.json without extracting the archive", () => {
    withTempZip({ "settings.json": JSON.stringify(validSettings()) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("NODE_MISSING");
      expect(report.hasSettingsJson).toBe(true);
      expect(report.nodeEntryCount).toBe(0);
      expect(report.selectedNodeEntry).toBeNull();
      expect(report.errors).toContain("nodes/*.json was not found in raw HRC zip");
    });
  });

  it("reports malformed settings.json and malformed nodes/0.json separately", () => {
    withTempZip({ "settings.json": "{", "nodes/0.json": JSON.stringify(validNode()) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("SETTINGS_PARSE_ERROR");
      expect(report.errors).toContain("settings.json is malformed JSON");
    });

    withTempZip({ "settings.json": JSON.stringify(validSettings()), "nodes/0.json": "{" }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("NODE_PARSE_ERROR");
      expect(report.errors).toContain("nodes/0.json is malformed JSON");
    });
  });

  it("reports invalid raw node shape when actions or hands are missing", () => {
    withTempZip({ "settings.json": JSON.stringify(validSettings()), "nodes/0.json": JSON.stringify({ hands: {}, sequence: [] }) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("RAW_NODE_SHAPE_INVALID");
      expect(report.rawNodeRecognized).toBe(false);
      expect(report.errors).toContain("raw HRC node shape was not recognized");
    });

    withTempZip({ "settings.json": JSON.stringify(validSettings()), "nodes/0.json": JSON.stringify({ actions: [], sequence: [] }) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("RAW_NODE_SHAPE_INVALID");
      expect(report.rawNodeRecognized).toBe(false);
      expect(report.errors).toContain("raw HRC node shape was not recognized");
    });
  });

  it("keeps played[] and evs[] length mismatch as adapter warnings instead of product import", () => {
    const node = validNode();
    node.hands.AA = { weight: 1, played: [1], evs: [0] };

    withTempZip({ "settings.json": JSON.stringify(validSettings()), "nodes/0.json": JSON.stringify(node) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

      expect(report.status).toBe("OK");
      expect(report.adapterReport?.handsWithLengthMismatch).toContain("AA");
      expect(report.adapterReport?.handsWithMissingPlayed).toContain("AA");
      expect(report.adapterReport?.handsWithMissingEvs).toContain("AA");
      expect(report.adapterReportSummary).toEqual(
        expect.objectContaining({
          lengthMismatchCount: 1,
          missingPlayedCount: 1,
          missingEvsCount: 1
        })
      );
      expect(report.mismatchSummary.hasMismatch).toBe(true);
      expect(report.mismatchSummary.categories).toEqual(expect.arrayContaining(["length_mismatch", "missing_played", "missing_evs"]));
      expect(report.mismatchSummary.sample.length).toBeLessThanOrEqual(3);
      expect(report.mismatchSummary.fatal).toBe(false);
      expect(report.productImportConnected).toBe(false);
    });
  });

  it("selects nodes/0.json when multiple node entries are present", () => {
    withTempZip(
      {
        "settings.json": JSON.stringify(validSettings()),
        "nodes/1.json": JSON.stringify(validNode()),
        "nodes/0.json": JSON.stringify(validNode())
      },
      (zipPath) => {
        const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

        expect(report.status).toBe("OK");
        expect(report.nodeEntryCount).toBe(2);
        expect(report.nodeEntriesSample).toEqual(["nodes/0.json", "nodes/1.json"]);
        expect(report.selectedNodeEntry).toBe("nodes/0.json");
        expect(report.selectedNodeReason).toBe("nodes/0.json is present and is the default dry-run node");
        expect(report.multipleNodeEntriesDetected).toBe(true);
        expect(report.multiNodeAggregationApplied).toBe(false);
        expect(report.warnings).toEqual(
          expect.arrayContaining(["MULTIPLE_NODE_ENTRIES", "multi-node aggregation is not applied in v2.5 dry-run reports"])
        );
      }
    );
  });

  it("selects the first node entry by lexical order when nodes/0.json is absent", () => {
    withTempZip(
      {
        "settings.json": JSON.stringify(validSettings()),
        "nodes/2.json": JSON.stringify(validNode()),
        "nodes/10.json": JSON.stringify(validNode())
      },
      (zipPath) => {
        const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

        expect(report.status).toBe("OK");
        expect(report.nodeEntryCount).toBe(2);
        expect(report.nodeEntriesSample).toEqual(["nodes/10.json", "nodes/2.json"]);
        expect(report.selectedNodeEntry).toBe("nodes/10.json");
        expect(report.selectedNodeReason).toBe("nodes/0.json is absent; selected first nodes/*.json entry by lexical order");
        expect(report.multipleNodeEntriesDetected).toBe(true);
        expect(report.nodeSelectionPolicy).toBe("PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST");
        expect(report.multiNodeAggregationApplied).toBe(false);
        expect(report.warnings).toContain("MULTIPLE_NODE_ENTRIES");
      }
    );
  });

  it("caps nodeEntriesSample while preserving the full node count", () => {
    withTempZip(
      {
        "settings.json": JSON.stringify(validSettings()),
        "nodes/0.json": JSON.stringify(validNode()),
        "nodes/1.json": JSON.stringify(validNode()),
        "nodes/2.json": JSON.stringify(validNode()),
        "nodes/3.json": JSON.stringify(validNode()),
        "nodes/4.json": JSON.stringify(validNode()),
        "nodes/5.json": JSON.stringify(validNode())
      },
      (zipPath) => {
        const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);

        expect(report.status).toBe("OK");
        expect(report.nodeEntryCount).toBe(6);
        expect(report.nodeEntriesSample).toEqual(["nodes/0.json", "nodes/1.json", "nodes/2.json", "nodes/3.json", "nodes/4.json"]);
        expect(report.nodeEntriesSample).toHaveLength(5);
        expect(report.selectedNodeEntry).toBe("nodes/0.json");
        expect(report.multipleNodeEntriesDetected).toBe(true);
        expect(report.multiNodeAggregationApplied).toBe(false);
      }
    );
  });

  it("reports privacy warnings without exposing raw path or sensitive values", () => {
    withTempZip(
      {
        "settings.json": JSON.stringify({
          ...validSettings(),
          note: "C:\\Users\\sample-user\\Documents\\private",
          contact: "sample@example.com"
        }),
        "nodes/0.json": JSON.stringify(validNode())
      },
      (zipPath) => {
        const report = buildHrcRawZipDryRunReport(zipPath, repoRoot);
        const reportText = JSON.stringify(report);

        expect(report.status).toBe("PRIVACY_WARNING");
        expect(report.privacySafe).toBe(false);
        expect(report.privacyWarnings).toEqual(
          expect.arrayContaining([
            "privacy pattern detected: windows-user-path",
            "privacy pattern detected: account-user-token",
            "privacy pattern detected: email"
          ])
        );
        expect(reportText).not.toContain("C:\\Users\\sample-user");
        expect(reportText).not.toContain("sample@example.com");
        expect(reportText).not.toContain(zipPath);
      }
    );
  });

  it("reports adapter failure without connecting product import logic", () => {
    withTempZip({ "settings.json": JSON.stringify(validSettings()), "nodes/0.json": JSON.stringify(validNode()) }, (zipPath) => {
      const report = buildHrcRawZipDryRunReport(zipPath, repoRoot, {
        adapterForTest: () => {
          throw new Error("forced adapter failure");
        }
      });

      expect(report.status).toBe("ADAPTER_FAILED");
      expect(report.adapterCandidateBuilt).toBe(false);
      expect(report.errors).toEqual(expect.arrayContaining(["adapter failed: forced adapter failure"]));
      expect(report.productImportConnected).toBe(false);
    });
  });

  it("reports validator failure for adapter candidates that are not app v2 valid", () => {
    withTempZip(
      {
        "settings.json": JSON.stringify(validSettings()),
        "nodes/0.json": JSON.stringify(validNode())
      },
      (zipPath) => {
        const report = buildHrcRawZipDryRunReport(zipPath, repoRoot, {
          adapterForTest: (input) => {
            const result = convertHrcRawNodeToMultiActionStrategy(input);
            return {
              ...result,
              report: {
                ...result.report,
                candidateValidator: {
                  ...result.report.candidateValidator,
                  valid: false,
                  issueMessages: ["forced validator failure"]
                }
              }
            };
          }
        });

        expect(report.status).toBe("VALIDATOR_FAILED");
        expect(report.rawNodeRecognized).toBe(true);
        expect(report.adapterCandidateBuilt).toBe(true);
        expect(report.validatorResult.attempted).toBe(true);
        expect(report.validatorResult.valid).toBe(false);
        expect(report.validatorResult.pass).toBe(false);
        expect(report.validatorResult.errorCount).toBe(1);
        expect(report.validatorResult.sourceLabel).toBe("APP_V2_MULTI_ACTION_CANDIDATE");
        expect(report.mismatchSummary).toEqual(
          expect.objectContaining({
            hasMismatch: true,
            fatal: true
          })
        );
        expect(report.mismatchSummary.categories).toContain("validator_failed");
        expect(report.mismatchSummary.sample).toEqual(["forced validator failure"]);
        expect(report.errors).toContain("adapter candidate failed current app v2 validator");
      }
    );
  });

  it("keeps the raw HRC zip outside git tracking", () => {
    const trackedFiles = execFileSync("git", ["ls-files"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(trackedFiles).not.toContain(rawZipFileName);
    expect(trackedFiles).not.toMatch(/\.zip$/m);
  });
});

function withTempZip(entries: Record<string, string>, callback: (zipPath: string) => void): void {
  const tempDir = mkdtempSync(join(tmpdir(), "hrc-raw-zip-dry-run-"));
  try {
    const zipPath = join(tempDir, "sample.zip");
    writeFileSync(zipPath, createStoredZip(entries));
    callback(zipPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function validSettings(): Record<string, unknown> {
  return {
    handdata: {},
    eqmodel: {},
    treeconfig: {},
    engine: {}
  };
}

function validNode(): {
  player: number;
  street: number;
  actions: Array<{ type: string; amount: number }>;
  hands: Record<string, { weight: number; played: number[]; evs: number[] }>;
  sequence: Array<{ player: number; type: string; amount: number; street: number }>;
} {
  return {
    player: 6,
    street: 0,
    actions: [
      { type: "F", amount: 0 },
      { type: "C", amount: 10000 },
      { type: "R", amount: 20000 }
    ],
    hands: {
      AA: { weight: 1, played: [0.1, 0.2, 0.7], evs: [0, 1, 2] }
    },
    sequence: [{ player: 0, type: "F", amount: 0, street: 0 }]
  };
}

function createStoredZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(data);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

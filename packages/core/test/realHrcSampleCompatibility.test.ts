import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRealHrcSampleCompatibilityReport } from "./helpers/realHrcSampleCompatibility.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleDirectory = join(__dirname, "fixtures", "real-hrc-samples");

describe("real HRC sample compatibility intake", () => {
  it("documents where sanitized real HRC samples belong", () => {
    const readmePath = join(sampleDirectory, "README.md");

    expect(existsSync(readmePath)).toBe(true);
    const readme = readFileSync(readmePath, "utf8");
    expect(readme).toContain("sanitized real HRC");
    expect(readme).toContain("Do not place raw original HRC export files here");
    expect(readme).toContain("Do not import files from this folder into the production SQLite DB");
  });

  it("builds a read-only compatibility report when no sample is provided", () => {
    const report = buildRealHrcSampleCompatibilityReport(sampleDirectory);

    expect(["not_provided", "detected"]).toContain(report.status);
    if (report.status === "not_provided") {
      expect(report.sampleCount).toBe(0);
      expect(report.samples).toHaveLength(0);
      expect(report.message).toContain("real HRC sample fixture not provided");
    }
  });

  it("reports shape and validator compatibility for provided sanitized samples", () => {
    const report = buildRealHrcSampleCompatibilityReport(sampleDirectory);

    for (const sample of report.samples) {
      expect(sample.fileDetected).toBe(true);
      expect(sample.relativePath.endsWith(".json")).toBe(true);
      expect(sample.topLevelKeys).toEqual(expect.any(Array));
      expect(sample.spotFields).toEqual(expect.any(Array));
      expect(sample.missingRequiredFields).toEqual(expect.any(Array));
      expect(sample.unknownTopLevelFields).toEqual(expect.any(Array));
      expect(sample.validator.attempted).toBe(sample.parseError === null);
      expect(sample.validator.issueMessages).toEqual(expect.any(Array));
      expect(sample.validator.warningMessages).toEqual(expect.any(Array));
      expect(["missing", "array", "hand-actions-array", "legacy-hand-map", "object-without-actions"]).toContain(sample.strategyShape);
    }
  });

  it("requires explicit real HRC sanitize metadata when samples are present", () => {
    const report = buildRealHrcSampleCompatibilityReport(sampleDirectory);

    for (const sample of report.samples) {
      expect(sample.parseError).toBeNull();
      expect(sample.sanitizeMetadata.hasRealHrcSampleKind).toBe(true);
      expect(sample.sanitizeMetadata.hasSanitizedMarker).toBe(true);
      expect(sample.sanitizeMetadata.hasOriginalToolHrc).toBe(true);
    }
  });
});


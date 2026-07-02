import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { LabDatabase, type CanonicalKeyReconcileReport } from "./db.js";

interface Args {
  apply: boolean;
  dbPath?: string;
  reportFile?: string;
}

const args = parseArgs(process.argv.slice(2));
const database = new LabDatabase(args.dbPath);

try {
  const report = database.reconcileCanonicalKeys({ apply: args.apply });
  const reportFile = resolveReportFile(args.reportFile);
  mkdirSync(dirname(reportFile), { recursive: true });
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
  printSummary(report, reportFile);

  if (args.apply && report.blocked) {
    process.exitCode = 1;
  }
} finally {
  database.close();
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--apply") {
      parsed.apply = true;
      continue;
    }
    if (token === "--dry-run") {
      parsed.apply = false;
      continue;
    }
    if (token === "--db-path") {
      const value = argv[i + 1];
      if (value) {
        parsed.dbPath = value;
      }
      i += 1;
      continue;
    }
    if (token === "--report-file") {
      const value = argv[i + 1];
      if (value) {
        parsed.reportFile = value;
      }
      i += 1;
    }
  }
  return parsed;
}

function resolveReportFile(input?: string): string {
  if (typeof input === "string" && input.trim().length > 0) {
    return isAbsolute(input) ? input : resolve(process.cwd(), input);
  }
  return resolve(process.cwd(), "..", "..", "artifacts", "latest-canonical-key-report.json");
}

function printSummary(report: CanonicalKeyReconcileReport, reportFile: string): void {
  console.log(`[canonical-key] report: ${reportFile}`);
  console.log(`[canonical-key] total solutions: ${report.totalSolutions}`);
  console.log(`[canonical-key] mismatches: ${report.mismatchCount}`);
  console.log(`[canonical-key] collisions: ${report.collisionCount}`);
  console.log(`[canonical-key] invalid spots: ${report.invalidSpotCount}`);
  console.log(`[canonical-key] updates applied: ${report.updatesApplied}`);
  if (report.blocked) {
    console.log(`[canonical-key] blocked: ${report.blockReason ?? "unknown reason"}`);
  }
}

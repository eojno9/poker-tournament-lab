import { type CopiedDbSafetyGateResult } from "./copiedDbSafetyGate.js";

export function renderCopiedDbRehearsalReport(result: CopiedDbSafetyGateResult): string {
  const lines = [
    "Copied DB Rehearsal",
    `Mode: ${result.mode}`,
    `Write status: ${result.writeStatus}`,
    `Raw data status: ${result.rawDataStatus}`,
    `Production DB status: ${result.productionDbStatus}`,
    `Scope: ${result.scopeStatus}`,
    `Verdict: ${result.verdict}`
  ];

  if (!result.allowed) {
    lines.push("Refusals:");
    for (const reason of result.reasons) {
      lines.push(`- ${sanitizeReason(reason)}`);
    }
  }

  return lines.join("\n");
}

function sanitizeReason(value: string): string {
  return value
    .replace(/[A-Za-z]:[\\/][^\r\n"'`]+/g, "<redacted-local-path>")
    .replace(/\/Users\/[^\s/\\]+/g, "/Users/<redacted-user>")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<redacted-email>");
}

import { parseCopiedDbRehearsalArgs, type ParsedCopiedDbRehearsalArgs } from "../copiedDbRehearsalConfig.js";
import { renderCopiedDbRehearsalReport } from "../copiedDbRehearsalReport.js";
import { evaluateCopiedDbSafetyGate, type CopiedDbSafetyGateResult } from "../copiedDbSafetyGate.js";

export interface CopiedDbRehearsalCliIo {
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
}

export interface CopiedDbRehearsalCliResult {
  exitCode: 0 | 1;
  parsedArgs: ParsedCopiedDbRehearsalArgs;
  safetyGate: CopiedDbSafetyGateResult;
  reportText: string;
  stdoutLines: string[];
  stderrLines: string[];
}

export function runCopiedDbRehearsalCli(argv: string[], io: CopiedDbRehearsalCliIo = {}): CopiedDbRehearsalCliResult {
  const parsedArgs = parseCopiedDbRehearsalArgs(argv);
  const safetyGate = evaluateCopiedDbSafetyGate(parsedArgs);
  const reportText = renderCopiedDbRehearsalReport(safetyGate);
  const stdoutLines = reportText.split("\n");
  const stderrLines = safetyGate.allowed ? [] : safetyGate.reasons;
  const exitCode = safetyGate.allowed ? 0 : 1;

  if (io.writeStdout) {
    io.writeStdout(reportText);
  }

  if (!safetyGate.allowed && io.writeStderr) {
    io.writeStderr(stderrLines.join("\n"));
  }

  return {
    exitCode,
    parsedArgs,
    safetyGate,
    reportText,
    stdoutLines,
    stderrLines
  };
}

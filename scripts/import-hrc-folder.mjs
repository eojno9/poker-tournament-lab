import { inflateRawSync } from "node:zlib";
import { basename, join } from "node:path";
import { dirname } from "node:path";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { classifyHrcDatabaseFile } from "@poker-tournament-lab/core";

const args = parseArgs(process.argv.slice(2));
const targetPath = normalizeTargetArg(args.path ?? process.cwd());
const apiBase = args.apiBase ?? "http://127.0.0.1:4174";
const batchSize = Math.max(10, Math.min(400, Number(args.batchSize ?? 120)));
const dryRun = Boolean(args.dryRun);
const maxFiles = Number.isFinite(Number(args.maxFiles)) ? Math.max(1, Number(args.maxFiles)) : null;
const logFile = args.logFile ? normalizeTargetArg(args.logFile) : null;
const reportFile = args.reportFile ? normalizeTargetArg(args.reportFile) : null;
const startedAt = new Date();
const logLines = [];

const files = resolveFiles(targetPath);
const zipFiles = files.filter((file) => file.toLowerCase().endsWith(".zip"));
const discardedHrcz = files.filter((file) => file.toLowerCase().endsWith(".hrcz"));
const scheduledZipFiles = maxFiles ? zipFiles.slice(0, maxFiles) : zipFiles;
const fileResults = [];
const skippedFiles = [];

log(`[import] target: ${targetPath}`);
log(`[import] zip files: ${zipFiles.length}`);
if (maxFiles) {
  log(`[import] zip files scheduled by --max-files ${maxFiles}: ${scheduledZipFiles.length}`);
}
log(`[import] discarded hrcz files: ${discardedHrcz.length}`);
if (discardedHrcz.length > 0) {
  for (const file of discardedHrcz) {
    log(`  - discard: ${basename(file)}`);
  }
}

if (scheduledZipFiles.length === 0) {
  log("[import] no zip files to import");
  finalizeRun({
    startedAt,
    targetPath,
    apiBase,
    batchSize,
    dryRun,
    maxFiles,
    zipFiles,
    scheduledZipFiles,
    discardedHrcz,
    importedFiles: 0,
    importedRecords: 0,
    failedFiles: 0,
    fileResults,
    skippedFiles,
    logFile,
    reportFile
  });
  process.exit(0);
}

let importedFiles = 0;
let importedRecords = 0;
let failedFiles = 0;

for (const file of scheduledZipFiles) {
  try {
    const fileName = basename(file);
    const features = classifyHrcDatabaseFile(fileName);
    const settings = readSettingsJson(file);
    if (!settings) {
      throw new Error("settings.json not found or not readable");
    }

    const entries = listZipEntries(file)
      .filter((entry) => /^nodes\/\d+\.json$/i.test(entry.name))
      .sort((a, b) => entryNodeId(a.name) - entryNodeId(b.name));

    if (entries.length === 0) {
      skippedFiles.push({ fileName, reason: "no nodes/*.json entries" });
      fileResults.push({
        fileName,
        status: "skipped",
        importedRecords: 0,
        totalNodes: 0,
        skippedNonPreflop: 0,
        reason: "no nodes/*.json entries"
      });
      log(`[skip] ${fileName}: no nodes/*.json entries`);
      continue;
    }

    let fileRecords = 0;
    let totalNodes = 0;
    let skippedNonPreflop = 0;
    let batch = [];

    for (const entry of entries) {
      totalNodes += 1;
      const text = readZipEntryText(file, entry.name);
      if (!text) {
        continue;
      }
      const node = safeParseJson(text);
      if (!node || typeof node !== "object") {
        continue;
      }

      const street = normalizeStreet(node.street);
      if (street !== "PREFLOP") {
        skippedNonPreflop += 1;
        continue;
      }

      const nodeId = entryNodeId(entry.name);
      const record = nodeToRecord({
        settings,
        node,
        fileName,
        nodeId
      });
      if (!record) {
        continue;
      }

      batch.push(record);
      fileRecords += 1;
      if (batch.length >= batchSize) {
        await sendBatch({ apiBase, fileName, features, records: batch, dryRun });
        importedRecords += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await sendBatch({ apiBase, fileName, features, records: batch, dryRun });
      importedRecords += batch.length;
      batch = [];
    }

    importedFiles += 1;
    fileResults.push({
      fileName,
      status: "imported",
      importedRecords: fileRecords,
      totalNodes,
      skippedNonPreflop
    });
    log(
      `[ok] ${fileName}: imported ${fileRecords} preflop nodes (total nodes ${totalNodes}, skipped non-preflop ${skippedNonPreflop})`
    );
  } catch (error) {
    failedFiles += 1;
    const message = error instanceof Error ? error.message : String(error);
    const fileName = basename(file);
    fileResults.push({
      fileName,
      status: "failed",
      importedRecords: 0,
      totalNodes: 0,
      skippedNonPreflop: 0,
      reason: message
    });
    log(`[fail] ${fileName}: ${message}`);
  }
}

log("");
log(`[done] files imported: ${importedFiles}`);
log(`[done] records imported: ${importedRecords}`);
log(`[done] failed files: ${failedFiles}`);
finalizeRun({
  startedAt,
  targetPath,
  apiBase,
  batchSize,
  dryRun,
  maxFiles,
  zipFiles,
  scheduledZipFiles,
  discardedHrcz,
  importedFiles,
  importedRecords,
  failedFiles,
  fileResults,
  skippedFiles,
  logFile,
  reportFile
});

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--api-base") {
      parsed.apiBase = argv[i + 1];
      i += 1;
    } else if (token === "--batch-size") {
      parsed.batchSize = argv[i + 1];
      i += 1;
    } else if (token === "--dry-run") {
      parsed.dryRun = true;
    } else if (token === "--max-files") {
      parsed.maxFiles = argv[i + 1];
      i += 1;
    } else if (token === "--log-file") {
      parsed.logFile = argv[i + 1];
      i += 1;
    } else if (token === "--report-file") {
      parsed.reportFile = argv[i + 1];
      i += 1;
    } else if (!token.startsWith("--") && parsed.path === undefined) {
      parsed.path = token;
    }
  }
  return parsed;
}

function resolveFiles(targetPath) {
  const stat = statSync(targetPath);
  if (stat.isFile()) {
    return [targetPath];
  }
  return readdirSync(targetPath).map((name) => join(targetPath, name)).filter((path) => statSync(path).isFile());
}

function normalizeTargetArg(value) {
  const cleaned = String(value).replaceAll("^", "");
  const driveMatches = [...cleaned.matchAll(/[A-Za-z]:\\/g)];
  if (driveMatches.length > 1) {
    return cleaned.slice(driveMatches.at(-1).index);
  }
  return cleaned;
}

function readSettingsJson(zipPath) {
  const text = readZipEntryText(zipPath, "settings.json");
  return text ? safeParseJson(text) : null;
}

function nodeToRecord({ settings, node, fileName, nodeId }) {
  const stacks = Array.isArray(settings?.handdata?.stacks) ? settings.handdata.stacks : [];
  if (stacks.length < 2 || stacks.length > 10) {
    return null;
  }

  const blinds = Array.isArray(settings?.handdata?.blinds) ? settings.handdata.blinds : [];
  const bigBlind = positiveNumber(blinds[0], 10000);
  const smallBlind = positiveNumber(blinds[1], bigBlind / 2);
  const ante = positiveNumber(blinds[2], 0);

  const tableSize = stacks.length;
  const heroIndex = boundedIndex(node.player, tableSize);
  const positions = positionsForTableSize(tableSize);
  const actionPath = Array.isArray(node.sequence) ? node.sequence.map((item) => String(item)) : [];
  const spot = {
    gameType: "NLHE_MTT",
    tournamentType: "REGULAR",
    decisionType: "PUSH_FOLD",
    street: "PREFLOP",
    tableSize,
    heroSeat: heroIndex + 1,
    heroPosition: positions[heroIndex],
    potBb: round3((smallBlind + bigBlind + ante * tableSize) / bigBlind),
    blinds: {
      smallBb: round3(smallBlind / bigBlind),
      bigBb: 1,
      anteBb: round3(ante / bigBlind)
    },
    players: stacks.map((stack, index) => ({
      seat: index + 1,
      position: positions[index],
      stackBb: round3(positiveNumber(stack, bigBlind) / bigBlind),
      inHand: true,
      isHero: index === heroIndex
    })),
    payouts: makeChipEvPlaceholderPayouts(tableSize),
    actionPath
  };

  const strategy = nodeToStrategy(node, stacks[heroIndex] ?? 0);
  return {
    externalId: `${fileName}:node-${nodeId}`,
    sourceLabel: fileName,
    spot,
    strategy,
    evSummary: {
      unit: "chips",
      notes: [`imported from ${fileName} node ${nodeId}`]
    }
  };
}

function nodeToStrategy(node, heroStack) {
  const actions = Array.isArray(node.actions) ? node.actions : [];
  const hands = node.hands && typeof node.hands === "object" ? node.hands : {};
  const foldIndex = actions.findIndex((action) => action?.type === "F");
  const allInIndexes = actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action?.type === "R" && positiveNumber(action.amount, 0) >= positiveNumber(heroStack, 0))
    .map(({ index }) => index);

  const strategy = {};
  for (const [hand, handData] of Object.entries(hands)) {
    const played = Array.isArray(handData?.played) ? handData.played : [];
    const evs = Array.isArray(handData?.evs) ? handData.evs : [];
    const foldFreq = foldIndex >= 0 ? positiveNumber(played[foldIndex], 0) : 0;
    const pushFreq =
      allInIndexes.length > 0 ? sum(allInIndexes.map((index) => positiveNumber(played[index], 0))) : clamp01(1 - foldFreq);
    const action = pushFreq >= 0.995 ? "SHOVE" : pushFreq <= 0.005 ? "FOLD" : "MIXED";

    const evPush =
      allInIndexes.length > 0
        ? weightedAverage(
            allInIndexes.map((index) => ({ w: positiveNumber(played[index], 0), v: numberOrUndefined(evs[index]) }))
          )
        : weightedAverage(
            actions
              .map((actionItem, index) => ({ actionItem, index }))
              .filter(({ actionItem }) => actionItem?.type !== "F")
              .map(({ index }) => ({ w: positiveNumber(played[index], 0), v: numberOrUndefined(evs[index]) }))
          );
    const evFold = foldIndex >= 0 ? numberOrUndefined(evs[foldIndex]) : undefined;
    const label = allInIndexes.length > 0 ? "ALL_IN_FREQ" : dominantActionLabel(actions, played);

    strategy[hand] = {
      action,
      frequency: round4(clamp01(pushFreq)),
      ...(evPush !== undefined ? { evPush: round4(evPush) } : {}),
      ...(evFold !== undefined ? { evFold: round4(evFold) } : {}),
      ...(label ? { label } : {})
    };
  }

  return strategy;
}

function dominantActionLabel(actions, played) {
  let bestIndex = -1;
  let bestWeight = -1;
  for (let index = 0; index < actions.length; index += 1) {
    const weight = positiveNumber(played[index], 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || !actions[bestIndex]) {
    return "UNKNOWN";
  }
  const action = actions[bestIndex];
  if (action.type === "R") {
    return `R${positiveNumber(action.amount, 0)}`;
  }
  if (action.type === "C") {
    return `C${positiveNumber(action.amount, 0)}`;
  }
  return String(action.type ?? "UNKNOWN");
}

async function sendBatch({ apiBase, fileName, features, records, dryRun }) {
  if (dryRun) {
    console.log(`[dry-run] ${fileName}: would import ${records.length} records`);
    return;
  }

  const payload = {
    format: "json",
    fileName,
    sourceLabel: fileName,
    databaseFeatures: features,
    content: JSON.stringify(records)
  };

  const response = await fetch(`${apiBase.replace(/\/$/, "")}/api/imports/hrc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`import API failed (${response.status}): ${body}`);
  }
}

function listZipEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    return [];
  }

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  const entries = [];

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);
    entries.push({ name, localHeaderOffset, compressedSize });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryText(zipPath, entryName) {
  const buffer = readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    return null;
  }

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      return null;
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (name === entryName) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) {
        return compressed.toString("utf8");
      }
      if (method === 8) {
        return inflateRawSync(compressed).toString("utf8");
      }
      return null;
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  return -1;
}

function normalizeStreet(rawStreet) {
  const street = Number(rawStreet);
  if (street === 0) return "PREFLOP";
  if (street === 1) return "FLOP";
  if (street === 2) return "TURN";
  if (street === 3) return "RIVER";
  return "PREFLOP";
}

function positionsForTableSize(size) {
  const map = {
    2: ["SB", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["CO", "BTN", "SB", "BB"],
    5: ["HJ", "CO", "BTN", "SB", "BB"],
    6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
    7: ["UTG", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
    8: ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
    9: ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
    10: ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB", "X"]
  };
  return map[size] ?? Array.from({ length: size }, (_, index) => `S${index + 1}`);
}

function makeChipEvPlaceholderPayouts(size) {
  return Array.from({ length: size }, (_, index) => (index === 0 ? 1 : 0));
}

function boundedIndex(value, size) {
  const index = Number(value);
  if (!Number.isFinite(index) || index < 0) {
    return 0;
  }
  return Math.min(size - 1, Math.trunc(index));
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }
  return number;
}

function round3(value) {
  return Number(value.toFixed(3));
}

function round4(value) {
  return Number(value.toFixed(4));
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function numberOrUndefined(value) {
  return Number.isFinite(value) ? Number(value) : undefined;
}

function sum(values) {
  return values.reduce((total, item) => total + item, 0);
}

function weightedAverage(values) {
  let weightSum = 0;
  let valueSum = 0;
  for (const item of values) {
    if (item.v === undefined || item.w <= 0) {
      continue;
    }
    weightSum += item.w;
    valueSum += item.v * item.w;
  }
  if (weightSum <= 0) {
    return undefined;
  }
  return valueSum / weightSum;
}

function entryNodeId(entryName) {
  const match = entryName.match(/nodes\/(\d+)\.json/i);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function log(message) {
  console.log(message);
  logLines.push(message);
}

function finalizeRun({
  startedAt,
  targetPath,
  apiBase,
  batchSize,
  dryRun,
  maxFiles,
  zipFiles,
  scheduledZipFiles,
  discardedHrcz,
  importedFiles,
  importedRecords,
  failedFiles,
  fileResults,
  skippedFiles,
  logFile,
  reportFile
}) {
  const finishedAt = new Date();
  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Number(((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(3)),
    targetPath,
    apiBase,
    batchSize,
    dryRun,
    maxFiles,
    scannedFiles: zipFiles.length + discardedHrcz.length,
    zipFiles: zipFiles.length,
    scheduledZipFiles: scheduledZipFiles.length,
    discardedHrczFiles: discardedHrcz.map((file) => basename(file)),
    importedFiles,
    importedRecords,
    skippedFiles,
    failedFiles,
    fileResults
  };

  if (logFile) {
    writeTextFile(logFile, `${logLines.join("\n")}\n`);
    log(`[output] log file written: ${logFile}`);
  }
  if (reportFile) {
    writeTextFile(reportFile, `${JSON.stringify(summary, null, 2)}\n`);
    log(`[output] report file written: ${reportFile}`);
  }
}

function writeTextFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

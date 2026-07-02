import { inflateRawSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { classifyHrcDatabaseFile } from "@poker-tournament-lab/core";

const target = normalizeTargetArg(process.argv[2] ?? process.cwd());
const files = statSync(target).isDirectory() ? readdirSync(target).map((name) => join(target, name)) : [target];
const rows = files
  .filter((file) => /\.(zip|hrcz)$/i.test(file))
  .map((file) => {
    const features = classifyHrcDatabaseFile(basename(file));
    const settings = readSettingsJson(file);
    const inspected = settings ? inspectSettings(settings) : null;
    const playerCount = features.playerCount ?? inspected?.playerCount ?? null;
    const stackDepthBb = features.stackDepthBb ?? inspected?.stackDepthBb ?? null;
    const calculationModel = features.calculationModel !== "Unknown" ? features.calculationModel : (inspected?.calculationModel ?? "Unknown");
    const warnings = filterResolvedWarnings(features.warnings, {
      hasPlayerCount: playerCount !== null,
      hasStackDepth: stackDepthBb !== null
    });
    if (!settings && file.toLowerCase().endsWith(".zip")) {
      warnings.push("settings.json could not be inspected");
    }
    return {
      name: features.fileName,
      playerCount: playerCount ? `${playerCount}P` : "unknown",
      stack: stackDepthBb ? `${stackDepthBb}BB` : "unknown",
      depth: features.treeDepth ? `Depth ${features.treeDepth}` : "unknown",
      model: calculationModel,
      family: features.spotFamily,
      scope: features.preflopOnly ? "PREFLOP_ONLY" : features.streetScope,
      tags: features.actionTags.join(", ") || "none",
      warnings: warnings.join("; ") || "",
      inspected: settings ? "settings.json" : "file name"
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

console.log("| File | Players | Stack | Depth | Model | Family | Scope | Tags | Inspected | Warnings |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const row of rows) {
  console.log(
    `| ${escapeCell(row.name)} | ${row.playerCount} | ${row.stack} | ${row.depth} | ${row.model} | ${row.family} | ${row.scope} | ${row.tags} | ${row.inspected} | ${escapeCell(row.warnings)} |`
  );
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}

function normalizeTargetArg(value) {
  const cleaned = String(value).replaceAll("^", "");
  const driveMatches = [...cleaned.matchAll(/[A-Za-z]:\\/g)];
  if (driveMatches.length > 1) {
    return cleaned.slice(driveMatches.at(-1).index);
  }
  return cleaned;
}

function readSettingsJson(file) {
  try {
    const text = readZipText(file, "settings.json");
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function inspectSettings(settings) {
  const stacks = Array.isArray(settings?.handdata?.stacks) ? settings.handdata.stacks : [];
  const blinds = Array.isArray(settings?.handdata?.blinds) ? settings.handdata.blinds : [];
  const bigBlind = typeof blinds[0] === "number" && blinds[0] > 0 ? blinds[0] : null;
  const firstStack = typeof stacks[0] === "number" ? stacks[0] : null;
  const modelId = typeof settings?.eqmodel?.id === "string" ? settings.eqmodel.id.toLowerCase() : "";

  return {
    playerCount: stacks.length > 0 ? stacks.length : null,
    stackDepthBb: firstStack !== null && bigBlind ? Math.round(firstStack / bigBlind) : null,
    calculationModel: modelId === "chipev" ? "ChipEV" : modelId === "icm" ? "ICM" : "Unknown"
  };
}

function filterResolvedWarnings(warnings, state) {
  return warnings.filter((warning) => {
    if (state.hasPlayerCount && warning.includes("player count was not detectable")) {
      return false;
    }
    if (state.hasStackDepth && warning.includes("stack depth was not detectable")) {
      return false;
    }
    return true;
  });
}

function readZipText(file, entryName) {
  const buffer = readFileSync(file);
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

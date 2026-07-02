import type { HrcDatabaseFeatures } from "./types.js";

export function classifyHrcDatabaseFile(fileName: string): HrcDatabaseFeatures {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const lower = baseName.toLowerCase();
  const actionTags = collectActionTags(lower);
  const preflopOnly = lower.includes("limp");
  const playerCount = matchNumber(lower, /(?:^|[_\-\s])(\d+)p(?:[_\-\s]|$)/);
  const stackDepthBb = matchNumber(lower, /(?:^|[_\-\s])(\d+)bb(?:[_\-\s.]|$)/);
  const treeDepth = matchNumber(lower, /depth[_\-\s]?(\d+)/);
  const calculationModel = lower.includes("chipev") ? "ChipEV" : lower.includes("icm") ? "ICM" : "Unknown";
  const exportShape = lower.endsWith(".hrcz")
    ? "hrcz_project"
    : lower.includes("complete_export")
      ? "complete_export"
      : lower.endsWith(".zip")
        ? "single_root"
        : "unknown";

  const warnings: string[] = [];
  if (preflopOnly) {
    warnings.push("filename contains limp/LIMP; this DB is preflop-only and must never be used for postflop analysis");
  }
  if (playerCount === null) {
    warnings.push("player count was not detectable from file name");
  }
  if (stackDepthBb === null) {
    warnings.push("stack depth was not detectable from file name");
  }
  if (exportShape === "hrcz_project") {
    warnings.push("hrcz project files may require HRC-specific parsing before normalized import");
  }

  return {
    fileName: baseName,
    playerCount,
    stackDepthBb,
    treeDepth,
    calculationModel,
    spotFamily: inferSpotFamily(lower),
    actionTags,
    streetScope: preflopOnly ? "PREFLOP_ONLY" : "UNKNOWN",
    preflopOnly,
    preflopOnlyReason: preflopOnly ? "File name contains limp/LIMP" : null,
    exportShape,
    warnings
  };
}

export function assertHrcDatabaseCanContainSpot(features: HrcDatabaseFeatures, street: string | undefined): void {
  const normalizedStreet = street ?? "PREFLOP";
  if (features.preflopOnly && normalizedStreet !== "PREFLOP") {
    throw new Error(`${features.fileName} is marked PREFLOP_ONLY because it contains limp/LIMP; postflop spots are not allowed`);
  }
}

function collectActionTags(lowerName: string): string[] {
  const candidates = [
    ["rfi", "RFI"],
    ["limp", "LIMP"],
    ["open", "OPEN"],
    ["3bet", "3BET"],
    ["4bet", "4BET"],
    ["sb_vs_btn", "SB_vs_BTN"],
    ["btn_vs_co", "BTN_vs_CO"],
    ["co_vs_btn", "CO_vs_BTN"],
    ["root", "ROOT"]
  ] as const;

  return candidates.filter(([needle]) => lowerName.includes(needle)).map(([, tag]) => tag);
}

function inferSpotFamily(lowerName: string): string {
  if (lowerName.includes("sb_vs_btn_open")) {
    return "SB vs BTN open";
  }
  if (lowerName.includes("btn_vs_co_open")) {
    return "BTN vs CO open";
  }
  if (lowerName.includes("co_vs_btn_3bet")) {
    return "CO vs BTN 3bet";
  }
  if (lowerName.includes("root")) {
    return "Root limp/open tree";
  }
  if (lowerName.includes("rfi")) {
    return "RFI tree";
  }
  if (lowerName.includes("hand")) {
    return "HRC hand project";
  }
  return "Unknown";
}

function matchNumber(value: string, regex: RegExp): number | null {
  const match = value.match(regex);
  if (!match?.[1]) {
    return null;
  }
  return Number(match[1]);
}

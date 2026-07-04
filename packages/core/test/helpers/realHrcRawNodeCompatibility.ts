import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { isMultiActionImportV2Record, validateMultiActionImportV2Record } from "../../src/index.js";

export type RealHrcRawNodeCompatibilityStatus = "not_found" | "detected";

export interface RealHrcRawNodeCompatibilityReport {
  status: RealHrcRawNodeCompatibilityStatus;
  fixturePath: string;
  fileName: string;
  fileDetected: boolean;
  metadata: {
    sampleKind: string | null;
    sanitized: boolean | null;
    originalTool: string | null;
    rawZipCommitted: boolean | null;
    source: string | null;
    streetScope: string | null;
    note: string | null;
  };
  settings: {
    keys: string[];
    hasExpectedRawSettingsKeys: boolean;
  };
  node: {
    keys: string[];
    hasActionsArray: boolean;
    hasHandsObject: boolean;
    actionsCount: number;
    handCount: number;
    hasSequence: boolean;
    sequenceCount: number;
    actionsHaveTypeAmount: boolean;
    sampledHands: RawHrcSampledHandReport[];
    allSampledHandsHaveWeightPlayedEvs: boolean;
    allSampledPlayedLengthsMatchActions: boolean;
    allSampledEvsLengthsMatchActions: boolean;
    rawNodeShapeRecognized: boolean;
  };
  privacyScan: {
    safe: boolean;
    matchedPatterns: string[];
  };
  mismatch: {
    rawShape: string;
    appV2Shape: string;
    isDirectProductImportPayload: boolean;
    expectedValidatorCompatibility: string | null;
    expectedMismatch: boolean;
    reasons: string[];
    validator: {
      attempted: boolean;
      isV2Record: boolean;
      valid: boolean;
      issueMessages: string[];
      warningMessages: string[];
    };
  };
}

export interface RawHrcSampledHandReport {
  hand: string;
  hasWeight: boolean;
  hasPlayedArray: boolean;
  hasEvsArray: boolean;
  playedLength: number;
  evsLength: number;
}

const EXPECTED_SETTINGS_KEYS = ["handdata", "eqmodel", "treeconfig", "engine"];
const SENSITIVE_PATTERNS = [
  "C:\\\\Users\\\\",
  "AppData",
  "Desktop",
  "Documents",
  "sample-user",
  "playerName",
  "nickname",
  "screenname",
  "userName",
  "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}"
];

export function buildRealHrcRawNodeCompatibilityReport(fixturePath: string): RealHrcRawNodeCompatibilityReport {
  if (!existsSync(fixturePath)) {
    return emptyReport(fixturePath);
  }

  const fixtureText = readFileSync(fixturePath, "utf8");
  const record = readJsonObject(fixtureText);
  const settings = isPlainObject(record.settings) ? record.settings : {};
  const node = isPlainObject(record.node) ? record.node : {};
  const actions = Array.isArray(node.actions) ? node.actions : [];
  const hands = isPlainObject(node.hands) ? node.hands : {};
  const sampledHands = Object.entries(hands)
    .slice(0, 12)
    .map(([hand, value]) => buildSampledHandReport(hand, value));
  const validator = validateMultiActionImportV2Record(record);
  const expectedValidatorCompatibility = readString(
    isPlainObject(record.compatibility) ? record.compatibility.expectedValidatorCompatibility : undefined
  );
  const reasons = mismatchReasons(record, node);
  const privacyScan = scanForSensitivePatterns(fixtureText);
  const settingsKeys = Array.isArray(settings.topLevelKeys) ? settings.topLevelKeys.filter((key): key is string => typeof key === "string") : [];
  const nodeKeys = Object.keys(node).sort();
  const actionsHaveTypeAmount =
    actions.length > 0 &&
    actions.every((action) => isPlainObject(action) && typeof action.type === "string" && typeof action.amount === "number");
  const hasSequence = Array.isArray(node.sequence);
  const hasHandsObject = isPlainObject(node.hands);
  const hasActionsArray = Array.isArray(node.actions);

  return {
    status: "detected",
    fixturePath,
    fileName: basename(fixturePath),
    fileDetected: true,
    metadata: {
      sampleKind: readString(record.sampleKind),
      sanitized: typeof record.sanitized === "boolean" ? record.sanitized : null,
      originalTool: readString(record.originalTool),
      rawZipCommitted: typeof record.rawZipCommitted === "boolean" ? record.rawZipCommitted : null,
      source: readString(record.source),
      streetScope: readString(record.streetScope),
      note: readString(record.note)
    },
    settings: {
      keys: settingsKeys,
      hasExpectedRawSettingsKeys: EXPECTED_SETTINGS_KEYS.every((key) => settingsKeys.includes(key))
    },
    node: {
      keys: nodeKeys,
      hasActionsArray,
      hasHandsObject,
      actionsCount: actions.length,
      handCount: Object.keys(hands).length,
      hasSequence,
      sequenceCount: Array.isArray(node.sequence) ? node.sequence.length : 0,
      actionsHaveTypeAmount,
      sampledHands,
      allSampledHandsHaveWeightPlayedEvs: sampledHands.every(
        (hand) => hand.hasWeight && hand.hasPlayedArray && hand.hasEvsArray
      ),
      allSampledPlayedLengthsMatchActions: sampledHands.every((hand) => hand.playedLength === actions.length),
      allSampledEvsLengthsMatchActions: sampledHands.every((hand) => hand.evsLength === actions.length),
      rawNodeShapeRecognized: hasActionsArray && hasHandsObject && actions.length > 0 && sampledHands.length > 0 && actionsHaveTypeAmount
    },
    privacyScan,
    mismatch: {
      rawShape: "node-level actions[] with hand-level played[] and evs[] indexed by actions[]",
      appV2Shape: "hand -> actions[] multi-action import record",
      isDirectProductImportPayload: false,
      expectedValidatorCompatibility,
      expectedMismatch: !validator.valid,
      reasons,
      validator: {
        attempted: true,
        isV2Record: isMultiActionImportV2Record(record),
        valid: validator.valid,
        issueMessages: validator.issues.map((issue) => `${issue.path}: ${issue.message}`),
        warningMessages: validator.warnings.map((warning) => `${warning.path}: ${warning.message}`)
      }
    }
  };
}

function emptyReport(fixturePath: string): RealHrcRawNodeCompatibilityReport {
  return {
    status: "not_found",
    fixturePath,
    fileName: basename(fixturePath),
    fileDetected: false,
    metadata: {
      sampleKind: null,
      sanitized: null,
      originalTool: null,
      rawZipCommitted: null,
      source: null,
      streetScope: null,
      note: null
    },
    settings: {
      keys: [],
      hasExpectedRawSettingsKeys: false
    },
    node: {
      keys: [],
      hasActionsArray: false,
      hasHandsObject: false,
      actionsCount: 0,
      handCount: 0,
      hasSequence: false,
      sequenceCount: 0,
      actionsHaveTypeAmount: false,
      sampledHands: [],
      allSampledHandsHaveWeightPlayedEvs: false,
      allSampledPlayedLengthsMatchActions: false,
      allSampledEvsLengthsMatchActions: false,
      rawNodeShapeRecognized: false
    },
    privacyScan: {
      safe: true,
      matchedPatterns: []
    },
    mismatch: {
      rawShape: "not found",
      appV2Shape: "hand -> actions[] multi-action import record",
      isDirectProductImportPayload: false,
      expectedValidatorCompatibility: null,
      expectedMismatch: false,
      reasons: [],
      validator: {
        attempted: false,
        isV2Record: false,
        valid: false,
        issueMessages: [],
        warningMessages: []
      }
    }
  };
}

function buildSampledHandReport(hand: string, value: unknown): RawHrcSampledHandReport {
  const handRecord = isPlainObject(value) ? value : {};
  const played = Array.isArray(handRecord.played) ? handRecord.played : [];
  const evs = Array.isArray(handRecord.evs) ? handRecord.evs : [];
  return {
    hand,
    hasWeight: typeof handRecord.weight === "number",
    hasPlayedArray: Array.isArray(handRecord.played),
    hasEvsArray: Array.isArray(handRecord.evs),
    playedLength: played.length,
    evsLength: evs.length
  };
}

function mismatchReasons(record: Record<string, unknown>, node: Record<string, unknown>): string[] {
  const reasons = [
    "raw HRC stores action definitions once at node.actions[]",
    "raw HRC stores per-hand action frequencies in hand.played[] by action index",
    "raw HRC stores per-hand EV values in hand.evs[] by action index",
    "app v2 validator expects each hand to contain its own actions[] entries"
  ];
  if (!("schemaVersion" in record)) {
    reasons.push("raw fixture intentionally has no product schemaVersion");
  }
  if (!("strategy" in record)) {
    reasons.push("raw fixture intentionally has no product strategy hand map");
  }
  if (Array.isArray(node.actions) && isPlainObject(node.hands)) {
    reasons.push("adapter can map node.actions[] indexes to hand.played[] and hand.evs[] in a future step");
  }
  return reasons;
}

function scanForSensitivePatterns(text: string): RealHrcRawNodeCompatibilityReport["privacyScan"] {
  const matchedPatterns = SENSITIVE_PATTERNS.filter((pattern) => new RegExp(pattern, "i").test(text));
  return {
    safe: matchedPatterns.length === 0,
    matchedPatterns
  };
}

function readJsonObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  return isPlainObject(parsed) ? parsed : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

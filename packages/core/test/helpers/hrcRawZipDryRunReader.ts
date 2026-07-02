import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  buildHrcRawAdapterReport,
  convertHrcRawNodeToMultiActionStrategy,
  type HrcRawAdapterReport,
  type HrcRawNodeAdapterResult
} from "../../src/index.js";

export type HrcRawZipDryRunStatus =
  | "OK"
  | "ZIP_NOT_FOUND"
  | "SETTINGS_MISSING"
  | "NODE_MISSING"
  | "SETTINGS_PARSE_ERROR"
  | "NODE_PARSE_ERROR"
  | "RAW_NODE_SHAPE_INVALID"
  | "PRIVACY_WARNING"
  | "ADAPTER_FAILED"
  | "VALIDATOR_FAILED";

export interface HrcRawZipDryRunReport {
  status: HrcRawZipDryRunStatus;
  zipDetected: boolean;
  zipPathMasked: string;
  zipPathInsideRepo: boolean;
  entryCount: number;
  hasSettingsJson: boolean;
  nodeEntryCount: number;
  nodeEntriesSample: string[];
  selectedNodeEntry: string | null;
  selectedNodeReason: string | null;
  multipleNodeEntriesDetected: boolean;
  nodeSelectionPolicy: "PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST";
  multiNodeAggregationApplied: false;
  settingsTopLevelKeys: string[];
  nodeTopLevelKeys: string[];
  rawNodeRecognized: boolean;
  actionCount: number;
  handCount: number;
  sequenceLength: number;
  privacySafe: boolean;
  privacyWarnings: string[];
  privacyPatternMatches: string[];
  rawZipCommitted: false;
  productImportConnected: false;
  amountUnit: "UNKNOWN";
  amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED";
  adapterCandidateBuilt: boolean;
  adapterValidatorPass: boolean | null;
  adapterReportSummary: HrcRawZipDryRunAdapterReportSummary | null;
  validatorResult: HrcRawZipDryRunValidatorResult;
  mismatchSummary: HrcRawZipDryRunMismatchSummary;
  adapterReport: HrcRawAdapterReport | null;
  warnings: string[];
  errors: string[];
}

export interface HrcRawZipDryRunAdapterReportSummary {
  candidateBuilt: boolean;
  sourceShape: string;
  targetShape: string;
  handCount: number;
  actionCount: number;
  convertedHandCount: number;
  convertedActionCount: number;
  unknownActionCount: number;
  missingPlayedCount: number;
  missingEvsCount: number;
  lengthMismatchCount: number;
  rawValidatorPass: boolean;
  candidateValidatorPass: boolean;
  amountUnit: "UNKNOWN";
  amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED";
  productImportRouteConnected: false;
  warningCount: number;
  warningsCount: number;
}

export interface HrcRawZipDryRunValidatorResult {
  attempted: boolean;
  valid: boolean;
  pass: boolean;
  errorCount: number;
  warningCount: number;
  checkedHands: number;
  expectedHands: 169;
  sourceLabel: "APP_V2_MULTI_ACTION_CANDIDATE";
  issueMessages: string[];
  warningMessages: string[];
}

export interface HrcRawZipDryRunMismatchSummary {
  hasMismatch: boolean;
  mismatchCount: number;
  categories: string[];
  sample: string[];
  fatal: boolean;
}

export interface HrcRawZipDryRunOptions {
  adapterForTest?: (input: Record<string, unknown>) => HrcRawNodeAdapterResult;
}

interface ZipEntryInfo {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;

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

export function buildHrcRawZipDryRunReport(
  zipPath: string,
  repoRoot = process.cwd(),
  options: HrcRawZipDryRunOptions = {}
): HrcRawZipDryRunReport {
  const zipPathMasked = maskPath(zipPath);
  const zipPathInsideRepo = isInsidePath(zipPath, repoRoot);
  const warnings = new Set<string>();
  const errors = new Set<string>();

  if (zipPathInsideRepo) {
    warnings.add("raw HRC zip path is inside the repository");
  }

  if (!existsSync(zipPath)) {
    return emptyReport({
      status: "ZIP_NOT_FOUND",
      zipDetected: false,
      zipPathMasked,
      zipPathInsideRepo,
      warnings: ["raw HRC zip fixture not provided"],
      errors: []
    });
  }

  try {
    const archive = readFileSync(zipPath);
    const entries = readZipEntries(archive);
    const entryNames = entries.map((entry) => entry.name);
    const settingsEntry = entries.find((entry) => normalizeZipEntryName(entry.name) === "settings.json");
    const nodeEntries = entries
      .filter((entry) => /^nodes\/[^/]+\.json$/i.test(normalizeZipEntryName(entry.name)))
      .sort((left, right) => normalizeZipEntryName(left.name).localeCompare(normalizeZipEntryName(right.name)));
    const nodeEntryNames = nodeEntries.map((entry) => normalizeZipEntryName(entry.name));
    const preferredNode = nodeEntries.find((entry) => normalizeZipEntryName(entry.name) === "nodes/0.json");
    const selectedNode = preferredNode ?? nodeEntries[0];
    const multipleNodeEntriesDetected = nodeEntries.length > 1;
    const selectedNodeReason = selectedNode
      ? preferredNode
        ? "nodes/0.json is present and is the default dry-run node"
        : "nodes/0.json is absent; selected first nodes/*.json entry by lexical order"
      : null;

    if (multipleNodeEntriesDetected) {
      warnings.add("MULTIPLE_NODE_ENTRIES");
      warnings.add("multi-node aggregation is not applied in v2.5 dry-run reports");
    }

    if (!settingsEntry) {
      errors.add("settings.json was not found in raw HRC zip");
    }
    if (!selectedNode) {
      errors.add("nodes/*.json was not found in raw HRC zip");
    }

    const settingsText = settingsEntry ? readZipTextEntry(archive, settingsEntry) : "{}";
    const nodeText = selectedNode ? readZipTextEntry(archive, selectedNode) : "{}";
    const privacyScan = scanForSensitivePatterns(`${settingsText}\n${nodeText}`);
    const settingsParse = parseJsonObject(settingsText, "settings.json");
    const nodeParse = parseJsonObject(nodeText, selectedNode?.name ?? "node json");
    if (settingsParse.error !== null && settingsEntry) {
      errors.add(settingsParse.error);
    }
    if (nodeParse.error !== null && selectedNode) {
      errors.add(nodeParse.error);
    }
    const settings = settingsParse.value;
    const node = nodeParse.value;
    const rawNodeRecognized = isRawHrcNode(node);
    if (!rawNodeRecognized) {
      errors.add("raw HRC node shape was not recognized");
    }

    const settingsTopLevelKeys = Object.keys(settings).sort();
    const nodeTopLevelKeys = Object.keys(node).sort();
    const actionCount = Array.isArray(node.actions) ? node.actions.length : 0;
    const hands = isPlainObject(node.hands) ? node.hands : {};
    const handCount = Object.keys(hands).length;
    const sequenceLength = Array.isArray(node.sequence) ? node.sequence.length : 0;

    let adapterReport: HrcRawAdapterReport | null = null;
    let adapterCandidateBuilt = false;
    if (rawNodeRecognized) {
      const adapterInput = buildAdapterInput(settings, node);
      try {
        const adapterResult = options.adapterForTest?.(adapterInput) ?? convertHrcRawNodeToMultiActionStrategy(adapterInput);
        adapterReport = options.adapterForTest ? adapterResult.report : buildHrcRawAdapterReport(adapterInput);
        adapterCandidateBuilt = Object.keys(adapterResult.strategy).length > 0;
        if (!adapterReport.candidateValidator.valid) {
          errors.add("adapter candidate failed current app v2 validator");
        }
      } catch (error) {
        errors.add(`adapter failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }

    return {
      status: resolveStatus({
        hasSettings: Boolean(settingsEntry),
        hasNode: Boolean(selectedNode),
        settingsParseError: settingsParse.error !== null && Boolean(settingsEntry),
        nodeParseError: nodeParse.error !== null && Boolean(selectedNode),
        rawNodeRecognized,
        privacySafe: privacyScan.safe,
        adapterFailed: Array.from(errors).some((error) => error.startsWith("adapter failed:")),
        validatorPass: adapterReport?.candidateValidator.valid ?? null
      }),
      zipDetected: true,
      zipPathMasked,
      zipPathInsideRepo,
      entryCount: entryNames.length,
      hasSettingsJson: Boolean(settingsEntry),
      nodeEntryCount: nodeEntries.length,
      nodeEntriesSample: nodeEntryNames.slice(0, 5),
      selectedNodeEntry: selectedNode ? normalizeZipEntryName(selectedNode.name) : null,
      selectedNodeReason,
      multipleNodeEntriesDetected,
      nodeSelectionPolicy: "PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST",
      multiNodeAggregationApplied: false,
      settingsTopLevelKeys,
      nodeTopLevelKeys,
      rawNodeRecognized,
      actionCount,
      handCount,
      sequenceLength,
      privacySafe: privacyScan.safe,
      privacyWarnings: privacyScan.warnings,
      privacyPatternMatches: privacyScan.matchedPatterns,
      rawZipCommitted: false,
      productImportConnected: false,
      amountUnit: "UNKNOWN",
      amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
      adapterCandidateBuilt,
      adapterValidatorPass: adapterReport?.candidateValidator.valid ?? null,
      adapterReportSummary: adapterReport ? summarizeAdapterReport(adapterReport) : null,
      validatorResult: summarizeValidatorResult(adapterReport),
      mismatchSummary: buildMismatchSummary({
        rawNodeRecognized,
        privacySafe: privacyScan.safe,
        adapterReport,
        errors: Array.from(errors)
      }),
      adapterReport,
      warnings: Array.from(warnings),
      errors: Array.from(errors)
    };
  } catch (error) {
    return emptyReport({
      status: "RAW_NODE_SHAPE_INVALID",
      zipDetected: true,
      zipPathMasked,
      zipPathInsideRepo,
      warnings: [],
      errors: [`raw HRC zip dry-run failed: ${error instanceof Error ? error.message : "unknown error"}`]
    });
  }
}

function buildAdapterInput(settings: Record<string, unknown>, node: Record<string, unknown>): Record<string, unknown> {
  return {
    sampleKind: "REAL_HRC_RAW_EXPORT_SAMPLE",
    sanitized: false,
    originalTool: "HRC",
    rawZipCommitted: false,
    streetScope: "PREFLOP",
    source: "HRC_PRECOMPUTED_DB",
    note: "Read-only raw HRC zip dry-run input; not a product import payload.",
    settings,
    node
  };
}

function readZipEntries(buffer: Buffer): ZipEntryInfo[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntryInfo[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`invalid central directory signature at offset ${offset}`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");

    entries.push({
      name: normalizeZipEntryName(name),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });

    offset = nameEnd + extraFieldLength + commentLength;
  }

  return entries;
}

function readZipTextEntry(buffer: Buffer, entry: ZipEntryInfo): string {
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`invalid local file header for ${entry.name}`);
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraFieldLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraFieldLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  let data: Buffer;

  if (entry.compressionMethod === ZIP_STORE_METHOD) {
    data = compressed;
  } else if (entry.compressionMethod === ZIP_DEFLATE_METHOD) {
    data = inflateRawSync(compressed);
  } else {
    throw new Error(`unsupported zip compression method ${entry.compressionMethod} for ${entry.name}`);
  }

  if (entry.uncompressedSize > 0 && data.length !== entry.uncompressedSize) {
    throw new Error(`zip entry size mismatch for ${entry.name}`);
  }

  return data.toString("utf8");
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("zip end of central directory was not found");
}

function parseJsonObject(text: string, label: string): { value: Record<string, unknown>; error: string | null } {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isPlainObject(parsed)) {
      return { value: parsed, error: null };
    }
    return { value: {}, error: `${label} is not a JSON object` };
  } catch {
    return { value: {}, error: `${label} is malformed JSON` };
  }
}

function isRawHrcNode(node: Record<string, unknown>): boolean {
  return Array.isArray(node.actions) && isPlainObject(node.hands) && Array.isArray(node.sequence);
}

function emptyReport(input: {
  status: HrcRawZipDryRunReport["status"];
  zipDetected: boolean;
  zipPathMasked: string;
  zipPathInsideRepo: boolean;
  warnings: string[];
  errors: string[];
}): HrcRawZipDryRunReport {
  return {
    status: input.status,
    zipDetected: input.zipDetected,
    zipPathMasked: input.zipPathMasked,
    zipPathInsideRepo: input.zipPathInsideRepo,
    entryCount: 0,
    hasSettingsJson: false,
    nodeEntryCount: 0,
    nodeEntriesSample: [],
    selectedNodeEntry: null,
    selectedNodeReason: null,
    multipleNodeEntriesDetected: false,
    nodeSelectionPolicy: "PREFER_NODES_0_JSON_ELSE_LEXICAL_FIRST",
    multiNodeAggregationApplied: false,
    settingsTopLevelKeys: [],
    nodeTopLevelKeys: [],
    rawNodeRecognized: false,
    actionCount: 0,
    handCount: 0,
    sequenceLength: 0,
    privacySafe: true,
    privacyWarnings: [],
    privacyPatternMatches: [],
    rawZipCommitted: false,
    productImportConnected: false,
    amountUnit: "UNKNOWN",
    amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
    adapterCandidateBuilt: false,
    adapterValidatorPass: null,
    adapterReportSummary: null,
    validatorResult: emptyValidatorSnapshot(),
    mismatchSummary: emptyMismatchSummary(),
    adapterReport: null,
    warnings: input.warnings,
    errors: input.errors
  };
}

function emptyValidatorSnapshot(): HrcRawZipDryRunReport["validatorResult"] {
  return {
    attempted: false,
    valid: false,
    pass: false,
    errorCount: 0,
    warningCount: 0,
    checkedHands: 0,
    expectedHands: 169,
    sourceLabel: "APP_V2_MULTI_ACTION_CANDIDATE",
    issueMessages: [],
    warningMessages: []
  };
}

function emptyMismatchSummary(): HrcRawZipDryRunMismatchSummary {
  return {
    hasMismatch: false,
    mismatchCount: 0,
    categories: [],
    sample: [],
    fatal: false
  };
}

function scanForSensitivePatterns(text: string): { safe: boolean; matchedPatterns: string[]; warnings: string[] } {
  const searchableText = `${text}\n${text.replace(/\\\\/g, "\\")}`;
  const matchedPatterns = SENSITIVE_PATTERNS.filter((pattern) => new RegExp(pattern, "i").test(searchableText)).map(maskSensitivePattern);
  return {
    safe: matchedPatterns.length === 0,
    matchedPatterns,
    warnings: matchedPatterns.map((pattern) => `privacy pattern detected: ${pattern}`)
  };
}

function resolveStatus(input: {
  hasSettings: boolean;
  hasNode: boolean;
  settingsParseError: boolean;
  nodeParseError: boolean;
  rawNodeRecognized: boolean;
  privacySafe: boolean;
  adapterFailed: boolean;
  validatorPass: boolean | null;
}): HrcRawZipDryRunStatus {
  if (!input.hasSettings) {
    return "SETTINGS_MISSING";
  }
  if (!input.hasNode) {
    return "NODE_MISSING";
  }
  if (input.settingsParseError) {
    return "SETTINGS_PARSE_ERROR";
  }
  if (input.nodeParseError) {
    return "NODE_PARSE_ERROR";
  }
  if (!input.rawNodeRecognized) {
    return "RAW_NODE_SHAPE_INVALID";
  }
  if (!input.privacySafe) {
    return "PRIVACY_WARNING";
  }
  if (input.adapterFailed) {
    return "ADAPTER_FAILED";
  }
  if (input.validatorPass === false) {
    return "VALIDATOR_FAILED";
  }
  return "OK";
}

function summarizeAdapterReport(report: HrcRawAdapterReport): HrcRawZipDryRunAdapterReportSummary {
  return {
    candidateBuilt: report.convertedHandCount > 0,
    sourceShape: report.sourceShape,
    targetShape: report.targetShape,
    handCount: report.handCount,
    actionCount: report.actionCount,
    convertedHandCount: report.convertedHandCount,
    convertedActionCount: report.convertedActionCount,
    unknownActionCount: report.unknownActionTypes.length,
    missingPlayedCount: report.handsWithMissingPlayed.length,
    missingEvsCount: report.handsWithMissingEvs.length,
    lengthMismatchCount: report.handsWithLengthMismatch.length,
    rawValidatorPass: report.rawValidator.valid,
    candidateValidatorPass: report.candidateValidator.valid,
    amountUnit: report.amountSemantics.amountUnit,
    amountInterpretation: report.amountSemantics.amountInterpretation,
    productImportRouteConnected: report.productImportRouteConnected,
    warningCount: report.warnings.length,
    warningsCount: report.warnings.length
  };
}

function summarizeValidatorResult(report: HrcRawAdapterReport | null): HrcRawZipDryRunValidatorResult {
  if (report === null) {
    return emptyValidatorSnapshot();
  }

  return {
    attempted: report.candidateValidator.attempted,
    valid: report.candidateValidator.valid,
    pass: report.candidateValidator.valid,
    errorCount: report.candidateValidator.issueMessages.length,
    warningCount: report.candidateValidator.warningMessages.length,
    checkedHands: report.convertedHandCount,
    expectedHands: 169,
    sourceLabel: "APP_V2_MULTI_ACTION_CANDIDATE",
    issueMessages: report.candidateValidator.issueMessages,
    warningMessages: report.candidateValidator.warningMessages
  };
}

function buildMismatchSummary(input: {
  rawNodeRecognized: boolean;
  privacySafe: boolean;
  adapterReport: HrcRawAdapterReport | null;
  errors: string[];
}): HrcRawZipDryRunMismatchSummary {
  const categories: string[] = [];
  const sample: string[] = [];

  if (!input.rawNodeRecognized) {
    categories.push("raw_node_shape_invalid");
    sample.push("raw HRC node shape was not recognized");
  }
  if (!input.privacySafe) {
    categories.push("privacy_warning");
    sample.push("privacy pattern detected in settings/node content");
  }
  if (input.errors.some((error) => error.startsWith("adapter failed:"))) {
    categories.push("adapter_failed");
    sample.push("adapter failed during dry-run conversion");
  }

  const report = input.adapterReport;
  if (report !== null) {
    if (report.unknownActionTypes.length > 0) {
      categories.push("unknown_action_type");
      sample.push(...report.unknownActionTypes.slice(0, 3).map((type) => `unknown action type: ${type}`));
    }
    if (report.handsWithLengthMismatch.length > 0) {
      categories.push("length_mismatch");
      sample.push(...report.handsWithLengthMismatch.slice(0, 3).map((hand) => `played/evs length mismatch: ${hand}`));
    }
    if (report.handsWithMissingPlayed.length > 0) {
      categories.push("missing_played");
      sample.push(...report.handsWithMissingPlayed.slice(0, 3).map((hand) => `missing played[] value: ${hand}`));
    }
    if (report.handsWithMissingEvs.length > 0) {
      categories.push("missing_evs");
      sample.push(...report.handsWithMissingEvs.slice(0, 3).map((hand) => `missing evs[] value: ${hand}`));
    }
    if (!report.candidateValidator.valid) {
      categories.push("validator_failed");
      sample.push(...report.candidateValidator.issueMessages.slice(0, 3));
    }
  }

  const uniqueCategories = Array.from(new Set(categories));
  const uniqueSample = Array.from(new Set(sample)).slice(0, 3);
  return {
    hasMismatch: uniqueCategories.length > 0,
    mismatchCount: uniqueCategories.length,
    categories: uniqueCategories,
    sample: uniqueSample,
    fatal: uniqueCategories.some((category) =>
      ["raw_node_shape_invalid", "adapter_failed", "validator_failed", "privacy_warning"].includes(category)
    )
  };
}

function maskSensitivePattern(pattern: string): string {
  if (pattern.includes("@")) {
    return "email";
  }
  if (pattern.includes("C:")) {
    return "windows-user-path";
  }
  if (pattern === "sample-user") {
    return "account-user-token";
  }
  return pattern.replace(/\\/g, "");
}

function maskPath(path: string): string {
  return `<repo-external>/${basename(path)}`;
}

function isInsidePath(path: string, maybeParent: string): boolean {
  const resolvedPath = resolve(path).toLowerCase();
  const resolvedParent = resolve(maybeParent).toLowerCase();
  return resolvedPath === resolvedParent || resolvedPath.startsWith(`${resolvedParent}\\`);
}

function normalizeZipEntryName(name: string): string {
  return name.replace(/\\/g, "/");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

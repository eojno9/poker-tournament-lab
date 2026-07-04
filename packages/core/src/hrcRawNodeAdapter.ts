import {
  MULTI_ACTION_IMPORT_V2_SCHEMA_VERSION,
  validateMultiActionImportV2Record,
  type MultiActionImportV2Action,
  type MultiActionImportV2HandStrategy,
  type MultiActionImportV2Record
} from "./multiActionImportV2.js";
import type { MultiActionKind, MultiActionSize } from "./multiActionStrategy.js";

export const HRC_RAW_NODE_SOURCE_SHAPE = "HRC_RAW_NODE";
export const HRC_RAW_NODE_TARGET_SHAPE = "APP_V2_MULTI_ACTION_CANDIDATE";

export interface HrcRawNodeAdapterResult {
  strategy: Record<string, MultiActionImportV2HandStrategy>;
  candidateRecord: MultiActionImportV2Record;
  report: HrcRawNodeAdapterReport;
}

export interface HrcRawNodeAdapterReport {
  sourceShape: typeof HRC_RAW_NODE_SOURCE_SHAPE;
  targetShape: typeof HRC_RAW_NODE_TARGET_SHAPE;
  isProductImportPayload: false;
  productImportRouteConnected: false;
  handCount: number;
  actionCount: number;
  convertedHandCount: number;
  convertedActionCount: number;
  unknownActionTypes: string[];
  handsWithLengthMismatch: string[];
  handsWithMissingEvs: string[];
  handsWithMissingPlayed: string[];
  actionsWithMissingAmount: string[];
  amountSemantics: HrcRawAmountSemanticsReport;
  sourceMetadataCandidate: HrcRawSourceMetadataCandidate;
  spotCandidate: HrcRawSpotCandidateReport;
  privacySafe: boolean;
  privacyPatternMatches: string[];
  rawValidator: ValidatorSnapshot;
  candidateValidator: ValidatorSnapshot;
  warnings: string[];
}

export interface HrcRawAmountSemanticsReport {
  rawActionAmounts: Array<number | null>;
  uniqueRawActionAmounts: number[];
  actionsWithAmount: string[];
  actionsWithoutAmount: string[];
  amountUnit: "UNKNOWN";
  amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED";
  sizeLabelPolicy: "PRESERVE_AS_RAW_SIZE_LABEL";
  bbConversionApplied: false;
  chipConversionApplied: false;
  warning: "HRC amount unit is not inferred in v2.4";
}

export interface HrcRawSourceMetadataCandidate extends Record<string, unknown> {
  source: "HRC_PRECOMPUTED_DB";
  sourceShape: typeof HRC_RAW_NODE_SOURCE_SHAPE;
  targetShape: typeof HRC_RAW_NODE_TARGET_SHAPE;
  originalTool: string | null;
  sampleKind: string | null;
  sanitized: boolean | null;
  rawZipCommitted: boolean | null;
  streetScope: string | null;
  productImportRouteConnected: false;
  rawNodeKeys: string[];
  settingsKeys: string[];
  actionCount: number;
  handCount: number;
  sequenceLength: number;
  rawActionTypes: string[];
  rawActionAmounts: Array<number | null>;
  amountUnit: "UNKNOWN";
  amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED";
  conversionWarnings: string[];
}

export interface HrcRawSpotCandidateReport {
  sourceShape: typeof HRC_RAW_NODE_SOURCE_SHAPE;
  street: number | null;
  player: number | null;
  sequence: HrcRawSequenceItem[];
  actionPathCandidate: string[];
  decisionNodeCandidate: string | null;
  playerFromNode: number | null;
  sequenceActionTypes: string[];
  sequenceAmounts: Array<number | null>;
  tableSizeCandidate: number | null;
  playerCountCandidate: number | null;
  unknownFields: string[];
  warning: "spot candidate is read-only metadata and is not connected to canonical key/import logic";
}

export interface HrcRawSequenceItem {
  player: number | null;
  type: string | null;
  amount: number | null;
  street: number | null;
}

export interface ValidatorSnapshot {
  attempted: boolean;
  valid: boolean;
  issueMessages: string[];
  warningMessages: string[];
}

interface HrcRawActionDefinition {
  index: number;
  rawType: string;
  amount: number | null;
  action: MultiActionKind;
  size: MultiActionSize | null;
  warnings: string[];
}

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

export function convertHrcRawNodeToMultiActionStrategy(input: unknown): HrcRawNodeAdapterResult {
  const node = readRawNode(input);
  const actionDefinitions = readActionDefinitions(node);
  const hands = readHands(node);
  const strategy: Record<string, MultiActionImportV2HandStrategy> = {};
  const handsWithLengthMismatch = new Set<string>();
  const handsWithMissingEvs = new Set<string>();
  const handsWithMissingPlayed = new Set<string>();
  const warnings = new Set<string>();

  for (const action of actionDefinitions) {
    for (const warning of action.warnings) {
      warnings.add(warning);
    }
  }

  for (const [hand, rawHand] of Object.entries(hands)) {
    const played = Array.isArray(rawHand.played) ? rawHand.played : [];
    const evs = Array.isArray(rawHand.evs) ? rawHand.evs : [];
    const handWarnings = new Set<string>();

    if (played.length !== actionDefinitions.length || evs.length !== actionDefinitions.length) {
      handsWithLengthMismatch.add(hand);
      handWarnings.add("raw HRC played[]/evs[] length does not match node.actions[] length");
    }
    if (!Array.isArray(rawHand.played)) {
      handsWithMissingPlayed.add(hand);
      handWarnings.add("raw HRC hand is missing played[]");
    }
    if (!Array.isArray(rawHand.evs)) {
      handsWithMissingEvs.add(hand);
      handWarnings.add("raw HRC hand is missing evs[]");
    }

    const actions = actionDefinitions.map((definition) => {
      const frequency = readFiniteNumber(played[definition.index]);
      const ev = readFiniteNumber(evs[definition.index]);
      const actionWarnings = [...definition.warnings];

      if (frequency === null) {
        handsWithMissingPlayed.add(hand);
        actionWarnings.push(`raw HRC played[${definition.index}] is missing or not numeric`);
      }
      if (ev === null) {
        handsWithMissingEvs.add(hand);
        actionWarnings.push(`raw HRC evs[${definition.index}] is missing or not numeric`);
      }

      return buildConvertedAction(definition, frequency, ev, actionWarnings);
    });

    const totalFrequency = actions.reduce((sum, action) => sum + action.frequency, 0);
    const combinedHandWarnings = Array.from(
      new Set([...handWarnings, ...actions.flatMap((action) => action.warnings)])
    );
    for (const warning of combinedHandWarnings) {
      warnings.add(warning);
    }

    strategy[hand] = {
      hand,
      actions,
      totalFrequency,
      warnings: combinedHandWarnings
    };
  }

  const candidateRecord = buildCandidateRecord(input, strategy);
  const candidateValidation = validateMultiActionImportV2Record(candidateRecord);
  const rawValidation = validateMultiActionImportV2Record(input);
  const privacyScan = scanForSensitivePatterns(input);
  const actionsWithMissingAmount = actionDefinitions
    .filter((action) => action.amount === null && (action.action === "CALL" || action.action === "RAISE" || action.action === "BET"))
    .map((action) => `actions[${action.index}] ${action.rawType}`);
  const unknownActionTypes = Array.from(
    new Set(actionDefinitions.filter((action) => action.action === "UNKNOWN").map((action) => action.rawType))
  );

  const report: HrcRawNodeAdapterReport = {
    sourceShape: HRC_RAW_NODE_SOURCE_SHAPE,
    targetShape: HRC_RAW_NODE_TARGET_SHAPE,
    isProductImportPayload: false,
    productImportRouteConnected: false,
    handCount: Object.keys(hands).length,
    actionCount: actionDefinitions.length,
    convertedHandCount: Object.keys(strategy).length,
    convertedActionCount: Object.values(strategy).reduce((sum, hand) => sum + hand.actions.length, 0),
    unknownActionTypes,
    handsWithLengthMismatch: Array.from(handsWithLengthMismatch),
    handsWithMissingEvs: Array.from(handsWithMissingEvs),
    handsWithMissingPlayed: Array.from(handsWithMissingPlayed),
    actionsWithMissingAmount,
    amountSemantics: buildHrcRawAmountSemanticsReport(input),
    sourceMetadataCandidate: buildHrcRawSourceMetadataCandidate(input),
    spotCandidate: buildHrcRawSpotCandidate(input),
    privacySafe: privacyScan.matchedPatterns.length === 0,
    privacyPatternMatches: privacyScan.matchedPatterns,
    rawValidator: snapshotValidator(rawValidation),
    candidateValidator: snapshotValidator(candidateValidation),
    warnings: Array.from(warnings)
  };

  return {
    strategy,
    candidateRecord,
    report
  };
}

export function buildHrcRawAdapterReport(input: unknown): HrcRawNodeAdapterReport {
  return convertHrcRawNodeToMultiActionStrategy(input).report;
}

export function buildHrcRawAmountSemanticsReport(input: unknown): HrcRawAmountSemanticsReport {
  const actionDefinitions = readActionDefinitions(readRawNode(input));
  const rawActionAmounts = actionDefinitions.map((action) => action.amount);
  const uniqueRawActionAmounts = Array.from(
    new Set(rawActionAmounts.filter((amount): amount is number => amount !== null))
  ).sort((left, right) => left - right);

  return {
    rawActionAmounts,
    uniqueRawActionAmounts,
    actionsWithAmount: actionDefinitions
      .filter((action) => action.amount !== null)
      .map((action) => `actions[${action.index}] ${action.rawType}: ${trimZeros(action.amount ?? 0)}`),
    actionsWithoutAmount: actionDefinitions
      .filter((action) => action.amount === null)
      .map((action) => `actions[${action.index}] ${action.rawType}`),
    amountUnit: "UNKNOWN",
    amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
    sizeLabelPolicy: "PRESERVE_AS_RAW_SIZE_LABEL",
    bbConversionApplied: false,
    chipConversionApplied: false,
    warning: "HRC amount unit is not inferred in v2.4"
  };
}

export function buildHrcRawSourceMetadataCandidate(input: unknown): HrcRawSourceMetadataCandidate {
  const node = readRawNode(input);
  const settings = readRawSettings(input);
  const actionDefinitions = readActionDefinitions(node);
  const hands = readHands(node);
  const sequence = readSequence(node);

  return {
    source: "HRC_PRECOMPUTED_DB",
    sourceShape: HRC_RAW_NODE_SOURCE_SHAPE,
    targetShape: HRC_RAW_NODE_TARGET_SHAPE,
    originalTool: readMetadataString(input, "originalTool"),
    sampleKind: readMetadataString(input, "sampleKind"),
    sanitized: readMetadataBoolean(input, "sanitized"),
    rawZipCommitted: readMetadataBoolean(input, "rawZipCommitted"),
    streetScope: readMetadataString(input, "streetScope"),
    productImportRouteConnected: false,
    rawNodeKeys: Object.keys(node).sort(),
    settingsKeys: readSettingsKeys(settings),
    actionCount: actionDefinitions.length,
    handCount: Object.keys(hands).length,
    sequenceLength: sequence.length,
    rawActionTypes: actionDefinitions.map((action) => action.rawType),
    rawActionAmounts: actionDefinitions.map((action) => action.amount),
    amountUnit: "UNKNOWN",
    amountInterpretation: "RAW_HRC_AMOUNT_UNINTERPRETED",
    conversionWarnings: ["HRC amount unit is not inferred in v2.4", "No bb or chip conversion is applied"]
  };
}

export function buildHrcRawSpotCandidate(input: unknown): HrcRawSpotCandidateReport {
  const node = readRawNode(input);
  const sequence = readSequence(node);
  const street = readFiniteNumber(node.street);
  const player = readFiniteNumber(node.player);

  return {
    sourceShape: HRC_RAW_NODE_SOURCE_SHAPE,
    street,
    player,
    sequence,
    actionPathCandidate: sequence.map((item) => `${item.type ?? "UNKNOWN"}:${item.amount ?? "UNKNOWN"}`),
    decisionNodeCandidate: player === null && street === null ? null : `player:${player ?? "UNKNOWN"} street:${street ?? "UNKNOWN"}`,
    playerFromNode: player,
    sequenceActionTypes: sequence.map((item) => item.type ?? "UNKNOWN"),
    sequenceAmounts: sequence.map((item) => item.amount),
    tableSizeCandidate: null,
    playerCountCandidate: null,
    unknownFields: ["tableSizeCandidate", "playerCountCandidate"],
    warning: "spot candidate is read-only metadata and is not connected to canonical key/import logic"
  };
}

export function mapHrcActionTypeToAppActionKind(type: unknown): MultiActionKind {
  const normalized = normalizeHrcActionType(type);
  if (normalized === "F" || normalized === "FOLD") {
    return "FOLD";
  }
  if (normalized === "C" || normalized === "CALL") {
    return "CALL";
  }
  if (normalized === "R" || normalized === "RAISE") {
    return "RAISE";
  }
  return "UNKNOWN";
}

export function mapHrcActionAmountToSizeLabel(amount: unknown): string | null {
  const value = readFiniteNumber(amount);
  if (value === null || value <= 0) {
    return null;
  }
  return `HRC amount ${trimZeros(value)}`;
}

function readRawNode(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    return {};
  }
  if (isPlainObject(input.node)) {
    return input.node;
  }
  return input;
}

function readRawSettings(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    return {};
  }
  return isPlainObject(input.settings) ? input.settings : {};
}

function readSettingsKeys(settings: Record<string, unknown>): string[] {
  if (Array.isArray(settings.topLevelKeys)) {
    return settings.topLevelKeys.filter((key): key is string => typeof key === "string").sort();
  }
  return Object.keys(settings).sort();
}

function readActionDefinitions(node: Record<string, unknown>): HrcRawActionDefinition[] {
  const rawActions = Array.isArray(node.actions) ? node.actions : [];
  return rawActions.map((rawAction, index) => {
    const actionObject = isPlainObject(rawAction) ? rawAction : {};
    const rawType = typeof actionObject.type === "string" ? actionObject.type.trim() : "";
    const action = mapHrcActionTypeToAppActionKind(rawType);
    const amount = readFiniteNumber(actionObject.amount);
    const rawSizeLabel = mapHrcActionAmountToSizeLabel(amount);
    const warnings: string[] = [];

    if (action === "UNKNOWN") {
      warnings.push(`raw HRC action type '${rawType || "UNKNOWN"}' mapped to UNKNOWN`);
    }
    if ((action === "CALL" || action === "RAISE" || action === "BET") && rawSizeLabel === null) {
      warnings.push(`${action} raw HRC amount is not provided`);
    }

    return {
      index,
      rawType: rawType || "UNKNOWN",
      amount,
      action,
      size: rawSizeLabel === null ? null : { rawSizeLabel },
      warnings
    };
  });
}

function readHands(node: Record<string, unknown>): Record<string, Record<string, unknown>> {
  if (!isPlainObject(node.hands)) {
    return {};
  }

  const hands: Record<string, Record<string, unknown>> = {};
  for (const [hand, value] of Object.entries(node.hands)) {
    hands[hand] = isPlainObject(value) ? value : {};
  }
  return hands;
}

function readSequence(node: Record<string, unknown>): HrcRawSequenceItem[] {
  const rawSequence = Array.isArray(node.sequence) ? node.sequence : [];
  return rawSequence.map((item) => {
    const itemObject = isPlainObject(item) ? item : {};
    return {
      player: readFiniteNumber(itemObject.player),
      type: typeof itemObject.type === "string" && itemObject.type.trim().length > 0 ? itemObject.type.trim() : null,
      amount: readFiniteNumber(itemObject.amount),
      street: readFiniteNumber(itemObject.street)
    };
  });
}

function buildConvertedAction(
  definition: HrcRawActionDefinition,
  frequency: number | null,
  ev: number | null,
  warnings: string[]
): MultiActionImportV2Action {
  return {
    action: definition.action,
    size: definition.size,
    frequency: frequency ?? 0,
    ev,
    chipEv: null,
    icmEv: null,
    sourceActionLabel: definition.rawType,
    warnings: Array.from(new Set(warnings))
  };
}

function buildCandidateRecord(
  input: unknown,
  strategy: Record<string, MultiActionImportV2HandStrategy>
): MultiActionImportV2Record {
  return {
    schemaVersion: MULTI_ACTION_IMPORT_V2_SCHEMA_VERSION,
    spot: buildHrcRawSpotCandidate(input),
    strategy,
    sourceMetadata: buildHrcRawSourceMetadataCandidate(input)
  };
}

function snapshotValidator(result: ReturnType<typeof validateMultiActionImportV2Record>): ValidatorSnapshot {
  return {
    attempted: true,
    valid: result.valid,
    issueMessages: result.issues.map((issue) => `${issue.path}: ${issue.message}`),
    warningMessages: result.warnings.map((warning) => `${warning.path}: ${warning.message}`)
  };
}

function normalizeHrcActionType(type: unknown): string {
  return typeof type === "string" ? type.trim().toUpperCase() : "";
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMetadataString(input: unknown, key: string): string | null {
  if (!isPlainObject(input)) {
    return null;
  }
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readMetadataBoolean(input: unknown, key: string): boolean | null {
  if (!isPlainObject(input)) {
    return null;
  }
  const value = input[key];
  return typeof value === "boolean" ? value : null;
}

function scanForSensitivePatterns(input: unknown): { matchedPatterns: string[] } {
  const text = JSON.stringify(input);
  const matchedPatterns = SENSITIVE_PATTERNS.filter((pattern) => new RegExp(pattern, "i").test(text));
  return { matchedPatterns };
}

function trimZeros(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

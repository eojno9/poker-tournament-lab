import { HAND_KEYS } from "./hands.js";
import {
  buildMultiActionHandStrategy,
  normalizeMultiActionKind,
  type MultiActionKind,
  type MultiActionOptionInput,
  type MultiActionSize
} from "./multiActionStrategy.js";

export const MULTI_ACTION_IMPORT_V2_SCHEMA_VERSION = "multi-action-v2";

export interface MultiActionImportV2Action {
  action: MultiActionKind;
  size: MultiActionSize | null;
  frequency: number;
  ev: number | null;
  chipEv: number | null;
  icmEv: number | null;
  sourceActionLabel: string | null;
  warnings: string[];
}

export interface MultiActionImportV2HandStrategy {
  hand: string;
  actions: MultiActionImportV2Action[];
  totalFrequency: number | null;
  warnings: string[];
}

export interface MultiActionImportV2Record {
  schemaVersion: typeof MULTI_ACTION_IMPORT_V2_SCHEMA_VERSION;
  spot: unknown;
  strategy: Record<string, MultiActionImportV2HandStrategy>;
  sourceMetadata?: Record<string, unknown>;
}

export interface MultiActionImportV2Issue {
  path: string;
  message: string;
}

export interface MultiActionImportV2Summary {
  handCount: number;
  actionCount: number;
  multiActionHandCount: number;
  missingEvCount: number;
  warningCount: number;
  invalidCount: number;
}

export interface MultiActionImportV2ValidationResult {
  valid: boolean;
  issues: MultiActionImportV2Issue[];
  warnings: MultiActionImportV2Issue[];
  normalizedRecord: MultiActionImportV2Record | null;
  summary: MultiActionImportV2Summary;
}

interface NormalizedHandResult {
  hand: MultiActionImportV2HandStrategy | null;
  issues: MultiActionImportV2Issue[];
  warnings: MultiActionImportV2Issue[];
  missingEvCount: number;
  actionCount: number;
}

export function isMultiActionImportV2Record(record: unknown): boolean {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }
  const object = record as Record<string, unknown>;
  return isV2SchemaVersion(object.schemaVersion) || isV2SchemaVersion(object.strategySchemaVersion);
}

export function validateMultiActionImportV2Record(record: unknown): MultiActionImportV2ValidationResult {
  return normalizeMultiActionImportV2Record(record);
}

export function normalizeMultiActionImportV2Record(record: unknown): MultiActionImportV2ValidationResult {
  const issues: MultiActionImportV2Issue[] = [];
  const warnings: MultiActionImportV2Issue[] = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return buildResult(null, [{ path: "$", message: "record must be an object" }], warnings, emptySummary());
  }

  const object = record as Record<string, unknown>;
  if (!isMultiActionImportV2Record(object)) {
    issues.push({ path: "schemaVersion", message: "record is not a multi-action v2 import record" });
  }

  if (!("spot" in object)) {
    issues.push({ path: "spot", message: "record is missing spot" });
  }

  if (!object.strategy || typeof object.strategy !== "object" || Array.isArray(object.strategy)) {
    issues.push({ path: "strategy", message: "strategy must be an object keyed by hand" });
  }

  const strategyObject =
    object.strategy && typeof object.strategy === "object" && !Array.isArray(object.strategy)
      ? (object.strategy as Record<string, unknown>)
      : {};
  const normalizedStrategy: Record<string, MultiActionImportV2HandStrategy> = {};
  let actionCount = 0;
  let missingEvCount = 0;

  for (const [hand, rawHandStrategy] of Object.entries(strategyObject)) {
    const handResult = validateMultiActionHandActions(hand, readActions(rawHandStrategy));
    issues.push(...handResult.issues);
    warnings.push(...handResult.warnings);
    actionCount += handResult.actionCount;
    missingEvCount += handResult.missingEvCount;
    if (handResult.hand) {
      normalizedStrategy[handResult.hand.hand] = handResult.hand;
    }
  }

  const summary: MultiActionImportV2Summary = {
    handCount: Object.keys(strategyObject).length,
    actionCount,
    multiActionHandCount: Object.values(normalizedStrategy).filter((hand) => hand.actions.length > 1).length,
    missingEvCount,
    warningCount: warnings.length,
    invalidCount: issues.length
  };

  if (issues.length > 0) {
    return buildResult(null, issues, warnings, summary);
  }

  const normalizedRecord: MultiActionImportV2Record = {
    schemaVersion: MULTI_ACTION_IMPORT_V2_SCHEMA_VERSION,
    spot: object.spot,
    strategy: normalizedStrategy,
    ...(isPlainObject(object.sourceMetadata) ? { sourceMetadata: object.sourceMetadata } : {})
  };

  return buildResult(normalizedRecord, issues, warnings, summary);
}

export function validateMultiActionHandActions(hand: string, actions: unknown): NormalizedHandResult {
  const issues: MultiActionImportV2Issue[] = [];
  const warnings: MultiActionImportV2Issue[] = [];
  const normalizedHand = normalizeHandKey(hand);
  const pathPrefix = `strategy.${hand}`;

  if (!normalizedHand) {
    issues.push({ path: pathPrefix, message: "hand must use 169-hand notation" });
  }

  if (!Array.isArray(actions) || actions.length === 0) {
    issues.push({ path: `${pathPrefix}.actions`, message: "actions[] must be a non-empty array" });
    return { hand: null, issues, warnings, missingEvCount: 0, actionCount: 0 };
  }

  const normalizedActions: MultiActionImportV2Action[] = [];
  let missingEvCount = 0;

  actions.forEach((rawAction, actionIndex) => {
    const actionPath = `${pathPrefix}.actions[${actionIndex}]`;
    if (!rawAction || typeof rawAction !== "object" || Array.isArray(rawAction)) {
      issues.push({ path: actionPath, message: "action must be an object" });
      return;
    }

    const actionObject = rawAction as Record<string, unknown>;
    if (!("action" in actionObject)) {
      issues.push({ path: `${actionPath}.action`, message: "action is required" });
    }

    const action = normalizeMultiActionKind(actionObject.action);
    if (action === "UNKNOWN") {
      warnings.push({ path: `${actionPath}.action`, message: "UNKNOWN action should be reviewed" });
    }

    const frequency = readNumber(actionObject.frequency);
    if (frequency === null) {
      issues.push({ path: `${actionPath}.frequency`, message: "frequency must be a number from 0 to 1" });
    } else if (frequency < 0 || frequency > 1) {
      issues.push({ path: `${actionPath}.frequency`, message: "frequency must be between 0 and 1" });
    }

    const ev = readNullableNumber(actionObject.ev);
    const chipEv = readNullableNumber(actionObject.chipEv ?? actionObject.chipEV);
    const icmEv = readNullableNumber(actionObject.icmEv ?? actionObject.icmEV);
    for (const field of ["ev", "chipEv", "icmEv"] as const) {
      const sourceKey = field === "chipEv" ? "chipEV" : field === "icmEv" ? "icmEV" : field;
      if (actionObject[sourceKey] !== undefined && actionObject[sourceKey] !== null && readNullableNumber(actionObject[sourceKey]) === null) {
        issues.push({ path: `${actionPath}.${sourceKey}`, message: `${sourceKey} must be a number or null` });
      }
    }
    if (ev === null) {
      missingEvCount += 1;
    }

    const size = readActionSize(actionObject);
    if ((action === "RAISE" || action === "BET" || action === "CALL") && !size) {
      warnings.push({ path: `${actionPath}.size`, message: `${action} size is not provided` });
    }

    const optionInput: MultiActionOptionInput = {
      action,
      frequency,
      ev,
      chipEv,
      icmEv,
      sourceActionLabel: typeof actionObject.sourceActionLabel === "string" ? actionObject.sourceActionLabel : null,
      warnings: warningsForAction(warnings, actionPath),
      ...(size ? { size } : {})
    };
    const normalized = buildMultiActionHandStrategy({ hand: normalizedHand ?? hand, actions: [optionInput] }).actions[0];
    if (normalized) {
      normalizedActions.push({
        action: normalized.action,
        size: normalized.size,
        frequency: frequency ?? 0,
        ev: normalized.ev,
        chipEv: normalized.chipEv,
        icmEv: normalized.icmEv,
        sourceActionLabel: normalized.sourceActionLabel,
        warnings: normalized.warnings
      });
    }
  });

  const knownTotal = normalizedActions.reduce((sum, action) => sum + action.frequency, 0);
  if (knownTotal > 1.000001) {
    warnings.push({ path: `${pathPrefix}.actions`, message: "frequency total exceeds 1" });
  }

  if (!normalizedHand || issues.length > 0) {
    return { hand: null, issues, warnings, missingEvCount, actionCount: actions.length };
  }

  const handStrategy = buildMultiActionHandStrategy({ hand: normalizedHand, actions: normalizedActions });
  return {
    hand: {
      hand: normalizedHand,
      actions: normalizedActions,
      totalFrequency: handStrategy.totalFrequency,
      warnings: Array.from(new Set([...handStrategy.warnings, ...warnings.map((warning) => warning.message)]))
    },
    issues,
    warnings,
    missingEvCount,
    actionCount: actions.length
  };
}

export function summarizeMultiActionImportV2Record(record: unknown): MultiActionImportV2Summary {
  return validateMultiActionImportV2Record(record).summary;
}

function isV2SchemaVersion(value: unknown): boolean {
  return value === MULTI_ACTION_IMPORT_V2_SCHEMA_VERSION || value === "v2" || value === 2;
}

function readActions(rawHandStrategy: unknown): unknown {
  if (!rawHandStrategy || typeof rawHandStrategy !== "object" || Array.isArray(rawHandStrategy)) {
    return undefined;
  }
  return (rawHandStrategy as Record<string, unknown>).actions;
}

function normalizeHandKey(hand: string): string | null {
  const trimmed = hand.trim();
  const exact = HAND_KEYS.find((candidate) => candidate === trimmed);
  if (exact) {
    return exact;
  }
  const upper = trimmed.toUpperCase();
  return HAND_KEYS.find((candidate) => candidate.toUpperCase() === upper) ?? null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readNumber(value);
}

function readActionSize(action: Record<string, unknown>): MultiActionSize | null {
  const size: MultiActionSize = {};
  if (typeof action.sizeBb === "number" && Number.isFinite(action.sizeBb)) {
    size.sizeBb = action.sizeBb;
  }
  if (typeof action.sizePctPot === "number" && Number.isFinite(action.sizePctPot)) {
    size.sizePctPot = action.sizePctPot;
  }
  if (typeof action.isAllIn === "boolean") {
    size.isAllIn = action.isAllIn;
  }
  if (typeof action.rawSizeLabel === "string" && action.rawSizeLabel.trim().length > 0) {
    size.rawSizeLabel = action.rawSizeLabel.trim();
  }
  return Object.keys(size).length > 0 ? size : null;
}

function warningsForAction(warnings: MultiActionImportV2Issue[], actionPath: string): string[] {
  return warnings.filter((warning) => warning.path.startsWith(actionPath)).map((warning) => warning.message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildResult(
  normalizedRecord: MultiActionImportV2Record | null,
  issues: MultiActionImportV2Issue[],
  warnings: MultiActionImportV2Issue[],
  summary: MultiActionImportV2Summary
): MultiActionImportV2ValidationResult {
  return {
    valid: issues.length === 0,
    issues,
    warnings,
    normalizedRecord,
    summary: {
      ...summary,
      warningCount: warnings.length,
      invalidCount: issues.length
    }
  };
}

function emptySummary(): MultiActionImportV2Summary {
  return {
    handCount: 0,
    actionCount: 0,
    multiActionHandCount: 0,
    missingEvCount: 0,
    warningCount: 0,
    invalidCount: 0
  };
}

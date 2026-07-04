import {
  buildActionSizingAudit,
  extractAvailableActionSizingOptions,
  type ActionSizingOption,
  type ActionSizingSolutionLike,
  type DetectedAction,
  type SizeSignal
} from "@poker-tournament-lab/core";
import type { SolutionListItem } from "./api.js";

export interface DatabaseActionSizingSummary {
  actionPathText: string;
  treeConfig: string | null;
  detectedActions: DetectedAction[];
  detectedRaiseSizes: ActionSizingOption[];
  detectedAllInActions: ActionSizingOption[];
  candidates: ActionSizingOption[];
  sizeSignals: SizeSignal[];
  explicitSizeFieldPaths: string[];
  warnings: string[];
  hasUnknownUnspecified: boolean;
}

export function buildDatabaseActionSizingSummary(row: SolutionListItem): DatabaseActionSizingSummary {
  const treeConfig = deriveDatabaseActionSizingTreeConfig(row);
  const sourceMetadata = buildSourceMetadata(row);
  const audit = buildActionSizingAudit({
    spot: row.spot,
    treeConfig,
    strategy: row.strategy,
    sourceMetadata
  });
  const solution: ActionSizingSolutionLike = {
    canonicalKey: row.canonicalKey,
    fileName: row.fileName,
    sourceLabel: row.sourceLabel,
    spot: row.spot,
    strategy: row.strategy,
    databaseFeatures: row.databaseFeatures as Record<string, unknown> | null,
    metadata: sourceMetadata
  };
  if (treeConfig !== null) {
    solution.treeConfig = treeConfig;
  }
  const options = extractAvailableActionSizingOptions([solution]);
  const hasUnknownUnspecified = options.actions.some((item) => item.action === "UNKNOWN" || item.sizeKind === "UNSPECIFIED");
  const warnings = new Set<string>();
  for (const warning of options.warnings) {
    warnings.add(warning);
  }
  for (const risk of audit.risks) {
    warnings.add(risk);
  }
  if (hasUnknownUnspecified) {
    warnings.add("UNKNOWN/UNSPECIFIED는 imported data에 명시적 size 정보가 부족하다는 뜻입니다.");
  }

  return {
    actionPathText: row.spot.actionPath.length > 0 ? row.spot.actionPath.join(", ") : "제공되지 않음",
    treeConfig,
    detectedActions: audit.detectedActions,
    detectedRaiseSizes: options.actions.filter((item) => item.sizeKind === "RAISE_SIZE"),
    detectedAllInActions: options.actions.filter((item) => item.sizeKind === "ALL_IN" || item.action === "SHOVE" || item.action === "ALL_IN"),
    candidates: options.actions,
    sizeSignals: audit.sizeSignals,
    explicitSizeFieldPaths: audit.explicitSizeFieldPaths,
    warnings: Array.from(warnings),
    hasUnknownUnspecified
  };
}

function deriveDatabaseActionSizingTreeConfig(row: SolutionListItem): string | null {
  if (row.databaseFeatures?.spotFamily) {
    return row.databaseFeatures.spotFamily;
  }
  if (row.spot.actionPath.length > 0) {
    return "open_shove_only";
  }
  return null;
}

function buildSourceMetadata(row: SolutionListItem): Record<string, unknown> {
  return {
    fileName: row.fileName,
    sourceLabel: row.sourceLabel,
    externalId: row.externalId,
    databaseFeatures: row.databaseFeatures
  };
}

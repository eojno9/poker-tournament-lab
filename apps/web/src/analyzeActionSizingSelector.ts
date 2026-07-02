import type {
  ActionSizingFilter,
  ActionSizingOption,
  ActionSizingSolutionLike
} from "@poker-tournament-lab/core";
import type { SolutionListItem } from "./api.js";
import type { AnalyzeFormState } from "./analyzeForm.js";

export interface AnalyzeActionSizingApplyResult {
  formState: AnalyzeFormState;
  appliedActionPathText: string | null;
}

export function buildAnalyzeActionSizingFilter(formState: AnalyzeFormState): ActionSizingFilter {
  const filter: ActionSizingFilter = {};
  const heroPosition = formState.heroPosition.trim();
  if (heroPosition.length > 0) {
    filter.heroPosition = heroPosition;
  }
  if (Number.isFinite(formState.tableSize)) {
    filter.tableSize = formState.tableSize;
  }
  return filter;
}

export function buildAnalyzeActionSizingSolutions(rows: SolutionListItem[]): ActionSizingSolutionLike[] {
  return rows.map((row) => {
    const treeConfig = deriveActionSizingTreeConfig(row);
    const solution: ActionSizingSolutionLike = {
      canonicalKey: row.canonicalKey,
      fileName: row.fileName,
      sourceLabel: row.sourceLabel,
      spot: row.spot,
      strategy: row.strategy,
      databaseFeatures: row.databaseFeatures as Record<string, unknown> | null
    };
    if (treeConfig !== null) {
      solution.treeConfig = treeConfig;
    }
    return solution;
  });
}

export function applyActionSizingCandidateToForm(
  formState: AnalyzeFormState,
  option: ActionSizingOption
): AnalyzeActionSizingApplyResult {
  const example = option.examples[0] ?? null;
  const actionPathText = example && example.actionPath.length > 0 ? example.actionPath.join(", ") : null;
  if (!actionPathText) {
    return {
      formState,
      appliedActionPathText: null
    };
  }

  return {
    formState: {
      ...formState,
      actionPathText
    },
    appliedActionPathText: actionPathText
  };
}

export function formatActionSizingOption(option: ActionSizingOption): string {
  const size = option.sizeBb !== undefined ? `${option.sizeLabel} (${option.sizeBb}bb)` : option.sizeLabel;
  return `${option.action} / ${size} / ${option.sizeKind}`;
}

function deriveActionSizingTreeConfig(row: SolutionListItem): string | null {
  if (row.databaseFeatures?.spotFamily) {
    return row.databaseFeatures.spotFamily;
  }
  if (Array.isArray(row.spot.actionPath) && row.spot.actionPath.length > 0) {
    return "open_shove_only";
  }
  return null;
}

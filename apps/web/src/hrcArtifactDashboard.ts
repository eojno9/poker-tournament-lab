import type {
  HrcDryRunArtifactKind,
  HrcDryRunArtifactListItem,
  HrcDryRunArtifactsListResponse
} from "./api.js";

export type HrcArtifactPrivacyFilter = "ALL" | "SAFE" | "WARNING" | "UNKNOWN";

export interface HrcArtifactDashboardFilters {
  kind: HrcDryRunArtifactKind | "ALL";
  status: string;
  privacySafe: HrcArtifactPrivacyFilter;
}

export interface HrcArtifactDashboardSummary {
  directoryExists: boolean;
  totalItems: number;
  invalidItemsCount: number;
  reportCount: number;
  indexCount: number;
  comparisonCount: number;
  unknownCount: number;
  safetyBadges: Array<{ label: string; value: string }>;
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const WINDOWS_USER_PATH_PATTERN = /[A-Z]:[\\/]+Users[\\/]+[^\s"'<>)}\]]+/gi;

export const HRC_ARTIFACT_ALLOWED_GET_ENDPOINTS = [
  "GET /api/hrc-dry-run-artifacts",
  "GET /api/hrc-dry-run-artifacts/:fileName"
] as const;

export const HRC_ARTIFACT_DASHBOARD_ACTION_LABELS = ["Refresh list", "Details"] as const;

export const HRC_ARTIFACT_FORBIDDEN_ACTION_TERMS = [
  "Import",
  "Export",
  "Run",
  "Upload",
  "Delete",
  "Write",
  "Solver",
  "Solve",
  "Analyze"
] as const;

export function buildHrcArtifactDashboardSummary(list: HrcDryRunArtifactsListResponse | null): HrcArtifactDashboardSummary {
  const items = list?.items ?? [];
  return {
    directoryExists: list?.directoryExists ?? false,
    totalItems: items.length,
    invalidItemsCount: list?.invalidItems.length ?? 0,
    reportCount: items.filter((item) => item.kind === "REPORT").length,
    indexCount: items.filter((item) => item.kind === "INDEX").length,
    comparisonCount: items.filter((item) => item.kind === "COMPARISON").length,
    unknownCount: items.filter((item) => item.kind === "UNKNOWN").length,
    safetyBadges: [
      { label: "productImportConnected", value: formatHrcArtifactBoolean(list?.safety.productImportConnected ?? false) },
      { label: "dbWriteApplied", value: formatHrcArtifactBoolean(list?.safety.dbWriteApplied ?? false) },
      { label: "batchRunnerExecuted", value: formatHrcArtifactBoolean(list?.safety.batchRunnerExecuted ?? false) },
      { label: "rawZipRead", value: formatHrcArtifactBoolean(list?.safety.rawZipRead ?? false) }
    ]
  };
}

export function filterHrcArtifactItems(
  items: HrcDryRunArtifactListItem[],
  filters: HrcArtifactDashboardFilters
): HrcDryRunArtifactListItem[] {
  return items
    .filter((item) => filters.kind === "ALL" || item.kind === filters.kind)
    .filter((item) => filters.status === "ALL" || (item.status ?? "UNKNOWN") === filters.status)
    .filter((item) => {
      if (filters.privacySafe === "ALL") {
        return true;
      }
      if (filters.privacySafe === "SAFE") {
        return item.privacySafe === true;
      }
      if (filters.privacySafe === "WARNING") {
        return item.privacySafe === false;
      }
      return item.privacySafe === null;
    })
    .sort(compareHrcArtifactItems);
}

export function compareHrcArtifactItems(left: HrcDryRunArtifactListItem, right: HrcDryRunArtifactListItem): number {
  return (
    left.kind.localeCompare(right.kind) ||
    left.fileName.localeCompare(right.fileName) ||
    (left.generatedAt ?? "").localeCompare(right.generatedAt ?? "")
  );
}

export function getHrcArtifactStatusOptions(items: HrcDryRunArtifactListItem[]): string[] {
  return Array.from(new Set(items.map((item) => item.status ?? "UNKNOWN"))).sort((left, right) => left.localeCompare(right));
}

export function sanitizeHrcArtifactDisplayText(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
  return text
    .replace(EMAIL_PATTERN, "<redacted-email>")
    .replace(WINDOWS_USER_PATH_PATTERN, "<redacted-windows-path>")
    .replace(/\bsample-user\b/gi, "<redacted-user>")
    .replace(/\b(AppData|Desktop|Documents)\b/gi, "<redacted-path-token>")
    .replace(/\b(playerName|nickname|screenname|userName)\b/gi, "<redacted-field>");
}

export function formatHrcArtifactBoolean(value: boolean | null | undefined): string {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "unknown";
}

export function formatHrcArtifactNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-US") : "unknown";
}

export function formatHrcArtifactDate(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? sanitizeHrcArtifactDisplayText(value) : date.toLocaleString("ko-KR");
}

export function isForbiddenHrcArtifactActionLabel(label: string): boolean {
  return HRC_ARTIFACT_FORBIDDEN_ACTION_TERMS.some((term) => label.toLowerCase().includes(term.toLowerCase()));
}

export function formatHrcArtifactJsonPreview(value: unknown, maxLength = 1800): string {
  const text = sanitizeHrcArtifactDisplayText(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n...<truncated>`;
}

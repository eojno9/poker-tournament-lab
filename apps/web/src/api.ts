import type {
  AnalyzeRequest,
  AnalyzeResult,
  CanonicalDiffInput,
  CanonicalKeyDiffResult,
  EvSummary,
  HrcDatabaseFeatures,
  HrcImportPayload,
  SpotInput,
  StrategyMatrix
} from "@poker-tournament-lab/core";

export interface ImportResponse {
  import: {
    id: number;
    name: string;
    format: "json" | "csv";
    fileName: string | null;
    fileHash: string;
    rowCount: number;
    createdAt: string;
    databaseFeatures: HrcDatabaseFeatures | null;
  };
  canonicalKeys: string[];
}

export interface SolutionListItem {
  id: number;
  importId: number;
  canonicalKey: string;
  sourceLabel: string;
  externalId: string | null;
  importedAt: string;
  fileName: string | null;
  fileHash: string;
  databaseFeatures: HrcDatabaseFeatures | null;
  spot: SpotInput;
  strategy: StrategyMatrix;
  evSummary: EvSummary | null;
}

export type ReportStatus = "available" | "missing" | "invalid";

export interface LatestReportEnvelope<TSummary> {
  status: ReportStatus;
  fileName: string;
  generatedAt: string | null;
  summary: TSummary | null;
  error: string | null;
}

export interface ImportReportSummary {
  importedFiles: number | null;
  skippedFiles: number | null;
  discardedHrczFiles: number | null;
  importedRecords: number | null;
  failedRecords: number | null;
  warnings: string[];
  skippedDetails: Array<{ fileName: string; reason: string }>;
  discardedHrczList: string[];
}

export interface VerificationReportSummary {
  exactLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
    failures: Array<{ id: number | null; reason: string }>;
  };
  randomLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
    failures: Array<{ id: number | null; reason: string }>;
  };
  duplicateCanonicalKeyCount: number | null;
  nearMatchFalsePositiveCount: number | null;
  duplicateCanonicalKeyDetails: Array<{ canonicalKey: string; count: number | null }>;
  nearMatchFalsePositives: Array<{
    id: number | null;
    mutation: string | null;
    source: string | null;
    status: number | null;
  }>;
}

export interface CanonicalKeyReportSummary {
  mismatchCount: number | null;
  updatedCount: number | null;
  collisionCount: number | null;
  invalidCount: number | null;
}

export interface LatestReportsSummary {
  importReport: LatestReportEnvelope<ImportReportSummary>;
  verificationReport: LatestReportEnvelope<VerificationReportSummary>;
  canonicalKeyReport: LatestReportEnvelope<CanonicalKeyReportSummary>;
}

export interface DbHealthSummary {
  totalSolutions: number;
  totalStrategyEntries: number;
  distinctCanonicalKeys: number;
  duplicateCanonicalKeyCount: number;
  latestImportStatus: ReportStatus;
  latestVerificationStatus: ReportStatus;
  latestCanonicalKeyReportStatus: ReportStatus;
  exactLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
  };
  randomLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
  };
  nearMatchFalsePositiveCount: number | null;
  discardedHrczCount: number | null;
  skippedFileCount: number | null;
  failedRecordCount: number | null;
  canonicalKey: {
    mismatchCount: number | null;
    updatedCount: number | null;
    collisionCount: number | null;
    invalidCount: number | null;
  };
}

export type ImportValidationStatus = "PASS" | "WARN" | "FAIL";
export type ImportValidationSeverity = "error" | "warning";

export interface ImportValidationIssue {
  rowNumber: number | null;
  severity: ImportValidationSeverity;
  code: string;
  field: string | null;
  message: string;
}

export interface DuplicateCanonicalPreview {
  canonicalKey: string;
  rowNumbers: number[];
  count: number;
}

export interface ImportValidationSummary {
  status: ImportValidationStatus;
  format: "json" | "csv";
  totalRows: number;
  validRows: number;
  failedRows: number;
  errorCount: number;
  warningCount: number;
  duplicateCanonicalKeyCount: number;
  duplicateCanonicalKeyPreview: DuplicateCanonicalPreview[];
  issues: ImportValidationIssue[];
  generatedAt: string;
  schemaVersion?: string | null;
  multiActionStrategyCount?: number;
  multiActionHandCount?: number;
  actionCount?: number;
  multiActionWarningCount?: number;
  multiActionInvalidCount?: number;
}

export interface CanonicalKeyDiffRequest {
  left: SpotInput | CanonicalDiffInput;
  right: SpotInput | CanonicalDiffInput;
}

export async function analyzeSpot(request: AnalyzeRequest): Promise<AnalyzeResult> {
  return postJson<AnalyzeResult>("/api/analyze", request);
}

export async function importHrc(payload: HrcImportPayload): Promise<ImportResponse> {
  return postJson<ImportResponse>("/api/imports/hrc", payload);
}

export async function listImports(): Promise<ImportResponse["import"][]> {
  const response = await fetch("/api/imports");
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const json = (await response.json()) as { imports: ImportResponse["import"][] };
  return json.imports;
}

export async function listSolutions(search = "", limit = 200): Promise<SolutionListItem[]> {
  const response = await fetch(`/api/solutions?search=${encodeURIComponent(search)}&limit=${limit}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const json = (await response.json()) as { solutions: SolutionListItem[] };
  return json.solutions;
}

export async function getLatestReportsSummary(): Promise<LatestReportsSummary> {
  const response = await fetch("/api/reports/latest");
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as LatestReportsSummary;
}

export async function getDbHealthSummary(): Promise<DbHealthSummary> {
  const response = await fetch("/api/db/health");
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as DbHealthSummary;
}

export async function validateHrcImport(payload: Pick<HrcImportPayload, "format" | "content" | "fileName" | "sourceLabel">): Promise<ImportValidationSummary> {
  return postJson<ImportValidationSummary>("/api/imports/validate", payload);
}

export async function diffCanonicalKeys(payload: CanonicalKeyDiffRequest): Promise<CanonicalKeyDiffResult> {
  return postJson<CanonicalKeyDiffResult>("/api/canonical-key/diff", payload);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }

  return (await response.json()) as T;
}

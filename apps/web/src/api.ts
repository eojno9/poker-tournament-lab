import type {
  AnalyzeRequest,
  AnalyzeResult,
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
  };
  randomLookup: {
    success: number | null;
    total: number | null;
    successRatePct: number | null;
  };
  duplicateCanonicalKeyCount: number | null;
  nearMatchFalsePositiveCount: number | null;
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

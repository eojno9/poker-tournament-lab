import type { AnalyzeRequest, AnalyzeResult, HrcDatabaseFeatures, HrcImportPayload } from "@poker-tournament-lab/core";

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
  spot: unknown;
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

export async function listSolutions(search = ""): Promise<SolutionListItem[]> {
  const response = await fetch(`/api/solutions?search=${encodeURIComponent(search)}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const json = (await response.json()) as { solutions: SolutionListItem[] };
  return json.solutions;
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

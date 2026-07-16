import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BadgeCheck, Loader2, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import {
  getHrcDryRunArtifactDetail,
  listHrcDryRunArtifacts,
  type HrcDryRunArtifactDetailResponse,
  type HrcDryRunArtifactInvalidItem,
  type HrcDryRunArtifactListItem,
  type HrcDryRunArtifactsListResponse
} from "./api.js";
import { toUserFacingApiError } from "./apiError.js";
import {
  buildHrcArtifactDashboardSummary,
  filterHrcArtifactItems,
  formatHrcArtifactBoolean,
  formatHrcArtifactDate,
  formatHrcArtifactJsonPreview,
  formatHrcArtifactNumber,
  getHrcArtifactStatusOptions,
  sanitizeHrcArtifactDisplayText,
  type HrcArtifactDashboardFilters
} from "./hrcArtifactDashboard.js";

export function HrcArtifactView() {
  const [list, setList] = useState<HrcDryRunArtifactsListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<HrcArtifactDashboardFilters>({ kind: "ALL", status: "ALL", privacySafe: "ALL" });
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [detail, setDetail] = useState<HrcDryRunArtifactDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function refreshList() {
    setLoading(true);
    setError(null);
    try {
      const response = await listHrcDryRunArtifacts();
      setList(response);
      setDetail(null);
      setSelectedFileName(null);
      setDetailError(null);
    } catch (caught) {
      setError(sanitizeHrcArtifactDisplayText(toUserFacingApiError(caught, "HRC artifact 목록 조회에 실패했습니다.")));
      setList(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(fileName: string) {
    setSelectedFileName(fileName);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await getHrcDryRunArtifactDetail(fileName));
    } catch (caught) {
      setDetailError(sanitizeHrcArtifactDisplayText(toUserFacingApiError(caught, "HRC artifact detail 조회에 실패했습니다.")));
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void refreshList();
  }, []);

  const summary = useMemo(() => buildHrcArtifactDashboardSummary(list), [list]);
  const statusOptions = useMemo(() => getHrcArtifactStatusOptions(list?.items ?? []), [list]);
  const filteredItems = useMemo(() => filterHrcArtifactItems(list?.items ?? [], filters), [filters, list]);
  const invalidItems = list?.invalidItems ?? [];
  const isEmpty = Boolean(list) && filteredItems.length === 0 && invalidItems.length === 0;

  return (
    <section className="hrc-artifact-shell" data-testid="hrc-artifacts-view">
      <div className="panel stack">
        <div className="panel-title">
          <BadgeCheck size={18} />
          <h2>HRC Dry-run Artifacts</h2>
          <button className="icon-button" aria-label="목록 새로고침" title="목록 새로고침" type="button" onClick={() => void refreshList()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
          </button>
        </div>
        <div className="notice success" data-testid="hrc-artifact-readonly-notice">
          <strong>읽기 전용 대시보드입니다.</strong>
          <span>
            이 화면은 GET /api/hrc-dry-run-artifacts endpoint만 호출하며 DB write, batch script 실행, raw zip 읽기, product import route 연결을 수행하지 않습니다.
          </span>
        </div>
        <div className="detail-grid hrc-artifact-summary-grid" data-testid="hrc-artifact-summary">
          <DetailItem label="artifact directory" value={summary.directoryExists ? "present" : "not created"} />
          <DetailItem label="items" value={formatHrcArtifactNumber(summary.totalItems)} />
          <DetailItem label="invalid items" value={formatHrcArtifactNumber(summary.invalidItemsCount)} />
          <DetailItem label="reports" value={formatHrcArtifactNumber(summary.reportCount)} />
          <DetailItem label="indexes" value={formatHrcArtifactNumber(summary.indexCount)} />
          <DetailItem label="comparisons" value={formatHrcArtifactNumber(summary.comparisonCount)} />
        </div>
        <div className="hrc-artifact-safety-badges" data-testid="hrc-artifact-safety-badges">
          {summary.safetyBadges.map((badge) => (
            <span className="report-status-badge ok" key={badge.label}>
              {badge.label}: {badge.value}
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <div className="panel stack" data-testid="hrc-artifact-list-error">
          <div className="panel-title">
            <AlertTriangle size={18} />
            <h2>목록 오류</h2>
          </div>
          <p className="error-text">HRC artifact 목록 조회에 실패했습니다: {error}</p>
        </div>
      ) : null}

      <div className="panel stack">
        <div className="panel-title">
          <Search size={18} />
          <h2>Artifact 목록</h2>
        </div>
        <div className="hrc-artifact-filters" data-testid="hrc-artifact-filters">
          <label>
            종류
            <select
              aria-label="HRC artifact 종류 필터"
              value={filters.kind}
              onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value as HrcArtifactDashboardFilters["kind"] }))}
            >
              <option value="ALL">All</option>
              <option value="REPORT">Report</option>
              <option value="INDEX">Index</option>
              <option value="COMPARISON">Comparison</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            상태
            <select
              aria-label="HRC artifact 상태 필터"
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="ALL">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            privacy 상태
            <select
              aria-label="HRC artifact privacy 필터"
              value={filters.privacySafe}
              onChange={(event) => setFilters((current) => ({ ...current, privacySafe: event.target.value as HrcArtifactDashboardFilters["privacySafe"] }))}
            >
              <option value="ALL">All</option>
              <option value="SAFE">Safe</option>
              <option value="WARNING">Warning</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
        </div>

        {isEmpty ? (
          <div className="empty-result hrc-artifact-empty" data-testid="hrc-artifact-empty-state">
            <div>
              <h3>dry-run artifact report가 없습니다.</h3>
              <p>이 대시보드는 폴더나 파일을 만들지 않습니다. 명시적으로 실행한 CLI가 만든 sanitized JSON만 여기에 표시됩니다.</p>
            </div>
          </div>
        ) : null}

        {filteredItems.length > 0 ? (
          <HrcArtifactList items={filteredItems} selectedFileName={selectedFileName} onSelect={(fileName) => void loadDetail(fileName)} />
        ) : null}

        {invalidItems.length > 0 ? <HrcArtifactInvalidItems items={invalidItems} /> : null}
      </div>

      <div className="panel stack" data-testid="hrc-artifact-detail-panel">
        <div className="panel-title">
          <SlidersHorizontal size={18} />
          <h2>Artifact 상세</h2>
        </div>
        {!selectedFileName && !detail && !detailLoading && !detailError ? (
          <p className="muted">sanitized artifact JSON 행에서 상세를 선택하면 안전한 요약을 확인할 수 있습니다.</p>
        ) : null}
        {detailLoading ? <p className="muted">안전 요약을 불러오는 중...</p> : null}
        {detailError ? <p className="error-text">상세 조회에 실패했습니다: {detailError}</p> : null}
        {detail ? <HrcArtifactDetail detail={detail} /> : null}
      </div>
    </section>
  );
}

function HrcArtifactList({
  items,
  selectedFileName,
  onSelect
}: {
  items: HrcDryRunArtifactListItem[];
  selectedFileName: string | null;
  onSelect: (fileName: string) => void;
}) {
  return (
    <div className="range-table hrc-artifact-table" data-testid="hrc-artifact-list">
      <div className="range-row range-head hrc-artifact-row">
        <span>file</span>
        <span>kind</span>
        <span>generated</span>
        <span>status</span>
        <span>zip name</span>
        <span>node</span>
        <span>privacy</span>
        <span>validator</span>
        <span>warn</span>
        <span>error</span>
        <span>mismatch</span>
        <span>modified</span>
        <span>details</span>
      </div>
      {items.map((item) => (
        <div className={`range-row hrc-artifact-row${item.fileName === selectedFileName ? " selected" : ""}`} key={item.fileName} data-testid="hrc-artifact-row">
          <span title={sanitizeHrcArtifactDisplayText(item.fileName)}>{sanitizeHrcArtifactDisplayText(item.fileName)}</span>
          <span>{item.kind}</span>
          <span>{formatHrcArtifactDate(item.generatedAt)}</span>
          <span>{sanitizeHrcArtifactDisplayText(item.status ?? "unknown")}</span>
          <span>{sanitizeHrcArtifactDisplayText(item.zipFileNameSanitized ?? "unknown")}</span>
          <span>{sanitizeHrcArtifactDisplayText(item.selectedNodeEntry ?? "unknown")}</span>
          <span>{formatHrcArtifactBoolean(item.privacySafe)}</span>
          <span>{formatHrcArtifactBoolean(item.validatorPass)}</span>
          <span>{formatHrcArtifactNumber(item.warningsCount)}</span>
          <span>{formatHrcArtifactNumber(item.errorsCount)}</span>
          <span>{formatHrcArtifactNumber(item.mismatchCount)}</span>
          <span>{formatHrcArtifactDate(item.modifiedAt)}</span>
          <span>
            <button className="preset-action compact-action" type="button" onClick={() => onSelect(item.fileName)}>
              상세
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function HrcArtifactInvalidItems({ items }: { items: HrcDryRunArtifactInvalidItem[] }) {
  return (
    <div className="result-block" data-testid="hrc-artifact-invalid-items">
      <h3>Invalid artifact JSON</h3>
      <div className="range-table">
        <div className="range-row hrc-artifact-invalid-row range-head">
          <span>file</span>
          <span>reason</span>
          <span>safe error</span>
        </div>
        {items.map((item) => (
          <div className="range-row hrc-artifact-invalid-row" key={`${item.fileName}:${item.reason}`}>
            <span>{sanitizeHrcArtifactDisplayText(item.fileName)}</span>
            <span>{sanitizeHrcArtifactDisplayText(item.reason)}</span>
            <span>{sanitizeHrcArtifactDisplayText(item.error ?? "none")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HrcArtifactDetail({ detail }: { detail: HrcDryRunArtifactDetailResponse }) {
  const summary = detail.summary;
  return (
    <div className="hrc-artifact-detail" data-testid="hrc-artifact-detail">
      <div className="detail-grid">
        <DetailItem label="fileName" value={sanitizeHrcArtifactDisplayText(detail.fileName)} />
        <DetailItem label="kind" value={detail.kind} />
        <DetailItem label="status" value={sanitizeHrcArtifactDisplayText(summary.status ?? "unknown")} />
        <DetailItem label="validatorPass" value={formatHrcArtifactBoolean(summary.validatorPass)} />
        <DetailItem label="privacySafe" value={formatHrcArtifactBoolean(summary.privacySafe)} />
        <DetailItem label="selectedNodeEntry" value={sanitizeHrcArtifactDisplayText(summary.selectedNodeEntry ?? "unknown")} />
        <DetailItem label="warningsCount" value={formatHrcArtifactNumber(summary.warningsCount)} />
        <DetailItem label="errorsCount" value={formatHrcArtifactNumber(summary.errorsCount)} />
        <DetailItem label="mismatchCount" value={formatHrcArtifactNumber(summary.mismatchCount)} />
        <DetailItem label="rawZipCommitted" value={formatHrcArtifactBoolean(summary.safetyFlags.rawZipCommitted)} />
        <DetailItem label="productImportConnected" value={formatHrcArtifactBoolean(summary.safetyFlags.productImportConnected)} />
        <DetailItem label="dbWriteApplied" value={formatHrcArtifactBoolean(summary.safetyFlags.dbWriteApplied)} />
      </div>
      <div className="hrc-artifact-safety-badges">
        <span className="report-status-badge ok">readOnly: {formatHrcArtifactBoolean(detail.detail.safety.readOnly)}</span>
        <span className="report-status-badge ok">batchRunnerExecuted: {formatHrcArtifactBoolean(detail.detail.safety.batchRunnerExecuted)}</span>
        <span className="report-status-badge ok">rawZipRead: {formatHrcArtifactBoolean(detail.detail.safety.rawZipRead)}</span>
        <span className="report-status-badge ok">uiUsed: {formatHrcArtifactBoolean(detail.detail.safety.uiUsed)}</span>
      </div>
      <div className="info-grid">
        <HrcArtifactJsonPreview title="Adapter report summary" value={detail.detail.adapterReportSummary} />
        <HrcArtifactJsonPreview title="Validator result" value={detail.detail.validatorResult} />
        <HrcArtifactJsonPreview title="Mismatch summary" value={detail.detail.mismatchSummary} />
        <HrcArtifactJsonPreview title="Index summary" value={detail.detail.indexSummary} />
        <HrcArtifactJsonPreview title="Comparison summary" value={detail.detail.comparisonSummary} />
        <div className="info-list">
          <h3>Privacy warnings</h3>
          {detail.detail.privacyWarnings.length === 0 ? (
            <p className="muted">none</p>
          ) : (
            detail.detail.privacyWarnings.map((warning) => <p key={warning}>{sanitizeHrcArtifactDisplayText(warning)}</p>)
          )}
        </div>
      </div>
    </div>
  );
}

function HrcArtifactJsonPreview({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="info-list">
      <h3>{title}</h3>
      <pre className="spot-json-preview">{formatHrcArtifactJsonPreview(value)}</pre>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

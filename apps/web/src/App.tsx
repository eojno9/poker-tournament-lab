import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BookmarkPlus,
  Database,
  Download,
  FileUp,
  GraduationCap,
  History,
  Loader2,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import {
  extractAvailableActionSizingOptions,
  formatActionEv,
  formatActionFrequency,
  formatActionSize,
  HAND_KEYS,
  RESULT_SOURCES,
  type ActionSizingOption,
  type ActionSizingOptionsResult,
  type CanonicalDiffInput,
  type CanonicalKeyDiffResult,
  type AnalyzeRequest,
  type AnalyzeResult,
  type HrcDatabaseFeatures,
  type HrcImportPayload,
  type SpotInput,
  type StrategyMatrix,
  type VillainRangeSensitivityLabel,
  type VillainRangeSensitivityRank
} from "@poker-tournament-lab/core";
import {
  analyzeSpot,
  diffCanonicalKeys,
  getDbHealthSummary,
  getLatestReportsSummary,
  importHrc,
  listImports,
  listSolutions,
  validateHrcImport,
  type DbHealthSummary,
  type CanonicalKeyReportSummary,
  type DuplicateCanonicalPreview,
  type ImportValidationIssue,
  type ImportValidationSummary,
  type ImportReportSummary,
  type ImportResponse,
  type LatestReportEnvelope,
  type LatestReportsSummary,
  type SolutionListItem,
  type VerificationReportSummary
} from "./api.js";
import { toUserFacingApiError } from "./apiError.js";
import { defaultSpot, sampleImportPayload } from "./sampleData.js";
import {
  analyzeFormStateFromSpot,
  buildAnalyzeRequestFromForm,
  defaultAnalyzeFormState,
  positionsForTableSize,
  resizePlayers,
  type AnalyzeFormState,
  type VillainPresetOption
} from "./analyzeForm.js";
import {
  applyAnalyzePreset,
  deleteAnalyzePreset,
  loadAnalyzePresets,
  saveAnalyzePreset,
  type AnalyzePreset
} from "./analyzePresets.js";
import {
  addRecentAnalysis,
  buildRecentAnalysisSummary,
  clearRecentAnalyses,
  deleteRecentAnalysis,
  loadRecentAnalyses,
  type RecentAnalysisEntry
} from "./recentAnalyses.js";
import { TrainerView } from "./TrainerView.js";
import { HrcArtifactView } from "./HrcArtifactView.js";
import { buildSensitivitySummaryFromAnalyzeResult } from "./sensitivityAdapter.js";
import { buildEvComparisonFromAnalyzeResult } from "./evComparisonAdapter.js";
import { buildRangePresetComparisonFromAnalyzeResult } from "./rangePresetComparisonAdapter.js";
import {
  applyActionSizingCandidateToForm,
  buildAnalyzeActionSizingFilter,
  buildAnalyzeActionSizingSolutions,
  formatActionSizingOption
} from "./analyzeActionSizingSelector.js";
import { buildDatabaseActionSizingSummary } from "./databaseActionSizingSummary.js";
import { buildMultiActionFromAnalyzeResult, buildMultiActionFromSolution } from "./multiActionAdapter.js";
import { buildBrowserV2Model, type BrowserV2ActionView, type BrowserV2EvMode, type BrowserV2HandCell, type BrowserV2Model } from "./browserV2Model.js";
import {
  classifyActionTreeSpot,
  type ActionTreeActionKind,
  type ActionTreeClassification,
  type ActionTreeNode,
  type ActionTreeSpotType
} from "./actionTreeClassifier.js";

type Tab = "analyze" | "browser" | "import" | "database" | "trainer" | "hrcArtifacts";
type AnalyzeMode = "form" | "json";
type PresetNoticeTone = "success" | "error";

interface PresetNotice {
  tone: PresetNoticeTone;
  text: string;
}

interface AnalyzePrefillPayload {
  id: string;
  spot: unknown;
  context: AnalyzeHandoffContext;
}

interface AnalyzeHandoffContext {
  origin: "database";
  label: string;
  canonicalKey: string;
  heroPosition: string;
  tableSize: number | null;
  treeConfig: string;
}

interface DatabaseFilters {
  heroPosition: string;
  tableSize: string;
  stackMin: string;
  stackMax: string;
  treeConfig: string;
  sourceFile: string;
  canonicalKey: string;
}

interface SolutionCatalogItem {
  row: SolutionListItem;
  heroPosition: string;
  tableSize: number | null;
  heroStackBb: number | null;
  effectiveStackBb: number | null;
  treeConfig: string;
  strategyCount: number | null;
  sourceFile: string;
  canonicalKey: string;
  actionTree: ActionTreeClassification;
}

interface BrowserNodeCandidateSummary {
  candidateCount: number;
  availableActions: ActionTreeActionKind[];
  availableSizes: string[];
}

type ReportBadgeTone = "ok" | "warn" | "fail" | "missing";

interface ReportBadge {
  tone: ReportBadgeTone;
  label: string;
}

const sourceClass: Record<string, string> = {
  [RESULT_SOURCES.HRC_PRECOMPUTED_DB]: "source-hrc",
  [RESULT_SOURCES.FALLBACK_ICM]: "source-fallback",
  [RESULT_SOURCES.NOT_SOLVED]: "source-empty"
};

const sourceDescription: Record<string, string> = {
  [RESULT_SOURCES.HRC_PRECOMPUTED_DB]: "HRC 사전 계산 DB 정확 매칭",
  [RESULT_SOURCES.FALLBACK_ICM]: "Fallback ICM EV 평가",
  [RESULT_SOURCES.NOT_SOLVED]: "분석 불가 / 지원 범위 밖"
};

const defaultDatabaseFilters: DatabaseFilters = {
  heroPosition: "",
  tableSize: "",
  stackMin: "",
  stackMax: "",
  treeConfig: "",
  sourceFile: "",
  canonicalKey: ""
};

const initialFormState = defaultAnalyzeFormState(defaultSpot);
const initialAnalyzeRequest = buildAnalyzeRequestFromForm(initialFormState).request;

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("analyze");
  const [analyzePrefill, setAnalyzePrefill] = useState<AnalyzePrefillPayload | null>(null);

  function moveToAnalyzeWithSpot(spot: unknown, context: AnalyzeHandoffContext) {
    setAnalyzePrefill({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      spot,
      context
    });
    setActiveTab("analyze");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">poker-tournament-lab</p>
          <h1>토너먼트 Push/Fold 분석</h1>
        </div>
        <nav className="tabs" aria-label="주요 화면">
          <button className={activeTab === "analyze" ? "active" : ""} onClick={() => setActiveTab("analyze")} type="button">
            <Play size={16} /> Analyze
          </button>
          <button className={activeTab === "browser" ? "active" : ""} onClick={() => setActiveTab("browser")} type="button">
            <Search size={16} /> Browser
          </button>
          <button className={activeTab === "trainer" ? "active" : ""} onClick={() => setActiveTab("trainer")} type="button" data-testid="trainer-tab">
            <GraduationCap size={16} /> Trainer
          </button>
          <button className={activeTab === "import" ? "active" : ""} onClick={() => setActiveTab("import")} type="button">
            <FileUp size={16} /> Import
          </button>
          <button className={activeTab === "database" ? "active" : ""} onClick={() => setActiveTab("database")} type="button">
            <Database size={16} /> Database
          </button>
          <button className={activeTab === "hrcArtifacts" ? "active" : ""} onClick={() => setActiveTab("hrcArtifacts")} type="button">
            <BadgeCheck size={16} /> HRC Artifacts
          </button>
        </nav>
      </header>

      {activeTab === "analyze" && <AnalyzeView prefill={analyzePrefill} onConsumePrefill={() => setAnalyzePrefill(null)} />}
      {activeTab === "browser" && <SolutionBrowserView />}
      {activeTab === "trainer" && <TrainerView />}
      {activeTab === "import" && <ImportView />}
      {activeTab === "database" && (
        <DatabaseView onGoImport={() => setActiveTab("import")} onFillAnalyze={(spot, context) => moveToAnalyzeWithSpot(spot, context)} />
      )}
      {activeTab === "hrcArtifacts" && <HrcArtifactView />}
    </main>
  );
}

function SolutionBrowserView() {
  const [solutions, setSolutions] = useState<SolutionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<number | null>(null);
  const [selectedBrowserHand, setSelectedBrowserHand] = useState<string | null>(null);
  const [selectedBrowserActionKind, setSelectedBrowserActionKind] = useState("ALL");
  const [selectedBrowserSizeLabel, setSelectedBrowserSizeLabel] = useState("ALL");
  const [selectedBrowserEvMode, setSelectedBrowserEvMode] = useState<BrowserV2EvMode>("EV");
  const [selectedSpotTypeFilter, setSelectedSpotTypeFilter] = useState("ALL");
  const [selectedActionNodeFilter, setSelectedActionNodeFilter] = useState("ALL");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listSolutions("", 500)
      .then((rows) => {
        if (!cancelled) {
          setSolutions(rows);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(toUserFacingApiError(caught, "solution 목록을 불러오지 못했습니다."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useMemo(() => solutions.map((solution) => buildCatalogItem(solution)), [solutions]);
  const spotTypeOptions = useMemo(() => ["ALL", ...uniqueSorted(catalog.map((item) => item.actionTree.spotType))], [catalog]);
  const actionNodeOptions = useMemo(() => ["ALL", ...uniqueSorted(catalog.map((item) => item.actionTree.actionNode))], [catalog]);
  const browserCatalog = useMemo(
    () => filterBrowserCatalogByActionTree(catalog, selectedSpotTypeFilter, selectedActionNodeFilter),
    [catalog, selectedActionNodeFilter, selectedSpotTypeFilter]
  );
  const nodeCandidateSummary = useMemo(() => buildBrowserNodeCandidateSummary(browserCatalog), [browserCatalog]);

  useEffect(() => {
    if (selectedSpotTypeFilter !== "ALL" && !spotTypeOptions.includes(selectedSpotTypeFilter)) {
      setSelectedSpotTypeFilter("ALL");
    }
    if (selectedActionNodeFilter !== "ALL" && !actionNodeOptions.includes(selectedActionNodeFilter)) {
      setSelectedActionNodeFilter("ALL");
    }
  }, [actionNodeOptions, selectedActionNodeFilter, selectedSpotTypeFilter, spotTypeOptions]);

  useEffect(() => {
    if (browserCatalog.length === 0) {
      setSelectedSolutionId(null);
      return;
    }
    if (!selectedSolutionId || !browserCatalog.some((item) => item.row.id === selectedSolutionId)) {
      const hrcCandidate = browserCatalog.find((item) => item.row.sourceLabel.toUpperCase().includes("HRC"));
      setSelectedSolutionId((hrcCandidate ?? browserCatalog[0])?.row.id ?? null);
    }
  }, [browserCatalog, selectedSolutionId]);

  const selected = browserCatalog.find((item) => item.row.id === selectedSolutionId) ?? null;
  const selectedBrowserModel = useMemo(() => {
    if (!selected) {
      return null;
    }
    try {
      return buildBrowserV2Model(selected.row.strategy);
    } catch {
      return null;
    }
  }, [selected]);
  const selectedActionPath = selected ? formatBrowserActionPath(selected.row.spot.actionPath) : "제공되지 않음";
  const selectedRemainingPlayers = selected ? countRemainingPlayers(selected.row.spot) : null;
  const selectedStrategySchema = selected ? describeSolutionStrategySchema(selected.row, selectedBrowserModel?.strategyMode ?? null) : "제공되지 않음";
  const browserActionKindOptions = useMemo(
    () => (selectedBrowserModel ? ["ALL", ...selectedBrowserModel.availableActionKinds] : ["ALL"]),
    [selectedBrowserModel]
  );
  const browserSizeLabelOptions = useMemo(
    () => (selectedBrowserModel ? ["ALL", ...selectedBrowserModel.availableSizeLabels] : ["ALL"]),
    [selectedBrowserModel]
  );
  const filteredBrowserHands = useMemo(
    () => filterBrowserV2Hands(selectedBrowserModel?.hands ?? [], selectedBrowserActionKind, selectedBrowserSizeLabel),
    [selectedBrowserActionKind, selectedBrowserModel, selectedBrowserSizeLabel]
  );

  useEffect(() => {
    setSelectedBrowserActionKind("ALL");
    setSelectedBrowserSizeLabel("ALL");
    setSelectedBrowserEvMode("EV");
    setSelectedBrowserHand(null);
  }, [selectedSolutionId]);

  useEffect(() => {
    if (!selectedBrowserModel) {
      if (selectedBrowserActionKind !== "ALL") {
        setSelectedBrowserActionKind("ALL");
      }
      if (selectedBrowserSizeLabel !== "ALL") {
        setSelectedBrowserSizeLabel("ALL");
      }
      return;
    }
    if (
      selectedBrowserActionKind !== "ALL" &&
      !selectedBrowserModel.availableActionKinds.some((actionKind) => actionKind === selectedBrowserActionKind)
    ) {
      setSelectedBrowserActionKind("ALL");
    }
    if (selectedBrowserSizeLabel !== "ALL" && !selectedBrowserModel.availableSizeLabels.includes(selectedBrowserSizeLabel)) {
      setSelectedBrowserSizeLabel("ALL");
    }
  }, [selectedBrowserActionKind, selectedBrowserModel, selectedBrowserSizeLabel]);

  useEffect(() => {
    if (!selectedBrowserModel || selectedBrowserModel.hands.length === 0 || filteredBrowserHands.length === 0) {
      if (selectedBrowserHand !== null) {
        setSelectedBrowserHand(null);
      }
      return;
    }
    if (!selectedBrowserHand || !filteredBrowserHands.some((hand) => hand.hand.hand === selectedBrowserHand)) {
      const defaultHand =
        filteredBrowserHands.find((hand) => hand.actions.length > 1)?.hand.hand ??
        filteredBrowserHands.find((hand) => hand.actions.length > 0)?.hand.hand ??
        filteredBrowserHands[0]?.hand.hand ??
        null;
      setSelectedBrowserHand(defaultHand);
    }
  }, [filteredBrowserHands, selectedBrowserHand, selectedBrowserModel]);

  return (
    <section className="solution-browser-shell" data-testid="solution-browser-view">
      <div className="panel stack solution-browser-intro">
        <div className="panel-title">
          <Search size={18} />
          <h2>Solution Browser</h2>
        </div>
        <p>
          v2.0에서는 v1.9 Browser v2 기반을 별도 Browser 화면으로 승격하는 중입니다. 이 화면은 read-only DB
          browser이며 solver 계산을 새로 수행하지 않습니다.
        </p>
        <p>/api/solutions 기존 DB 데이터만 사용합니다. nearest recommendation 없음. RTA/live 기능 없음.</p>
      </div>

      <SolutionBrowserActionTreeBreadcrumb selected={selected} />

      <div className="solution-browser-grid" data-testid="solution-browser-layout">
        <section className="panel stack solution-browser-panel" data-testid="browser-spot-selector-panel">
          <div className="panel-title">
            <Database size={18} />
            <h2>Spot Selector</h2>
          </div>
          <p>DB에 있는 spot만 선택합니다.</p>
          <p className="muted">임의 spot 생성 없이 DB에 실제 존재하는 solution만 표시합니다.</p>

          {loading ? <p className="muted">solution 목록을 불러오는 중...</p> : null}
          {error ? <p className="error-text">Browser solution 조회 실패: {error}</p> : null}
          {!loading && !error && catalog.length === 0 ? <p className="muted">조건에 맞는 solution 없음 / 저장된 solution이 없습니다.</p> : null}
          {!loading && !error && catalog.length > 0 ? (
            <div className="browser-action-tree-filters" data-testid="browser-action-tree-filters">
              <label>
                Spot Type 필터
                <select
                  aria-label="Browser Spot Type 필터"
                  value={selectedSpotTypeFilter}
                  onChange={(event) => setSelectedSpotTypeFilter(event.target.value)}
                >
                  {spotTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "ALL" ? "ALL" : formatActionTreeSpotType(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Action Node 필터
                <select
                  aria-label="Browser Action Node 필터"
                  value={selectedActionNodeFilter}
                  onChange={(event) => setSelectedActionNodeFilter(event.target.value)}
                >
                  {actionNodeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "ALL" ? "ALL" : formatActionTreeNode(option)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">Spot Type / Action Node filter는 DB에 실제 존재하는 solution 분류값만 표시합니다.</p>
              <p className="muted">LIMP는 unopened/first-in pot의 limp 액션이며 CALL과 분리해 표시합니다.</p>
            </div>
          ) : null}
          {!loading && !error && catalog.length > 0 ? (
            <SolutionBrowserNodeCandidateSummary
              actionNodeFilter={selectedActionNodeFilter}
              selected={selected}
              spotTypeFilter={selectedSpotTypeFilter}
              summary={nodeCandidateSummary}
            />
          ) : null}
          {!loading && !error && catalog.length > 0 && browserCatalog.length === 0 ? (
            <div className="notice browser-action-tree-empty-state" data-testid="browser-action-tree-empty">
              <p>조건에 맞는 solution이 없습니다.</p>
              <p>현재 적용된 필터: Spot Type = {formatBrowserSpotTypeFilter(selectedSpotTypeFilter)}, Action Node = {formatBrowserActionNodeFilter(selectedActionNodeFilter)}</p>
              <p>nearest recommendation은 수행하지 않습니다.</p>
              <p>DB에 저장된 solution만 표시합니다.</p>
            </div>
          ) : null}

          <div className="solution-browser-candidate-list" aria-label="Browser solution 후보">
            {browserCatalog.map((item) => (
              <button
                className={`solution-browser-candidate ${item.row.id === selectedSolutionId ? "selected" : ""}`}
                data-testid="browser-solution-candidate"
                key={item.row.id}
                onClick={() => setSelectedSolutionId(item.row.id)}
                type="button"
              >
                <strong>{item.heroPosition || "Hero Position 제공되지 않음"}</strong>
                <span>{item.tableSize ? `${item.tableSize}명` : "Table Size 제공되지 않음"}</span>
                <span>남은 인원 {formatCount(countRemainingPlayers(item.row.spot))}</span>
                <span>Hero stack {formatBb(item.heroStackBb)}</span>
                <span>Action Node {formatBrowserActionPath(item.row.spot.actionPath)}</span>
                <span>Spot Type {formatActionTreeSpotType(item.actionTree.spotType)}</span>
                <span>Tree Node {formatActionTreeNode(item.actionTree.actionNode)}</span>
                <span>Tree {item.treeConfig || "제공되지 않음"}</span>
                <span>Source {item.row.sourceLabel || "제공되지 않음"}</span>
                <span>Source file {item.sourceFile || "제공되지 않음"}</span>
                <span>Schema {describeSolutionStrategySchema(item.row, null)}</span>
                <code>{shortCanonicalKey(item.canonicalKey)}</code>
              </button>
            ))}
          </div>
        </section>

        <section className="panel stack solution-browser-panel solution-browser-matrix-panel" data-testid="browser-strategy-matrix-panel">
          <div className="panel-title">
            <SlidersHorizontal size={18} />
            <h2>13x13 Strategy Matrix</h2>
          </div>
          <p>선택한 solution의 action frequency matrix가 표시됩니다.</p>
          {!selected ? (
            <p className="muted">왼쪽에서 DB solution을 선택해 주세요.</p>
          ) : (
            <>
              <div className="detail-grid" data-testid="browser-selected-summary">
                <ResultDetailItem label="selected solution" value={selected.row.sourceLabel || "제공되지 않음"} />
                <ResultDetailItem label="hero position" value={selected.heroPosition || "제공되지 않음"} />
                <ResultDetailItem label="table / remaining" value={`${selected.tableSize ?? "제공되지 않음"} / ${selectedRemainingPlayers ?? "제공되지 않음"}`} />
                <ResultDetailItem label="hero stack" value={formatBb(selected.heroStackBb)} />
                <ResultDetailItem label="strategy schema" value={selectedStrategySchema} />
                <ResultDetailItem label="strategy entries" value={formatCount(selected.strategyCount)} />
              </div>
              <SolutionBrowserActionTreeSummary selected={selected} />
              <div className="browser-v2-controls" data-testid="solution-browser-controls">
                <label>
                  Action kind 필터
                  <select
                    aria-label="Solution Browser action kind 필터"
                    disabled={!selectedBrowserModel}
                    value={selectedBrowserActionKind}
                    onChange={(event) => setSelectedBrowserActionKind(event.target.value)}
                  >
                    {browserActionKindOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Size label 필터
                  <select
                    aria-label="Solution Browser size label 필터"
                    disabled={!selectedBrowserModel}
                    value={selectedBrowserSizeLabel}
                    onChange={(event) => setSelectedBrowserSizeLabel(event.target.value)}
                  >
                    {browserSizeLabelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  EV 표시 방식
                  <select
                    aria-label="Solution Browser EV 표시 방식"
                    value={selectedBrowserEvMode}
                    onChange={(event) => setSelectedBrowserEvMode(parseBrowserV2EvMode(event.target.value))}
                  >
                    <option value="EV">EV</option>
                    <option value="CHIP_EV">ChipEV</option>
                    <option value="ICM_EV">ICM EV</option>
                  </select>
                </label>
              </div>
              <SolutionBrowserActionSizeFilterContext
                actionKindFilter={selectedBrowserActionKind}
                actionTree={selected.actionTree}
                model={selectedBrowserModel}
                sizeLabelFilter={selectedBrowserSizeLabel}
              />
              <SolutionBrowserStrategyMatrix
                actionKindFilter={selectedBrowserActionKind}
                actionTree={selected.actionTree}
                evMode={selectedBrowserEvMode}
                filteredHands={filteredBrowserHands}
                model={selectedBrowserModel}
                onSelectHand={setSelectedBrowserHand}
                selectedHand={selectedBrowserHand}
                sizeLabelFilter={selectedBrowserSizeLabel}
              />
            </>
          )}
        </section>

        <section className="panel stack solution-browser-panel" data-testid="browser-hand-detail-panel">
          <div className="panel-title">
            <BookmarkPlus size={18} />
            <h2>Hand Detail</h2>
          </div>
          <p>선택한 hand의 action, size, frequency, EV가 표시됩니다.</p>
          {!selected ? (
            <p className="muted">선택된 solution metadata가 없습니다.</p>
          ) : (
            <>
              <SolutionBrowserHandDetail
                actionKindFilter={selectedBrowserActionKind}
                actionTree={selected.actionTree}
                evMode={selectedBrowserEvMode}
                filteredHands={filteredBrowserHands}
                model={selectedBrowserModel}
                selectedHand={selectedBrowserHand}
                sizeLabelFilter={selectedBrowserSizeLabel}
              />
              <SolutionBrowserMetadataPanel
                actionPath={selectedActionPath}
                model={selectedBrowserModel}
                remainingPlayers={selectedRemainingPlayers}
                schemaLabel={selectedStrategySchema}
                selected={selected}
              />
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function SolutionBrowserActionTreeBreadcrumb({ selected }: { selected: SolutionCatalogItem | null }) {
  if (!selected) {
    return (
      <div className="panel stack browser-action-tree-breadcrumb" data-testid="browser-action-tree-breadcrumb">
        <div>
          <span className="eyebrow">Action Tree</span>
          <h2>Action tree 정보 제공되지 않음</h2>
        </div>
        <p className="muted">왼쪽 Spot Selector에서 DB solution을 선택하면 action tree breadcrumb가 표시됩니다.</p>
      </div>
    );
  }

  const actionTree = selected.actionTree;
  return (
    <div className="panel stack browser-action-tree-breadcrumb" data-testid="browser-action-tree-breadcrumb">
      <div>
        <span className="eyebrow">Action Tree</span>
        <h2>{formatActionTreeList(actionTree.breadcrumbItems, " > ")}</h2>
      </div>
      <div className="browser-action-tree-badges" data-testid="browser-action-tree-badges">
        <span>Spot Type: {formatActionTreeSpotType(actionTree.spotType)}</span>
        <span>Action Node: {formatActionTreeNode(actionTree.actionNode)}</span>
        <span>Available Actions: {formatActionTreeList(actionTree.availableActions)}</span>
        <span>Available Sizes: {formatActionTreeList(actionTree.availableSizes)}</span>
        <span>Warnings: {actionTree.warnings.length}</span>
      </div>
      {actionTree.spotType === "UNKNOWN" ? <p className="muted">Unknown / 분류 신호 부족: DB metadata에서 action node를 확정할 수 없습니다.</p> : null}
      {actionTree.breadcrumbItems.length === 0 ? <p className="muted">Action tree 정보 제공되지 않음</p> : null}
      <p className="muted">현재 Browser는 선택한 DB solution의 action tree context를 read-only로 표시합니다.</p>
    </div>
  );
}

function SolutionBrowserActionTreeSummary({ selected }: { selected: SolutionCatalogItem }) {
  const actionTree = selected.actionTree;
  return (
    <div className="browser-action-tree-summary" data-testid="browser-action-tree-summary">
      <div>
        <h3>Action Tree Summary</h3>
        <p className="muted">solution metadata, actionPath, treeConfig, source metadata, strategy actions[] 기반 read-only 분류입니다.</p>
      </div>
      <div className="detail-grid">
        <ResultDetailItem label="Spot Type" value={formatActionTreeSpotType(actionTree.spotType)} />
        <ResultDetailItem label="Action Node" value={formatActionTreeNode(actionTree.actionNode)} />
        <ResultDetailItem label="Available Actions" value={formatActionTreeList(actionTree.availableActions)} />
        <ResultDetailItem label="Available Sizes" value={formatActionTreeList(actionTree.availableSizes)} />
        <ResultDetailItem label="Breadcrumb" value={formatActionTreeList(actionTree.breadcrumbItems, " > ")} />
        <ResultDetailItem label="Warnings" value={formatActionTreeList(actionTree.warnings)} />
      </div>
      {actionTree.spotType === "UNKNOWN" ? <p className="muted">classifier 결과 UNKNOWN: 분류 신호가 부족합니다.</p> : null}
      {actionTree.availableActions.length === 0 ? <p className="muted">availableActions 정보가 제공되지 않음</p> : null}
      {actionTree.availableSizes.length === 0 ? <p className="muted">availableSizes 정보가 제공되지 않음</p> : null}
      <p className="muted">LIMP는 unopened/first-in pot의 limp 액션이며 CALL과 분리해 표시합니다.</p>
    </div>
  );
}

function SolutionBrowserNodeCandidateSummary({
  actionNodeFilter,
  selected,
  spotTypeFilter,
  summary
}: {
  actionNodeFilter: string;
  selected: SolutionCatalogItem | null;
  spotTypeFilter: string;
  summary: BrowserNodeCandidateSummary;
}) {
  const currentNode = selected
    ? `${formatActionTreeSpotType(selected.actionTree.spotType)} · ${formatActionTreeNode(selected.actionTree.actionNode)}`
    : "제공되지 않음";
  const hasLimp = summary.availableActions.includes("LIMP");

  return (
    <div className="browser-node-candidate-summary" data-testid="browser-node-candidate-summary">
      <h3>Node Candidate Summary</h3>
      <div className="detail-grid">
        <ResultDetailItem label="Candidate Solutions" value={String(summary.candidateCount)} />
        <ResultDetailItem label="Current Node" value={currentNode} />
        <ResultDetailItem label="Available Actions" value={formatActionTreeList(summary.availableActions)} />
        <ResultDetailItem label="Available Sizes" value={formatActionTreeList(summary.availableSizes)} />
        <ResultDetailItem
          label="Filtered by"
          value={`Spot Type = ${formatBrowserSpotTypeFilter(spotTypeFilter)}, Action Node = ${formatBrowserActionNodeFilter(actionNodeFilter)}`}
        />
      </div>
      <p className="muted">필터는 DB에 실제 존재하는 action/size/node만 기준으로 동작합니다.</p>
      {hasLimp ? <p className="muted">이 후보 집합에는 CALL과 분리된 LIMP action이 포함됩니다.</p> : null}
      {summary.candidateCount === 0 ? (
        <>
          <p className="muted">조건에 맞는 solution이 없습니다.</p>
          <p className="muted">nearest recommendation은 수행하지 않습니다.</p>
          <p className="muted">DB에 저장된 solution만 표시합니다.</p>
        </>
      ) : null}
    </div>
  );
}

function SolutionBrowserActionSizeFilterContext({
  actionKindFilter,
  actionTree,
  model,
  sizeLabelFilter
}: {
  actionKindFilter: string;
  actionTree: ActionTreeClassification;
  model: BrowserV2Model | null;
  sizeLabelFilter: string;
}) {
  const modelActions = model?.availableActionKinds ?? [];
  const modelSizes = model?.availableSizeLabels ?? [];
  return (
    <div className="browser-action-size-filter-context" data-testid="browser-action-size-filter-context">
      <h3>Action / Size Filter Context</h3>
      <div className="detail-grid">
        <ResultDetailItem label="Current action filter" value={actionKindFilter} />
        <ResultDetailItem label="Current size filter" value={sizeLabelFilter === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(sizeLabelFilter)} />
        <ResultDetailItem label="Node available actions" value={formatActionTreeList(actionTree.availableActions)} />
        <ResultDetailItem label="Node available sizes" value={formatActionTreeList(actionTree.availableSizes)} />
        <ResultDetailItem label="Model action options" value={modelActions.join(" / ") || "제공되지 않음"} />
        <ResultDetailItem label="Model size options" value={modelSizes.map(formatBrowserV2SizeFilterLabel).join(" / ") || "제공되지 않음"} />
      </div>
      <p className="muted">action kind filter와 size label filter는 현재 selected solution의 Browser v2 model에 실제 존재하는 값만 표시합니다.</p>
      <p className="muted">필터는 DB에 실제 존재하는 action/size만 기준으로 동작합니다.</p>
    </div>
  );
}

function SolutionBrowserNodeContext({
  actionTree,
  label,
  testId
}: {
  actionTree: ActionTreeClassification;
  label: string;
  testId: string;
}) {
  return (
    <div className="browser-node-context" data-testid={testId}>
      <strong>
        {label} — {formatActionTreeSpotType(actionTree.spotType)} · {formatActionTreeNode(actionTree.actionNode)}
      </strong>
      <span>{formatActionTreeList(actionTree.breadcrumbItems, " > ")}</span>
      {actionTree.warnings.length > 0 ? <small>Warnings {actionTree.warnings.length}: {formatActionTreeList(actionTree.warnings)}</small> : null}
      {actionTree.spotType === "UNKNOWN" ? <small>Unknown / 분류 신호 부족</small> : null}
    </div>
  );
}

function SolutionBrowserStrategyMatrix({
  actionKindFilter,
  actionTree,
  evMode,
  filteredHands,
  model,
  onSelectHand,
  selectedHand,
  sizeLabelFilter
}: {
  actionKindFilter: string;
  actionTree: ActionTreeClassification;
  evMode: BrowserV2EvMode;
  filteredHands: FilteredBrowserV2Hand[];
  model: BrowserV2Model | null;
  onSelectHand: (hand: string) => void;
  selectedHand: string | null;
  sizeLabelFilter: string;
}) {
  if (!model) {
    return (
      <div className="notice" data-testid="browser-matrix-empty">
        <SolutionBrowserNodeContext actionTree={actionTree} label="Strategy Matrix" testId="browser-matrix-node-context" />
        <p>선택한 solution의 Browser v2 model을 생성할 수 없습니다.</p>
        <p>strategy 데이터가 제공되지 않았습니다.</p>
        <p>변환 가능한 hand/action 데이터가 없습니다.</p>
      </div>
    );
  }

  const handMap = new Map(filteredHands.map((hand) => [hand.hand.hand, hand]));
  const modeLabel = formatBrowserStrategyMode(model.strategyMode);

  return (
    <div className="solution-browser-matrix-block" data-testid="browser-strategy-matrix">
      <SolutionBrowserNodeContext actionTree={actionTree} label="Strategy Matrix" testId="browser-matrix-node-context" />
      <div className="notice">
        <p>선택한 DB solution의 strategy를 표시합니다.</p>
        <p>v2 actions[]는 원본 데이터 기반으로 표시합니다.</p>
        <p>v1 legacy strategy는 Browser v2 model로 변환해 표시합니다.</p>
        <p>read-only이며 solver 계산을 수행하지 않습니다.</p>
      </div>

      <div className="detail-grid">
        <ResultDetailItem label="strategy mode" value={modeLabel} />
        <ResultDetailItem label="hands" value={String(model.handCount)} />
        <ResultDetailItem label="actions" value={String(model.totalActionCount)} />
        <ResultDetailItem label="mixed hands" value={String(model.mixedHandCount)} />
        <ResultDetailItem label="action kinds" value={model.availableActionKinds.join(", ") || "제공되지 않음"} />
        <ResultDetailItem label="size labels" value={model.availableSizeLabels.join(", ") || "제공되지 않음"} />
        <ResultDetailItem label="active action filter" value={actionKindFilter} />
        <ResultDetailItem label="active size filter" value={sizeLabelFilter === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(sizeLabelFilter)} />
        <ResultDetailItem label="EV display mode" value={browserV2EvModeLabel(evMode)} />
        <ResultDetailItem label="filtered hands" value={String(filteredHands.length)} />
      </div>

      {model.hands.length === 0 ? (
        <div className="notice" data-testid="browser-matrix-strategy-empty">
          <p>strategy 데이터가 제공되지 않았습니다.</p>
          <p>표시 가능한 hand/action 데이터가 제공되지 않음</p>
        </div>
      ) : (
        <>
          {filteredHands.length === 0 ? (
            <div className="notice" data-testid="browser-matrix-filter-empty">
              <p>선택한 필터에 해당하는 action이 없습니다.</p>
              <p>현재 action filter: {actionKindFilter}</p>
              <p>현재 size filter: {sizeLabelFilter === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(sizeLabelFilter)}</p>
            </div>
          ) : null}
          <div className="solution-browser-strategy-matrix" aria-label="Solution Browser action frequency matrix">
            {HAND_KEYS.map((handKey) => {
              const hand = handMap.get(handKey) ?? null;
              const primary = hand ? getBrowserV2PrimaryAction(hand.actions) : null;
              return (
                <button
                  aria-label={`Solution Browser hand ${handKey}`}
                  className={`solution-browser-strategy-cell ${hand && hand.actions.length > 1 ? "mixed" : ""} ${hand ? "" : "empty"} ${
                    hand?.hand.hand === selectedHand ? "selected" : ""
                  }`}
                  data-testid={`browser-matrix-hand-${handKey.toLowerCase()}`}
                  disabled={!hand}
                  key={handKey}
                  onClick={() => {
                    if (hand) {
                      onSelectHand(hand.hand.hand);
                    }
                  }}
                  type="button"
                >
                  <strong>{handKey}</strong>
                  <span>{hand ? formatBrowserV2HandLine(hand.actions, evMode) : "제공되지 않음"}</span>
                  <small>{hand && hand.actions.length > 1 ? "mixed" : primary?.actionLabel ?? "제공되지 않음"}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SolutionBrowserHandDetail({
  actionKindFilter,
  actionTree,
  evMode,
  filteredHands,
  model,
  selectedHand,
  sizeLabelFilter
}: {
  actionKindFilter: string;
  actionTree: ActionTreeClassification;
  evMode: BrowserV2EvMode;
  filteredHands: FilteredBrowserV2Hand[];
  model: BrowserV2Model | null;
  selectedHand: string | null;
  sizeLabelFilter: string;
}) {
  if (!model) {
    return (
      <div className="notice" data-testid="browser-hand-detail">
        <SolutionBrowserNodeContext actionTree={actionTree} label="Hand Detail" testId="browser-hand-node-context" />
        <p>Hand detail을 생성할 수 없습니다.</p>
        <p>strategy 데이터가 제공되지 않았습니다.</p>
        <p>Browser v2 model 변환 결과가 제공되지 않음</p>
      </div>
    );
  }

  if (model.hands.length === 0) {
    return (
      <div className="notice" data-testid="browser-hand-detail">
        <SolutionBrowserNodeContext actionTree={actionTree} label="Hand Detail" testId="browser-hand-node-context" />
        <p>표시 가능한 hand가 없습니다.</p>
        <p>선택된 hand가 없습니다.</p>
        <p>selected hand에 actions가 제공되지 않음</p>
      </div>
    );
  }

  const hand = filteredHands.find((candidate) => candidate.hand.hand === selectedHand) ?? filteredHands[0] ?? null;
  if (!hand) {
    return (
      <div className="notice" data-testid="browser-hand-detail">
        <SolutionBrowserNodeContext actionTree={actionTree} label="Hand Detail" testId="browser-hand-node-context" />
        <p>선택한 필터에 해당하는 action이 없습니다.</p>
        <p>선택된 hand가 없습니다.</p>
        <p>현재 action filter: {actionKindFilter}</p>
        <p>현재 size filter: {sizeLabelFilter === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(sizeLabelFilter)}</p>
        <p>Action kind 또는 size label filter를 ALL로 바꾸면 다시 표시됩니다.</p>
      </div>
    );
  }

  const primary = getBrowserV2PrimaryAction(hand.actions);

  return (
    <div className="solution-browser-hand-detail" data-testid="browser-hand-detail">
      <SolutionBrowserNodeContext actionTree={actionTree} label={`Selected Hand: ${hand.hand.hand}`} testId="browser-hand-node-context" />
      <div className="notice">
        <p>선택한 DB solution의 hand detail을 표시합니다.</p>
        <p>v2 actions[]는 원본 데이터 기반으로 표시합니다.</p>
        <p>v1 legacy strategy는 Browser v2 model로 변환해 표시합니다.</p>
        <p>read-only이며 solver 계산을 수행하지 않습니다.</p>
      </div>

      <div className="detail-grid">
        <ResultDetailItem label="hand" value={hand.hand.hand} />
        <ResultDetailItem label="primary action" value={primary?.actionLabel ?? "제공되지 않음"} />
        <ResultDetailItem label="mixed action" value={hand.actions.length > 1 ? "YES" : "NO"} />
        <ResultDetailItem label="action count" value={String(hand.actions.length)} />
        <ResultDetailItem label="total frequency" value={formatBrowserV2FilteredFrequency(hand.actions)} />
        <ResultDetailItem label="strategy mode" value={formatBrowserStrategyMode(model.strategyMode)} />
        <ResultDetailItem label="active action filter" value={actionKindFilter} />
        <ResultDetailItem label="active size filter" value={sizeLabelFilter === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(sizeLabelFilter)} />
        <ResultDetailItem label="EV display mode" value={browserV2EvModeLabel(evMode)} />
      </div>

      {hand.actions.length === 0 ? (
        <p className="muted">selected hand에 actions가 제공되지 않음</p>
      ) : (
        <div className="solution-browser-action-detail-list" aria-label="Solution Browser 선택 hand action 목록">
          {hand.actions.map((action, index) => (
            <div className="solution-browser-action-detail-card" data-testid="browser-hand-action-row" key={`${hand.hand.hand}-${action.action}-${index}`}>
              <strong>{action.actionLabel}</strong>
              <div className="detail-grid">
                <ResultDetailItem label="action" value={action.actionLabel} />
                <ResultDetailItem label="size" value={formatBrowserV2ActionSizeLabel(action)} />
                <ResultDetailItem label="frequency" value={formatActionFrequency(action.frequency)} />
                <ResultDetailItem label={`${browserV2EvModeLabel(evMode)} selected`} value={formatBrowserV2SelectedEv(action, evMode)} />
                <ResultDetailItem label="EV" value={formatActionEv(action.ev)} />
                <ResultDetailItem label="ChipEV" value={formatActionEv(action.chipEv)} />
                <ResultDetailItem label="ICM EV" value={formatActionEv(action.icmEv)} />
                <ResultDetailItem label="source" value={action.sourceActionLabel ?? "제공되지 않음"} />
                <ResultDetailItem label="warnings" value={formatBrowserV2Warnings(action.warnings)} />
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

function SolutionBrowserMetadataPanel({
  actionPath,
  model,
  remainingPlayers,
  schemaLabel,
  selected
}: {
  actionPath: string;
  model: BrowserV2Model | null;
  remainingPlayers: number | null;
  schemaLabel: string;
  selected: SolutionCatalogItem;
}) {
  const solution = selected.row;
  const features = solution.databaseFeatures;
  const warningSummary = summarizeBrowserMetadataWarnings(model);
  const sourceWarnings = features?.warnings ?? [];
  const allWarnings = Array.from(new Set([...sourceWarnings, ...(model?.warnings ?? [])]));

  return (
    <div className="solution-browser-metadata-panel" data-testid="browser-selected-metadata" aria-label="선택된 solution metadata">
      <div>
        <h3>Source / Metadata</h3>
        <p className="muted">선택한 solution의 DB source, schema, canonical key, import metadata를 read-only로 표시합니다.</p>
      </div>

      <div className="notice">
        <p>이 Browser는 DB에 저장된 solution만 표시합니다.</p>
        <p>nearest recommendation을 수행하지 않습니다.</p>
        <p>solver 계산을 새로 수행하지 않습니다.</p>
        <p>RTA/live 기능이 아닙니다.</p>
      </div>

      <p className="muted">{formatBrowserSchemaNotice(schemaLabel)}</p>

      <div className="detail-grid">
        <ResultDetailItem label="source" value={solution.sourceLabel || "제공되지 않음"} />
        <ResultDetailItem label="source label" value={solution.sourceLabel || "제공되지 않음"} />
        <ResultDetailItem label="schema" value={schemaLabel || "schema 정보 제공되지 않음"} />
        <ResultDetailItem label="Action Tree Spot Type" value={formatActionTreeSpotType(selected.actionTree.spotType)} />
        <ResultDetailItem label="Action Tree Node" value={formatActionTreeNode(selected.actionTree.actionNode)} />
        <ResultDetailItem label="Action Tree Breadcrumb" value={formatActionTreeList(selected.actionTree.breadcrumbItems, " > ")} />
        <ResultDetailItem label="Action Tree Available Actions" value={formatActionTreeList(selected.actionTree.availableActions)} />
        <ResultDetailItem label="Action Tree Available Sizes" value={formatActionTreeList(selected.actionTree.availableSizes)} />
        <ResultDetailItem label="Action Tree Warnings" value={formatActionTreeList(selected.actionTree.warnings)} />
        <ResultDetailItem label="hero position" value={selected.heroPosition || "제공되지 않음"} />
        <ResultDetailItem label="table size" value={selected.tableSize === null ? "제공되지 않음" : String(selected.tableSize)} />
        <ResultDetailItem label="remaining players" value={remainingPlayers === null ? "제공되지 않음" : String(remainingPlayers)} />
        <ResultDetailItem label="hero stack" value={formatBb(selected.heroStackBb)} />
        <ResultDetailItem label="tree config" value={selected.treeConfig || "제공되지 않음"} />
        <ResultDetailItem label="source file" value={selected.sourceFile || "제공되지 않음"} />
        <ResultDetailItem label="import id" value={String(solution.importId)} />
        <ResultDetailItem label="imported at" value={formatBrowserImportedAt(solution.importedAt)} />
        <ResultDetailItem label="file hash" value={solution.fileHash || "제공되지 않음"} />
        <ResultDetailItem label="strategy hand count" value={model ? String(model.handCount) : formatCount(selected.strategyCount)} />
        <ResultDetailItem label="action count" value={model ? String(model.totalActionCount) : "제공되지 않음"} />
        <ResultDetailItem label="warning count" value={String(allWarnings.length)} />
        <ResultDetailItem label="missing EV" value={String(warningSummary.missingEvCount)} />
        <ResultDetailItem label="missing size" value={String(warningSummary.missingSizeCount)} />
        <ResultDetailItem label="unknown action" value={String(warningSummary.unknownActionCount)} />
      </div>

      <div className="solution-browser-canonical-key">
        <span>canonical key</span>
        <code>{solution.canonicalKey || "제공되지 않음"}</code>
      </div>

      <div className="solution-browser-canonical-key">
        <span>action path</span>
        <code>{actionPath}</code>
      </div>

      <div className="browser-placeholder-list" aria-label="Browser source metadata">
        <div className="browser-placeholder-row">
          <span>external id</span>
          <strong>{solution.externalId || "제공되지 않음"}</strong>
        </div>
        <div className="browser-placeholder-row">
          <span>calculation model</span>
          <strong>{features?.calculationModel ?? "제공되지 않음"}</strong>
        </div>
        <div className="browser-placeholder-row">
          <span>spot family</span>
          <strong>{features?.spotFamily || "제공되지 않음"}</strong>
        </div>
        <div className="browser-placeholder-row">
          <span>export shape</span>
          <strong>{features?.exportShape ?? "제공되지 않음"}</strong>
        </div>
        <div className="browser-placeholder-row">
          <span>street scope</span>
          <strong>{features?.streetScope ?? "제공되지 않음"}</strong>
        </div>
        <div className="browser-placeholder-row">
          <span>action tags</span>
          <strong>{features?.actionTags.length ? features.actionTags.join(", ") : "제공되지 않음"}</strong>
        </div>
        <div className="browser-placeholder-row">
          <span>warnings</span>
          <strong>{allWarnings.length > 0 ? allWarnings.join(", ") : "제공되지 않음"}</strong>
        </div>
      </div>
    </div>
  );
}

function AnalyzeView({ prefill, onConsumePrefill }: { prefill: AnalyzePrefillPayload | null; onConsumePrefill: () => void }) {
  const [mode, setMode] = useState<AnalyzeMode>("form");
  const [formState, setFormState] = useState<AnalyzeFormState>(initialFormState);
  const [jsonRequest, setJsonRequest] = useState(() => JSON.stringify(initialAnalyzeRequest, null, 2));
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetNotice, setPresetNotice] = useState<PresetNotice | null>(null);
  const [presets, setPresets] = useState<AnalyzePreset[]>(() => loadAnalyzePresets());
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysisEntry[]>(() => loadRecentAnalyses());
  const [recentNotice, setRecentNotice] = useState<PresetNotice | null>(null);
  const [formNotice, setFormNotice] = useState<PresetNotice | null>(null);
  const [actionSizingRows, setActionSizingRows] = useState<SolutionListItem[]>([]);
  const [actionSizingLoading, setActionSizingLoading] = useState(false);
  const [actionSizingError, setActionSizingError] = useState<string | null>(null);
  const [selectedActionSizing, setSelectedActionSizing] = useState<ActionSizingOption | null>(null);
  const [handoffContext, setHandoffContext] = useState<AnalyzeHandoffContext | null>(null);

  const formBuildResult = useMemo(() => buildAnalyzeRequestFromForm(formState), [formState]);
  const heroPositionOptions = positionsForTableSize(formState.tableSize);
  const actionSizingOptions = useMemo(() => {
    const solutionInputs = buildAnalyzeActionSizingSolutions(actionSizingRows);
    return extractAvailableActionSizingOptions(solutionInputs, buildAnalyzeActionSizingFilter(formState));
  }, [actionSizingRows, formState]);

  useEffect(() => {
    let cancelled = false;
    setActionSizingLoading(true);
    setActionSizingError(null);
    listSolutions("", 500)
      .then((rows) => {
        if (!cancelled) {
          setActionSizingRows(rows);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setActionSizingError(toUserFacingApiError(caught, "DB action/sizing 후보를 불러오지 못했습니다."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setActionSizingLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!prefill) {
      return;
    }
    if (!isSpotInputCandidate(prefill.spot)) {
      setMode("form");
      setFormErrors([]);
      setError(null);
      setResult(null);
      setSelectedActionSizing(null);
      setHandoffContext(null);
      setFormNotice({
        tone: "error",
        text: "Database에서 전달된 context를 사용할 수 없습니다. 샘플 입력 상태를 유지했으며 프리셋, 최근 분석, Trainer 기록은 삭제하지 않았습니다."
      });
      onConsumePrefill();
      return;
    }
    const transformed = analyzeFormStateFromSpot(prefill.spot);
    setFormState(transformed.formState);
    const built = buildAnalyzeRequestFromForm(transformed.formState);
    if (built.request) {
      setJsonRequest(JSON.stringify(built.request, null, 2));
    }
    setMode("form");
    setFormErrors([]);
    setError(null);
    setResult(null);
    setHandoffContext(prefill.context);
    if (transformed.warnings.length > 0) {
      setFormNotice({
        tone: "error",
        text: `Database에서 가져온 조건을 불러왔습니다. 일부 값을 확인해 주세요. (${transformed.warnings[0]})`
      });
    } else {
      setFormNotice({
        tone: "success",
        text: "Database에서 가져온 조건을 Analyze 폼에 채웠습니다. Analyze 실행은 직접 눌러주세요."
      });
    }
    onConsumePrefill();
    setSelectedActionSizing(null);
  }, [prefill, onConsumePrefill]);

  function setTableSize(nextTableSize: number) {
    setFormState((previous) => {
      const resized = resizePlayers(previous, nextTableSize);
      return normalizeHeroSeat(resized, resized.heroSeat);
    });
  }

  function setHeroSeat(nextSeat: number) {
    setFormState((previous) => normalizeHeroSeat(previous, clamp(nextSeat, 1, previous.tableSize)));
  }

  function setHeroPosition(nextPosition: string) {
    setFormState((previous) => {
      const heroSeat = clamp(previous.heroSeat, 1, previous.tableSize);
      const players = previous.players.map((player) =>
        player.seat === heroSeat ? { ...player, position: nextPosition.toUpperCase() } : player
      );
      return {
        ...previous,
        heroPosition: nextPosition.toUpperCase(),
        players
      };
    });
  }

  function updatePlayer(
    seat: number,
    patch: {
      position?: string;
      stackBb?: number;
      inHand?: boolean;
      setHeroSeat?: boolean;
      villainPreset?: VillainPresetOption;
      callRangePct?: number;
    }
  ) {
    setFormState((previous) => {
      const players = previous.players.map((player) => {
        if (player.seat !== seat) {
          return player;
        }
        return {
          ...player,
          ...(patch.position ? { position: patch.position.toUpperCase() } : {}),
          ...(typeof patch.stackBb === "number" ? { stackBb: patch.stackBb } : {}),
          ...(typeof patch.inHand === "boolean" ? { inHand: patch.inHand } : {}),
          ...(patch.villainPreset ? { villainPreset: patch.villainPreset } : {}),
          ...(typeof patch.callRangePct === "number" ? { callRangePct: patch.callRangePct } : {})
        };
      });

      const nextState = { ...previous, players };

      if (patch.setHeroSeat) {
        return normalizeHeroSeat(nextState, seat);
      }
      if (patch.position && seat === previous.heroSeat) {
        return { ...nextState, heroPosition: patch.position.toUpperCase() };
      }
      return nextState;
    });
  }

  function resetAnalyzeInput() {
    setFormState(initialFormState);
    setJsonRequest(JSON.stringify(initialAnalyzeRequest, null, 2));
    setFormErrors([]);
    setError(null);
    setResult(null);
    setPresetNotice(null);
    setRecentNotice(null);
    setFormNotice(null);
    setSelectedActionSizing(null);
    setHandoffContext(null);
  }

  function resetAnalyzeHandoffContext() {
    setHandoffContext(null);
    setFormNotice({
      tone: "success",
      text: "전달 context 안내를 초기화했습니다. 현재 폼 값, 프리셋, 최근 분석, Trainer 기록은 삭제하지 않았습니다."
    });
  }

  function onSavePreset() {
    const trimmedName = presetName.trim();
    if (!trimmedName) {
      setPresetNotice({ tone: "error", text: "프리셋 이름을 입력해 주세요." });
      return;
    }
    try {
      saveAnalyzePreset({ name: trimmedName, formState });
      setPresets(loadAnalyzePresets());
      setPresetNotice({ tone: "success", text: `프리셋 "${trimmedName}"을 저장했습니다.` });
      setPresetName("");
    } catch {
      setPresetNotice({ tone: "error", text: "프리셋 저장에 실패했습니다." });
    }
  }

  function onDeletePreset(id: string) {
    try {
      const next = deleteAnalyzePreset(id);
      setPresets(next);
      setPresetNotice({ tone: "success", text: "프리셋을 삭제했습니다." });
    } catch {
      setPresetNotice({ tone: "error", text: "프리셋 삭제에 실패했습니다." });
    }
  }

  function onApplyPreset(id: string) {
    try {
      const preset = applyAnalyzePreset(id);
      if (!preset) {
        setPresetNotice({ tone: "error", text: "선택한 프리셋을 찾을 수 없습니다." });
        return;
      }
      setFormState(preset.formState);
      const buildResult = buildAnalyzeRequestFromForm(preset.formState);
      if (buildResult.request) {
        setJsonRequest(JSON.stringify(buildResult.request, null, 2));
      }
      setFormErrors([]);
      setError(null);
      setResult(null);
      setMode("form");
      setPresetNotice({ tone: "success", text: `프리셋 "${preset.name}"을 불러왔습니다.` });
      setFormNotice(null);
      setSelectedActionSizing(null);
    } catch {
      setPresetNotice({ tone: "error", text: "프리셋 불러오기에 실패했습니다." });
    }
  }

  function onApplyRecent(entry: RecentAnalysisEntry) {
    setFormState(entry.formState);
    const buildResult = buildAnalyzeRequestFromForm(entry.formState);
    if (buildResult.request) {
      setJsonRequest(JSON.stringify(buildResult.request, null, 2));
    }
    setFormErrors([]);
    setError(null);
    setResult(null);
    setMode("form");
    setRecentNotice({ tone: "success", text: "최근 분석 입력값을 불러왔습니다. Analyze 실행은 직접 눌러주세요." });
    setFormNotice(null);
    setSelectedActionSizing(null);
  }

  function onDeleteRecent(id: string) {
    const next = deleteRecentAnalysis(id);
    setRecentAnalyses(next);
    setRecentNotice({ tone: "success", text: "최근 분석 기록을 삭제했습니다." });
  }

  function onClearRecent() {
    clearRecentAnalyses();
    setRecentAnalyses([]);
    setRecentNotice({ tone: "success", text: "최근 분석 기록을 모두 삭제했습니다." });
  }

  function onSelectActionSizing(option: ActionSizingOption) {
    const applied = applyActionSizingCandidateToForm(formState, option);
    setFormState(applied.formState);
    const buildResult = buildAnalyzeRequestFromForm(applied.formState);
    if (buildResult.request) {
      setJsonRequest(JSON.stringify(buildResult.request, null, 2));
    }
    setSelectedActionSizing(option);
    setFormErrors([]);
    setError(null);
    setResult(null);
    setFormNotice({
      tone: "success",
      text: applied.appliedActionPathText
        ? "DB action/sizing 후보로 action path를 채웠습니다. Analyze 실행은 직접 눌러주세요."
        : "DB action/sizing 후보를 선택했습니다. Analyze 실행은 직접 눌러주세요."
    });
  }

  async function runAnalyze() {
    setLoading(true);
    setError(null);
    setFormErrors([]);
    try {
      let request: AnalyzeRequest;
      if (mode === "form") {
        if (formBuildResult.errors.length > 0 || !formBuildResult.request) {
          setFormErrors(formBuildResult.errors);
          setError("입력값을 확인해 주세요.");
          return;
        }
        request = formBuildResult.request;
        setJsonRequest(JSON.stringify(request, null, 2));
      } else {
        const parsed = JSON.parse(jsonRequest) as AnalyzeRequest;
        if (!parsed || typeof parsed !== "object" || !parsed.spot) {
          throw new Error("고급 JSON 입력 형식이 올바르지 않습니다.");
        }
        request = parsed;
      }

      const response = await analyzeSpot(request);
      setResult(response);
      const nextRecent = addRecentAnalysis({
        formState,
        source: response.source,
        sourceLabel: response.sourceLabel,
        summary: buildRecentAnalysisSummary(formState, response),
        metadata: {
          ...(response.canonicalKey ? { canonicalKey: response.canonicalKey } : {}),
          ...(response.fallbackMetadata?.modelVersion ? { modelVersion: response.fallbackMetadata.modelVersion } : {}),
          ...(response.missingRequirements?.length ? { missingRequirements: response.missingRequirements } : {})
        }
      });
      setRecentAnalyses(nextRecent);
      setRecentNotice(null);
      setFormNotice(null);
    } catch (caught) {
      setError(toUserFacingApiError(caught, caught instanceof Error ? caught.message : "분석 요청에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="workspace-grid">
      <div className="panel stack">
        <div className="panel-title">
          <SlidersHorizontal size={18} />
          <h2>Analyze Spot</h2>
        </div>

        <div className="tabs" aria-label="Analyze 입력 방식">
          <button className={mode === "form" ? "active" : ""} onClick={() => setMode("form")} type="button">
            폼 입력
          </button>
          <button
            className={mode === "json" ? "active" : ""}
            onClick={() => {
              setMode("json");
              if (formBuildResult.request) {
                setJsonRequest(JSON.stringify(formBuildResult.request, null, 2));
              }
            }}
            type="button"
          >
            고급 JSON 입력
          </button>
        </div>

        {handoffContext ? (
          <div className="notice success analyze-handoff-context" data-testid="analyze-handoff-context">
            <div>
              <strong>Database에서 가져온 Analyze 조건입니다.</strong>
              <p>
                전달 context: {handoffContext.label} · canonical key {shortCanonicalKey(handoffContext.canonicalKey)}
              </p>
              <p>
                자동으로 채운 값은 폼에서 직접 수정할 수 있습니다. Analyze 실행은 사용자가 직접 눌러야 하며 자동 분석은 수행하지 않습니다.
              </p>
              <p>
                context 안내 초기화는 전달 표시만 지우며 프리셋, 최근 분석, Trainer 기록은 삭제하지 않습니다.
              </p>
            </div>
            <button className="preset-action" data-testid="analyze-handoff-reset-button" onClick={resetAnalyzeHandoffContext} type="button">
              <RefreshCw size={14} />
              전달 context 초기화
            </button>
          </div>
        ) : null}

        {mode === "form" ? (
          <>
            <div className="editor-block">
              <h3>Analyze 프리셋</h3>
              <div className="preset-toolbar">
                <label>
                  프리셋 이름
                  <input
                    aria-label="프리셋 이름"
                    placeholder="예: 6max BTN 18bb open shove"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                  />
                </label>
                <button className="primary-action" data-testid="preset-save-button" onClick={onSavePreset} type="button">
                  <BookmarkPlus size={16} />
                  현재 입력을 프리셋으로 저장
                </button>
              </div>

              {presetNotice && (
                <div className={`notice ${presetNotice.tone === "success" ? "success" : ""}`}>
                  <p>{presetNotice.text}</p>
                </div>
              )}

              {presets.length === 0 ? (
                <p className="muted">저장된 프리셋이 없습니다.</p>
              ) : (
                <div className="preset-list" data-testid="analyze-preset-list">
                  {presets.map((preset) => (
                    <div className="preset-row" key={preset.id}>
                      <div className="preset-summary">
                        <strong>{preset.name}</strong>
                        <span>updated {new Date(preset.updatedAt).toLocaleString("ko-KR")}</span>
                      </div>
                      <div className="preset-actions">
                        <button className="preset-action" onClick={() => onApplyPreset(preset.id)} type="button">
                          <Download size={14} />
                          불러오기
                        </button>
                        <button className="preset-action danger" onClick={() => onDeletePreset(preset.id)} type="button">
                          <Trash2 size={14} />
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="editor-block">
              <div className="panel-title">
                <History size={16} />
                <h3>최근 분석</h3>
                {recentAnalyses.length > 0 ? (
                  <button className="preset-action danger" onClick={onClearRecent} type="button">
                    <Trash2 size={14} />
                    전체 삭제
                  </button>
                ) : null}
              </div>

              {recentNotice && (
                <div className={`notice ${recentNotice.tone === "success" ? "success" : ""}`}>
                  <p>{recentNotice.text}</p>
                </div>
              )}

              {recentAnalyses.length === 0 ? (
                <p className="muted" data-testid="recent-analyses-empty">
                  최근 분석 기록이 없습니다.
                </p>
              ) : (
                <div className="recent-list" data-testid="recent-analyses-list">
                  {recentAnalyses.map((entry) => (
                    <div className="recent-row" key={entry.id}>
                      <div className="recent-summary">
                        <strong>{entry.summary.heroPosition} / {entry.summary.tableSize}명</strong>
                        <span>
                          Hero {typeof entry.summary.heroStackBb === "number" ? `${entry.summary.heroStackBb.toFixed(1)}BB` : "N/A"} ·{" "}
                          {entry.summary.treeConfig}
                        </span>
                        <span>
                          {entry.source} · {new Date(entry.createdAt).toLocaleString("ko-KR")}
                        </span>
                        <span className="muted">
                          {entry.metadata.canonicalKey ? `key: ${entry.metadata.canonicalKey}` : "canonical key 없음"}
                          {entry.metadata.modelVersion ? ` · model: ${entry.metadata.modelVersion}` : ""}
                          {entry.metadata.missingRequirements?.length ? ` · missing: ${entry.metadata.missingRequirements.length}` : ""}
                        </span>
                      </div>
                      <div className="recent-actions">
                        <button className="preset-action" onClick={() => onApplyRecent(entry)} type="button">
                          <Download size={14} />
                          불러오기
                        </button>
                        <button className="preset-action danger" onClick={() => onDeleteRecent(entry.id)} type="button">
                          <Trash2 size={14} />
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AnalyzeActionSizingSelector
              options={actionSizingOptions}
              loading={actionSizingLoading}
              error={actionSizingError}
              selected={selectedActionSizing}
              onSelect={onSelectActionSizing}
            />

            <div className="form-grid">
              <label>
                게임 유형
                <input value="NLHE MTT (고정)" readOnly />
              </label>
              <label>
                결정 유형
                <input value="Shove/Fold decision (고정)" readOnly />
              </label>
              <label>
                남은 인원 (2~10)
                <input
                  aria-label="남은 인원"
                  type="number"
                  min={2}
                  max={10}
                  value={formState.tableSize}
                  onChange={(event) => setTableSize(Number(event.target.value))}
                />
              </label>
              <label>
                Hero 좌석
                <input
                  type="number"
                  min={1}
                  max={formState.tableSize}
                  value={formState.heroSeat}
                  onChange={(event) => setHeroSeat(Number(event.target.value))}
                />
              </label>
              <label>
                Hero 포지션
                <select
                  value={formState.heroPosition}
                  onChange={(event) => setHeroPosition(event.target.value)}
                  aria-label="Hero 포지션"
                >
                  {heroPositionOptions.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                트리 설정
                <select value={formState.treeConfig} onChange={() => undefined}>
                  <option value="open_shove_only">open_shove_only</option>
                </select>
              </label>
              <label>
                Pot BB
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formState.potBb}
                  onChange={(event) => setFormState((previous) => ({ ...previous, potBb: Number(event.target.value) }))}
                />
              </label>
              <label>
                Small blind (BB)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formState.blinds.smallBb}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      blinds: { ...previous.blinds, smallBb: Number(event.target.value) }
                    }))
                  }
                />
              </label>
              <label>
                Big blind (BB)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={formState.blinds.bigBb}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      blinds: { ...previous.blinds, bigBb: Number(event.target.value) }
                    }))
                  }
                />
              </label>
              <label>
                Ante
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formState.blinds.anteBb}
                  onChange={(event) =>
                    setFormState((previous) => ({
                      ...previous,
                      blinds: { ...previous.blinds, anteBb: Number(event.target.value) }
                    }))
                  }
                />
              </label>
              <label>
                Fallback equity 샘플 수
                <input
                  type="number"
                  min={20}
                  max={600}
                  value={formState.equitySamples}
                  onChange={(event) => setFormState((previous) => ({ ...previous, equitySamples: Number(event.target.value) }))}
                />
              </label>
            </div>

            <div className="editor-block">
              <h3>플레이어 (stack BB / villain preset)</h3>
              <p className="muted">stack BB는 0보다 큰 숫자로 입력하세요. Hero가 아닌 자리에서 range preset/call %를 조정할 수 있습니다.</p>
              <div className="player-table">
                <span>좌석</span>
                <span>포지션</span>
                <span>스택</span>
                <span>참여</span>
                <span>Hero</span>
                <span>레인지</span>
                {formState.players.slice(0, formState.tableSize).map((player) => (
                  <AnalyzePlayerRow key={player.seat} player={player} onChange={(patch) => updatePlayer(player.seat, patch)} />
                ))}
              </div>
            </div>

            <div className="editor-block">
              <h3>Action path</h3>
              <label>
                예: FOLD, FOLD, HERO_DECISION
                <textarea
                  className="compact-textarea"
                  value={formState.actionPathText}
                  onChange={(event) => setFormState((previous) => ({ ...previous, actionPathText: event.target.value }))}
                />
              </label>
            </div>

            <div className="editor-block">
              <h3>Payouts</h3>
              <p className="muted">남은 인원 수와 같은 개수로 입력하세요. 미지급 순위는 0으로 입력합니다.</p>
              <label>
                예: 1000, 700, 500, 350, 0, 0
                <textarea
                  className="compact-textarea"
                  value={formState.payoutsText}
                  onChange={(event) => setFormState((previous) => ({ ...previous, payoutsText: event.target.value }))}
                />
              </label>
            </div>
          </>
        ) : (
          <div className="editor-block">
            <h3>고급 JSON 입력 (디버그용)</h3>
            <textarea value={jsonRequest} onChange={(event) => setJsonRequest(event.target.value)} spellCheck={false} />
          </div>
        )}

        {formErrors.length > 0 && (
          <div className="notice">
            {formErrors.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
        {formNotice && (
          <div className={`notice ${formNotice.tone === "success" ? "success" : ""}`}>
            <p>{formNotice.text}</p>
          </div>
        )}

        <div className="search-line">
          <button className="primary-action" data-testid="analyze-run-button" onClick={runAnalyze} type="button" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            Analyze 실행
          </button>
          <button className="preset-action" onClick={resetAnalyzeInput} type="button">
            <RefreshCw size={16} />
            샘플로 초기화
          </button>
          <button className="icon-button" onClick={resetAnalyzeInput} type="button" title="입력 초기화">
            <RefreshCw size={16} />
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
      <ResultPanel result={result} loading={loading} />
    </section>
  );
}

function AnalyzeActionSizingSelector({
  options,
  loading,
  error,
  selected,
  onSelect
}: {
  options: ActionSizingOptionsResult;
  loading: boolean;
  error: string | null;
  selected: ActionSizingOption | null;
  onSelect: (option: ActionSizingOption) => void;
}) {
  const hasUnspecified = options.actions.some((item) => item.sizeKind === "UNSPECIFIED" || item.action === "UNKNOWN");

  return (
    <div className="editor-block action-sizing-selector" data-testid="analyze-action-sizing-selector">
      <div className="panel-title">
        <Database size={16} />
        <h3>DB 기준 액션/사이즈 후보</h3>
      </div>
      <div className="notice">
        <p>DB에 실제 존재하는 action/size 후보만 표시합니다.</p>
        <p>DB에 없는 size는 HRC_PRECOMPUTED_DB exact match로 처리되지 않습니다.</p>
        <p>후보 선택은 폼 채우기만 수행하며 자동 분석하지 않습니다.</p>
        <p>fallback 조건이 완전하면 FALLBACK_ICM으로만 평가될 수 있습니다.</p>
      </div>

      <div className="detail-grid">
        <ResultDetailItem label="candidate count" value={String(options.candidateCount)} />
        <ResultDetailItem label="filtered solutions" value={`${options.filteredSolutionCount} / ${options.scannedSolutionCount}`} />
      </div>

      {loading ? <p className="muted">DB action/sizing 후보를 불러오는 중...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {hasUnspecified || options.warnings.length > 0 ? (
        <div className="notice" data-testid="analyze-action-sizing-warning">
          <p>일부 solution은 명시적 size 정보가 없어 actionPath/treeConfig 기준으로만 표시됩니다.</p>
          {options.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="notice success" data-testid="analyze-action-sizing-selected">
          <p>선택된 action: {selected.action}</p>
          <p>선택된 size: {selected.sizeLabel}</p>
          <p>
            sourceCount {selected.sourceCount} · confidence {selected.confidence}
          </p>
        </div>
      ) : null}

      {!loading && options.actions.length === 0 ? (
        <p className="muted" data-testid="analyze-action-sizing-empty">
          현재 조건에 맞는 DB action/sizing 후보가 없습니다.
        </p>
      ) : (
        <div className="action-sizing-list" data-testid="analyze-action-sizing-list">
          {options.actions.map((option) => (
            <button
              className="action-sizing-candidate"
              key={`${option.action}-${option.sizeKind}-${option.sizeLabel}-${option.sizeBb ?? "none"}`}
              onClick={() => onSelect(option)}
              type="button"
              data-testid="analyze-action-sizing-candidate"
            >
              <strong>{formatActionSizingOption(option)}</strong>
              <span>
                sourceCount {option.sourceCount} · confidence {option.confidence}
              </span>
              <span>
                examples:{" "}
                {option.examples
                  .map((example) => [example.sourceFile, example.treeConfig, example.actionPath.join(" > ")]
                    .filter((item) => item && item.length > 0)
                    .join(" / "))
                  .join(" | ") || "제공되지 않음"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyzePlayerRow({
  player,
  onChange
}: {
  player: AnalyzeFormState["players"][number];
  onChange: (patch: {
    position?: string;
    stackBb?: number;
    inHand?: boolean;
    setHeroSeat?: boolean;
    villainPreset?: VillainPresetOption;
    callRangePct?: number;
  }) => void;
}) {
  return (
    <>
      <strong>{player.seat}</strong>
      <input value={player.position} onChange={(event) => onChange({ position: event.target.value })} />
      <input type="number" min={0.1} step={0.1} value={player.stackBb} onChange={(event) => onChange({ stackBb: Number(event.target.value) })} />
      <input
        type="checkbox"
        checked={player.inHand}
        onChange={(event) => onChange({ inHand: event.target.checked })}
        aria-label={`Seat ${player.seat} 참여 여부`}
      />
      <input
        type="radio"
        checked={player.isHero}
        onChange={() => onChange({ setHeroSeat: true })}
        aria-label={`Seat ${player.seat} Hero 지정`}
        name="heroSeat"
      />
      <div className="range-controls">
        <select
          value={player.villainPreset}
          onChange={(event) => onChange({ villainPreset: event.target.value as VillainPresetOption })}
          disabled={player.isHero}
        >
          <option value="tight">tight</option>
          <option value="standard">standard</option>
          <option value="loose">loose</option>
          <option value="custom">custom</option>
        </select>
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={player.callRangePct}
          onChange={(event) => onChange({ callRangePct: Number(event.target.value) })}
          disabled={player.isHero}
        />
      </div>
    </>
  );
}

function ResultPanel({ result, loading }: { result: AnalyzeResult | null; loading: boolean }) {
  const rawDatabaseFeatures = result?.metadata?.databaseFeatures;
  const databaseFeatures = isHrcDatabaseFeatures(rawDatabaseFeatures) ? rawDatabaseFeatures : null;

  if (loading) {
    return (
      <div className="panel centered">
        <Loader2 className="spin" size={28} />
        <p>계산 중...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="panel empty-result">
        <div className="felt-visual" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>spot을 입력하고 분석을 실행해 주세요.</p>
      </div>
    );
  }

  const metadata = toRecord(result.metadata);
  const metadataEntries = metadata ? Object.entries(metadata).filter(([key]) => key !== "databaseFeatures") : [];
  const strategyCount = Object.keys(result.strategy ?? {}).length;
  const sourceFileName = readUnknownValue(metadata?.fileName);
  const sourceFileHash = readUnknownValue(metadata?.fileHash);
  const rangePresetComparison = buildRangePresetComparisonFromAnalyzeResult(result);
  const fallbackRanges = rangePresetComparison?.rows ?? [];
  const fallbackLimitations = result.fallbackMetadata?.limitations ?? [];
  const missingRequirements = result.missingRequirements ?? [];
  const sensitivitySummary = buildSensitivitySummaryFromAnalyzeResult(result);
  const evComparison = buildEvComparisonFromAnalyzeResult(result);
  const multiActionDetail = buildMultiActionFromAnalyzeResult(result);

  return (
    <div className="panel result-panel">
      <div className="result-header">
        <div>
          <p className={`source-badge ${sourceClass[result.source] ?? ""}`}>
            {result.source === RESULT_SOURCES.HRC_PRECOMPUTED_DB && <BadgeCheck size={15} />}
            {result.source !== RESULT_SOURCES.HRC_PRECOMPUTED_DB && <AlertTriangle size={15} />}
            {result.source}
          </p>
          <h2>{result.sourceLabel}</h2>
          <p className="muted">{sourceDescription[result.source] ?? "결과 출처를 확인해 주세요."}</p>
        </div>
      </div>

      <div className="info-grid">
        <InfoList
          title="EV Summary"
          items={[
            `foldEV: ${formatOptionalNumber(result.evSummary?.foldEv)}`,
            `shoveEV: ${formatOptionalNumber(result.evSummary?.shoveEv)}`,
            `difference: ${formatOptionalNumber(result.evSummary?.deltaEv)}`,
            `recommendation: ${formatRecommendation(result.evSummary?.bestAction)}`
          ]}
        />
        <InfoList title="Result Unit" items={[`unit: ${result.evSummary?.unit ?? "제공되지 않음"}`]} />
      </div>

      <div className="result-block">
        <h3>Canonical Key</h3>
        <code>{result.canonicalKey}</code>
      </div>

      {result.source === RESULT_SOURCES.HRC_PRECOMPUTED_DB && (
        <div className="result-block">
          <h3>HRC_PRECOMPUTED_DB 상세</h3>
          <p className="muted">정확히 같은 normalized spot에서 불러온 결과입니다.</p>
          <div className="detail-grid">
            <ResultDetailItem label="Exact match" value="YES" />
            <ResultDetailItem label="Strategy count" value={`${strategyCount} / 169`} />
            <ResultDetailItem label="Source file" value={sourceFileName} />
            <ResultDetailItem label="File hash" value={sourceFileHash} />
          </div>
          {metadataEntries.length > 0 && <MetadataList entries={metadataEntries} />}
        </div>
      )}

      {result.source === RESULT_SOURCES.FALLBACK_ICM && (
        <div className="result-block">
          <h3>FALLBACK_ICM 상세</h3>
          <p className="muted">
            이 결과는 Nash 솔버 결과가 아니라, 입력된 상대 콜링 레인지 가정에 따른 ICM EV 평가입니다.
          </p>
          <div className="notice" data-testid="fallback-explanation-block">
            <p>이 결과는 HRC_PRECOMPUTED_DB exact match가 아닌 fallback 결과입니다.</p>
            <p>villain calling range 가정 기반 ICM EV 평가이며 Nash solution이 아닙니다.</p>
            <p>EV 값이 없으면 제공되지 않음으로 표시됩니다.</p>
          </div>
          <div className="detail-grid">
            <ResultDetailItem label="modelVersion" value={result.fallbackMetadata?.modelVersion ?? "제공되지 않음"} />
            <ResultDetailItem label="villain range rows" value={String(fallbackRanges.length)} />
            <ResultDetailItem label="exact HRC match" value="NO" />
          </div>
          {evComparison && (
            <div className="result-block" data-testid="ev-comparison-block">
              <h3>ChipEV vs ICM EV (read-only)</h3>
              <p className="muted">새 계산이 아니라 기존 payload 표시입니다.</p>
              <div className="range-table" role="table" aria-label="ChipEV와 ICM EV 비교 표">
                <div className="range-row range-head ev-compare-row" role="row">
                  <span>metric</span>
                  <span>ChipEV</span>
                  <span>ICM EV</span>
                </div>
                {evComparison.rows.map((row) => (
                  <div className="range-row ev-compare-row" role="row" key={row.metric}>
                    <span>{row.metric}</span>
                    <span>{formatNotProvidedLabel(row.chipEvLabel)}</span>
                    <span>{formatNotProvidedLabel(row.icmEvLabel)}</span>
                  </div>
                ))}
              </div>
              <InfoList title="Notes" items={evComparison.notes} />
            </div>
          )}
          {rangePresetComparison && (
            <div className="result-block" data-testid="range-preset-comparison-block">
              <h3>Range preset 비교 (read-only)</h3>
              <p className="muted">{rangePresetComparison.notes[0] ?? "range preset 비교 정보입니다."}</p>
              <div className="detail-grid">
                <ResultDetailItem label="rows" value={String(rangePresetComparison.rowCount)} />
                <ResultDetailItem label="source" value={rangePresetComparison.source} />
              </div>
              {fallbackRanges.length > 0 ? (
                <div className="range-table" role="table" aria-label="Fallback 상대 레인지 표">
                  <div className="range-row range-head" role="row">
                    <span>position</span>
                    <span>preset 이름</span>
                    <span>사용자 수정</span>
                    <span>callRangePct</span>
                    <span>rangeSource</span>
                  </div>
                  {fallbackRanges.map((range) => (
                    <div className="range-row" role="row" key={`${range.seat}-${range.position}`}>
                      <span>{range.position}</span>
                      <span>{range.presetName}</span>
                      <span>{range.editedByUser ? "true" : "false"}</span>
                      <span>{range.callRangePct.toFixed(1)}%</span>
                      <span>{range.rangeSource}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">villainRanges 정보가 제공되지 않음</p>
              )}
            </div>
          )}
          {fallbackLimitations.length > 0 && (
            <div className="notice">
              {fallbackLimitations.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          )}
          <div className="info-grid">
            <InfoList title="Fallback assumptions" items={result.assumptions} />
            <InfoList title="Fallback limitations" items={result.limitations} />
          </div>

          {sensitivitySummary && (
            <div className="result-block sensitivity-block" data-testid="sensitivity-summary-block">
              <h3>상대 콜링 레인지 민감도 (Villain Range Sensitivity)</h3>
              <p className="muted">이 표는 Nash 해가 아니라 villain calling range 가정별 EV 민감도입니다.</p>
              <div className="detail-grid">
                <ResultDetailItem label="scenario count" value={String(sensitivitySummary.scenarioCount)} />
                <ResultDetailItem label="best scenario" value={formatSensitivityScenario(sensitivitySummary.bestScenario)} />
                <ResultDetailItem label="worst scenario" value={formatSensitivityScenario(sensitivitySummary.worstScenario)} />
              </div>
              {sensitivitySummary.rows.length > 0 ? (
                <div className="range-table" role="table" aria-label="상대 레인지 민감도 표" data-testid="sensitivity-summary-table">
                  <div className="range-row range-head sensitivity-row" role="row">
                    <span>presetName</span>
                    <span>callRangePct</span>
                    <span>shoveEV</span>
                    <span>foldEV</span>
                    <span>difference</span>
                    <span>label</span>
                  </div>
                  {sensitivitySummary.rows.map((row) => (
                    <div
                      className="range-row sensitivity-row"
                      role="row"
                      key={`${row.presetName}-${row.callRangePctLabel}-${row.differenceLabel}`}
                    >
                      <span>{row.presetName}</span>
                      <span>{formatSensitivityPercent(row.callRangePct)}</span>
                      <span>{formatSensitivityMetric(row.shoveEVLabel)}</span>
                      <span>{formatSensitivityMetric(row.foldEVLabel)}</span>
                      <span>{formatSensitivityMetric(row.differenceLabel)}</span>
                      <span>{formatSensitivityLabel(row.label)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">제공되지 않음</p>
              )}
              <div className="info-grid">
                <InfoList title="Explanation" items={sensitivitySummary.explanation} />
                <InfoList title="Limitations" items={sensitivitySummary.limitations} />
              </div>
            </div>
          )}
        </div>
      )}

      {result.source === RESULT_SOURCES.NOT_SOLVED && (
        <div className="notice not-solved-help">
          <p>DB exact match가 없고 fallback 계산 조건도 충족하지 않습니다.</p>
          <p>분석 불가 이유를 확인하고, 빈 입력을 채운 뒤 다시 실행해 주세요.</p>
          {missingRequirements.length > 0 ? (
            missingRequirements.map((item) => <p key={item}>- {item}</p>)
          ) : (
            <p>- 필수 입력이 비어 있습니다. remaining players / payouts / action path를 확인해 주세요.</p>
          )}
        </div>
      )}

      {databaseFeatures && <FeatureChips features={databaseFeatures} />}

      {missingRequirements.length > 0 && (
        <div className="notice">
          {missingRequirements.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      )}

      {result.strategy ? <HandMatrix strategy={result.strategy} /> : <div className="not-solved-box">NOT_SOLVED</div>}

      {result.source !== RESULT_SOURCES.NOT_SOLVED && (
        <AnalyzeMultiActionDetailBlock view={multiActionDetail} source={result.source} />
      )}

      <div className="info-grid">
        <InfoList title="Assumptions" items={result.assumptions} />
        <InfoList title="Limitations" items={result.limitations} />
      </div>
    </div>
  );
}

function AnalyzeMultiActionDetailBlock({
  view,
  source
}: {
  view: ReturnType<typeof buildMultiActionFromAnalyzeResult>;
  source: AnalyzeResult["source"];
}) {
  const previewHands = view?.hands.slice(0, 20) ?? [];

  return (
    <div className="result-block" data-testid="analyze-multi-action-detail">
      <h3>Hand별 액션 상세 (Multi-action detail)</h3>
      <div className="notice">
        <p>현재 v1.8은 저장된 v2 actions[]가 있으면 원본 multi-action strategy를 read-only로 표시합니다.</p>
        <p>{view?.isReadOnlyLegacyAdapter ? "v1 legacy strategy를 actions[] view model로 변환해 표시합니다." : "v2 multi-action strategy의 원본 actions[] 데이터를 표시합니다."}</p>
        <p>대부분 기존 DB에서는 hand당 action 1개만 표시될 수 있습니다.</p>
        <p>향후 schema v2/import v2에서 raise/call/fold/all-in 복수 action frequency와 EV를 저장할 예정입니다.</p>
      </div>

      {!view ? (
        <p className="muted">표시 가능한 multi-action strategy가 없습니다. source: {source}</p>
      ) : (
        <>
          <div className="detail-grid">
            <ResultDetailItem label="source" value={view.source} />
            <ResultDetailItem label="actionKinds" value={view.actionKinds.join(", ") || "제공되지 않음"} />
            <ResultDetailItem label="preview hands" value={`${previewHands.length} / ${view.hands.length}`} />
            <ResultDetailItem label="strategy mode" value={view.strategyMode} />
          </div>

          <div className="range-table" role="table" aria-label="Analyze multi-action 상세 표">
            <div className="range-row range-head multi-action-row" role="row">
              <span>hand</span>
              <span>action</span>
              <span>size</span>
              <span>frequency</span>
              <span>EV</span>
              <span>ChipEV</span>
              <span>ICM EV</span>
              <span>source / warning</span>
            </div>
            {previewHands.flatMap((hand) =>
              hand.actions.map((action, actionIndex) => (
                <div className="range-row multi-action-row" role="row" key={`${hand.hand}-${action.action}-${actionIndex}`}>
                  <span>{hand.hand}</span>
                  <span>{action.action}</span>
                  <span>{formatMultiActionSize(action.size)}</span>
                  <span>{formatActionFrequency(action.frequency)}</span>
                  <span>{action.evLabel || formatActionEv(action.ev)}</span>
                  <span>{formatActionEv(action.chipEv)}</span>
                  <span>{formatActionEv(action.icmEv)}</span>
                  <span>{`${view.source}${action.warnings.length > 0 ? ` / ${formatMultiActionWarnings(action.warnings)}` : ""}`}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HandMatrix({ strategy }: { strategy: StrategyMatrix }) {
  const shoveCount = useMemo(() => Object.values(strategy).filter((entry) => entry.action === "SHOVE").length, [strategy]);
  return (
    <div className="matrix-wrap">
      <div className="matrix-summary">
        <span>Shove {shoveCount}/169</span>
        <span>Fold {169 - shoveCount}/169</span>
      </div>
      <div className="hand-matrix">
        {HAND_KEYS.map((hand) => {
          const entry = strategy[hand];
          const action = entry?.action ?? "FOLD";
          const frequency = entry?.frequency ?? 0;
          return (
            <button
              key={hand}
              className={`hand-cell ${action.toLowerCase()}`}
              title={`${hand} ${action} ${(frequency * 100).toFixed(0)}%`}
              type="button"
            >
              <strong>{hand}</strong>
              <span>{Math.round(frequency * 100)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="info-list">
      <h3>{title}</h3>
      {items.map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function ResultDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetadataList({ entries }: { entries: Array<[string, unknown]> }) {
  return (
    <div className="meta-list">
      <h3>Imported metadata</h3>
      {entries.map(([key, value]) => (
        <p key={key}>
          <strong>{key}</strong>: {readUnknownValue(value)}
        </p>
      ))}
    </div>
  );
}

function ImportView() {
  const [format, setFormat] = useState<HrcImportPayload["format"]>("json");
  const [sourceLabel, setSourceLabel] = useState(sampleImportPayload.sourceLabel ?? "");
  const [fileName, setFileName] = useState(sampleImportPayload.fileName ?? "");
  const [content, setContent] = useState(sampleImportPayload.content);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<LatestReportsSummary | null>(null);
  const [dbHealth, setDbHealth] = useState<DbHealthSummary | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [validation, setValidation] = useState<ImportValidationSummary | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [leftDiffText, setLeftDiffText] = useState(() => JSON.stringify(defaultSpot, null, 2));
  const [rightDiffText, setRightDiffText] = useState(() => JSON.stringify(defaultSpot, null, 2));
  const [diffResult, setDiffResult] = useState<CanonicalKeyDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  async function loadReports() {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const [latestReports, healthSummary] = await Promise.all([getLatestReportsSummary(), getDbHealthSummary()]);
      setReports(latestReports);
      setDbHealth(healthSummary);
    } catch (caught) {
      setReportsError(toUserFacingApiError(caught, "리포트 조회에 실패했습니다."));
      setDbHealth(null);
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  async function submitImport() {
    setLoading(true);
    setError(null);
    try {
      setResponse(await importHrc({ format, content, fileName, sourceLabel }));
    } catch (caught) {
      setError(toUserFacingApiError(caught, "import에 실패했습니다."));
    } finally {
      setLoading(false);
    }
    void loadReports();
  }

  async function runValidation() {
    setValidationLoading(true);
    setValidationError(null);
    try {
      const summary = await validateHrcImport({ format, content, fileName, sourceLabel });
      setValidation(summary);
    } catch (caught) {
      setValidation(null);
      setValidationError(toUserFacingApiError(caught, "검증 실행에 실패했습니다."));
    } finally {
      setValidationLoading(false);
    }
  }

  async function runCanonicalDiff() {
    setDiffLoading(true);
    setDiffError(null);
    try {
      const left = parseCanonicalDiffText(leftDiffText, "left");
      const right = parseCanonicalDiffText(rightDiffText, "right");
      const result = await diffCanonicalKeys({ left, right });
      setDiffResult(result);
    } catch (caught) {
      setDiffResult(null);
      setDiffError(toUserFacingApiError(caught, caught instanceof Error ? caught.message : "canonical diff 실행에 실패했습니다."));
    } finally {
      setDiffLoading(false);
    }
  }

  return (
    <section className="single-column">
      <div className="panel stack">
        <div className="panel-title">
          <FileUp size={18} />
          <h2>HRC DB Import</h2>
        </div>
        <div className="form-grid import-grid">
          <label>
            Format
            <select value={format} onChange={(event) => setFormat(event.target.value as HrcImportPayload["format"])}>
              <option value="json">json</option>
              <option value="csv">csv</option>
            </select>
          </label>
          <label>
            Source label
            <input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} />
          </label>
          <label>
            File name
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
          </label>
          <label>
            File
            <input
              type="file"
              accept=".json,.csv,text/csv,application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                setFileName(file.name);
                setFormat(file.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
                setContent(await file.text());
              }}
            />
          </label>
        </div>
        <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} />
        <div className="import-actions">
          <button className="primary-action" onClick={submitImport} type="button" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <FileUp size={18} />}
            Import 저장
          </button>
          <button
            className="preset-action"
            data-testid="import-validate-button"
            onClick={() => void runValidation()}
            type="button"
            disabled={validationLoading}
          >
            {validationLoading ? <Loader2 className="spin" size={14} /> : <BadgeCheck size={14} />}
            Import 검증
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {validationError && <p className="error-text">{validationError}</p>}
        {response && (
          <div className="notice success">
            <p>import #{response.import.id} 저장 완료</p>
            <p>{response.import.rowCount} records</p>
            <p>{response.import.fileHash.slice(0, 16)}</p>
            {response.import.databaseFeatures && <FeatureChips features={response.import.databaseFeatures} />}
          </div>
        )}
        <ImportValidationCard summary={validation} loading={validationLoading} />
        <CanonicalKeyDiffPanel
          leftText={leftDiffText}
          rightText={rightDiffText}
          onChangeLeft={setLeftDiffText}
          onChangeRight={setRightDiffText}
          onRun={() => void runCanonicalDiff()}
          loading={diffLoading}
          error={diffError}
          result={diffResult}
        />
      </div>
      <ImportReportsPanel reports={reports} dbHealth={dbHealth} loading={reportsLoading} error={reportsError} onRefresh={loadReports} />
    </section>
  );
}

function ImportReportsPanel({
  reports,
  dbHealth,
  loading,
  error,
  onRefresh
}: {
  reports: LatestReportsSummary | null;
  dbHealth: DbHealthSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  const importReport = reports?.importReport ?? null;
  const verificationReport = reports?.verificationReport ?? null;
  const canonicalReport = reports?.canonicalKeyReport ?? null;

  return (
    <div className="panel stack">
      <div className="panel-title">
        <h2>Import 리포트 요약</h2>
        <button className="icon-button" onClick={() => void onRefresh()} type="button" title="리포트 새로고침">
          <RefreshCw size={16} />
        </button>
      </div>

      {loading && <p className="muted">리포트를 불러오는 중입니다...</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="report-grid">
        <ReportCard
          testId="db-health-summary-card"
          title="DB Health"
          badge={badgeForDbHealth(dbHealth)}
          generatedAt={reports?.verificationReport.generatedAt ?? null}
        >
          {!dbHealth ? (
            <p className="muted">아직 import 검증 리포트가 없습니다.</p>
          ) : (
            <div className="detail-grid">
              <ResultDetailItem label="total solutions" value={formatCount(dbHealth.totalSolutions)} />
              <ResultDetailItem label="total strategy entries" value={formatCount(dbHealth.totalStrategyEntries)} />
              <ResultDetailItem label="distinct canonical keys" value={formatCount(dbHealth.distinctCanonicalKeys)} />
              <ResultDetailItem label="duplicate canonical key count" value={formatCount(dbHealth.duplicateCanonicalKeyCount)} />
              <ResultDetailItem label="latest import status" value={formatReportStatus(dbHealth.latestImportStatus)} />
              <ResultDetailItem label="latest verification status" value={formatReportStatus(dbHealth.latestVerificationStatus)} />
              <ResultDetailItem
                label="exact lookup 성공률"
                value={formatRate(dbHealth.exactLookup.success, dbHealth.exactLookup.total, dbHealth.exactLookup.successRatePct)}
              />
              <ResultDetailItem
                label="random lookup 성공률"
                value={formatRate(dbHealth.randomLookup.success, dbHealth.randomLookup.total, dbHealth.randomLookup.successRatePct)}
              />
              <ResultDetailItem label="near-match HRC 오탐 수" value={formatCount(dbHealth.nearMatchFalsePositiveCount)} />
              <ResultDetailItem label="discarded hrcz count" value={formatCount(dbHealth.discardedHrczCount)} />
              <ResultDetailItem label="skipped file count" value={formatCount(dbHealth.skippedFileCount)} />
              <ResultDetailItem label="failed record count" value={formatFailedRecords(dbHealth.failedRecordCount)} />
              <ResultDetailItem
                label="latest canonical key report status"
                value={formatReportStatus(dbHealth.latestCanonicalKeyReportStatus)}
              />
            </div>
          )}
        </ReportCard>

        <ReportCard
          testId="import-report-summary-card"
          title="latest-import-report.json"
          badge={badgeForImportReport(importReport)}
          generatedAt={importReport?.generatedAt ?? null}
        >
          {importReport?.status !== "available" || !importReport.summary ? (
            <p className="muted">{missingReportMessage(importReport?.status)}</p>
          ) : (
            <>
              <div className="detail-grid">
                <ResultDetailItem label="imported files" value={formatCount(importReport.summary.importedFiles)} />
                <ResultDetailItem label="skipped files" value={formatCount(importReport.summary.skippedFiles)} />
                <ResultDetailItem label="discarded hrcz files" value={formatCount(importReport.summary.discardedHrczFiles)} />
                <ResultDetailItem label="imported records" value={formatCount(importReport.summary.importedRecords)} />
                <ResultDetailItem label="failed records" value={formatFailedRecords(importReport.summary.failedRecords)} />
                <ResultDetailItem label="warnings" value={formatCount(importReport.summary.warnings.length)} />
              </div>
              <ReportImportDetails summary={importReport.summary} />
            </>
          )}
        </ReportCard>

        <ReportCard
          testId="verification-report-summary-card"
          title="latest-verification-report.json"
          badge={badgeForVerificationReport(verificationReport)}
          generatedAt={verificationReport?.generatedAt ?? null}
        >
          {verificationReport?.status !== "available" || !verificationReport.summary ? (
            <p className="muted">{missingReportMessage(verificationReport?.status)}</p>
          ) : (
            <div className="detail-grid">
              <ResultDetailItem
                label="exact lookup success rate"
                value={formatRate(verificationReport.summary.exactLookup.success, verificationReport.summary.exactLookup.total, verificationReport.summary.exactLookup.successRatePct)}
              />
              <ResultDetailItem
                label="random lookup success rate"
                value={formatRate(
                  verificationReport.summary.randomLookup.success,
                  verificationReport.summary.randomLookup.total,
                  verificationReport.summary.randomLookup.successRatePct
                )}
              />
              <ResultDetailItem
                label="duplicate canonical key"
                value={formatCount(verificationReport.summary.duplicateCanonicalKeyCount)}
              />
              <ResultDetailItem
                label="near-match HRC 오탐"
                value={formatCount(verificationReport.summary.nearMatchFalsePositiveCount)}
              />
            </div>
          )}
        </ReportCard>

        <ReportCard
          testId="verification-report-detail-card"
          title="Verification 상세"
          badge={badgeForVerificationReport(verificationReport)}
          generatedAt={verificationReport?.generatedAt ?? null}
        >
          {verificationReport?.status !== "available" || !verificationReport.summary ? (
            <p className="muted">{missingReportMessage(verificationReport?.status)}</p>
          ) : (
            <VerificationDetailSection summary={verificationReport.summary} />
          )}
        </ReportCard>

        <ReportCard
          testId="canonical-report-summary-card"
          title="latest-canonical-key-report.json"
          badge={badgeForCanonicalReport(canonicalReport)}
          generatedAt={canonicalReport?.generatedAt ?? null}
        >
          {canonicalReport?.status !== "available" || !canonicalReport.summary ? (
            <p className="muted">{missingReportMessage(canonicalReport?.status)}</p>
          ) : (
            <div className="detail-grid">
              <ResultDetailItem label="mismatch count" value={formatCount(canonicalReport.summary.mismatchCount)} />
              <ResultDetailItem label="updated count" value={formatCount(canonicalReport.summary.updatedCount)} />
              <ResultDetailItem label="collision count" value={formatCount(canonicalReport.summary.collisionCount)} />
              <ResultDetailItem label="invalid count" value={formatCount(canonicalReport.summary.invalidCount)} />
            </div>
          )}
        </ReportCard>
      </div>
    </div>
  );
}

function ImportValidationCard({ summary, loading }: { summary: ImportValidationSummary | null; loading: boolean }) {
  return (
    <div className="result-block report-card" data-testid="import-validation-summary-card">
      <div className="report-card-header">
        <h3>Import Validation</h3>
        <span className={`report-status-badge ${badgeToneForValidation(summary?.status ?? null)}`}>
          {labelForValidationStatus(summary?.status ?? null)}
        </span>
      </div>
      {loading ? <p className="muted">검증 중...</p> : null}
      {!loading && !summary ? <p className="muted">검증 리포트 없음</p> : null}
      {summary ? (
        <>
          <p className="muted">생성 시각: {new Date(summary.generatedAt).toLocaleString("ko-KR")}</p>
          <div className="detail-grid">
            <ResultDetailItem label="status" value={summary.status} />
            <ResultDetailItem label="format" value={summary.format} />
            <ResultDetailItem label="total rows" value={formatCount(summary.totalRows)} />
            <ResultDetailItem label="valid rows" value={formatCount(summary.validRows)} />
            <ResultDetailItem label="failed rows" value={formatCount(summary.failedRows)} />
            <ResultDetailItem label="warning rows" value={formatCount(summary.warningCount)} />
            <ResultDetailItem label="error rows" value={formatCount(summary.errorCount)} />
            <ResultDetailItem label="duplicate canonical keys" value={formatCount(summary.duplicateCanonicalKeyCount)} />
            {summary.schemaVersion ? <ResultDetailItem label="schemaVersion" value={summary.schemaVersion} /> : null}
            {summary.schemaVersion ? (
              <ResultDetailItem label="multiActionStrategyCount" value={formatCount(summary.multiActionStrategyCount ?? null)} />
            ) : null}
            {summary.schemaVersion ? (
              <ResultDetailItem label="multiActionHandCount" value={formatCount(summary.multiActionHandCount ?? null)} />
            ) : null}
            {summary.schemaVersion ? <ResultDetailItem label="actionCount" value={formatCount(summary.actionCount ?? null)} /> : null}
          </div>
          <ImportValidationDetails duplicatePreview={summary.duplicateCanonicalKeyPreview} issues={summary.issues} />
        </>
      ) : null}
    </div>
  );
}

function ImportValidationDetails({
  duplicatePreview,
  issues
}: {
  duplicatePreview: DuplicateCanonicalPreview[];
  issues: ImportValidationIssue[];
}) {
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const errors = issues.filter((issue) => issue.severity === "error");
  return (
    <div className="info-grid">
      <div className="info-list">
        <h3>Duplicate canonical key preview</h3>
        {duplicatePreview.length === 0 ? (
          <p className="muted">제공되지 않음</p>
        ) : (
          duplicatePreview.slice(0, 20).map((item) => (
            <p key={`${item.canonicalKey}:${item.count}`}>
              {item.canonicalKey.slice(0, 80)}... (rows: {item.rowNumbers.join(", ")})
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>실패 있음 (error)</h3>
        {errors.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          errors.slice(0, 30).map((issue, index) => (
            <p key={`${issue.code}:${issue.rowNumber ?? "none"}:${index}`}>
              {formatIssueRow(issue.rowNumber)} {issue.code}: {issue.message}
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>주의 필요 (warning)</h3>
        {warnings.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          warnings.slice(0, 30).map((issue, index) => (
            <p key={`${issue.code}:${issue.rowNumber ?? "none"}:${index}`}>
              {formatIssueRow(issue.rowNumber)} {issue.code}: {issue.message}
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>validation notes</h3>
        <p>Import 저장 없이 검증만 수행합니다.</p>
        <p>값이 없으면 "제공되지 않음"으로 표시됩니다.</p>
      </div>
    </div>
  );
}

function CanonicalKeyDiffPanel({
  leftText,
  rightText,
  onChangeLeft,
  onChangeRight,
  onRun,
  loading,
  error,
  result
}: {
  leftText: string;
  rightText: string;
  onChangeLeft: (value: string) => void;
  onChangeRight: (value: string) => void;
  onRun: () => void;
  loading: boolean;
  error: string | null;
  result: CanonicalKeyDiffResult | null;
}) {
  return (
    <div className="result-block report-card" data-testid="canonical-diff-card">
      <div className="report-card-header">
        <h3>Canonical Key Diff</h3>
        <span className="muted">추천 기능이 아닌 차이 설명 도구</span>
      </div>
      <div className="canonical-diff-grid">
        <label>
          Left spot JSON
          <textarea
            className="compact-textarea"
            value={leftText}
            onChange={(event) => onChangeLeft(event.target.value)}
            spellCheck={false}
            aria-label="canonical diff 왼쪽 JSON"
          />
        </label>
        <label>
          Right spot JSON
          <textarea
            className="compact-textarea"
            value={rightText}
            onChange={(event) => onChangeRight(event.target.value)}
            spellCheck={false}
            aria-label="canonical diff 오른쪽 JSON"
          />
        </label>
      </div>
      <div className="import-actions">
        <button className="preset-action" data-testid="canonical-diff-run-button" type="button" onClick={onRun} disabled={loading}>
          {loading ? <Loader2 className="spin" size={14} /> : <Search size={14} />}
          비교 실행
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {!error && !result ? <p className="muted">비교 결과 없음</p> : null}
      {result ? (
        <>
          <div className="detail-grid">
            <ResultDetailItem label="same canonical key" value={result.sameCanonicalKey ? "같음" : "다름"} />
            <ResultDetailItem label="difference count" value={formatCount(result.differences.length)} />
          </div>
          <div className="result-block">
            <h3>Canonical Keys</h3>
            <p>
              <strong>left</strong>
            </p>
            <code>{result.leftCanonicalKey}</code>
            <p>
              <strong>right</strong>
            </p>
            <code>{result.rightCanonicalKey}</code>
          </div>
          <div className="info-grid">
            <div className="info-list">
              <h3>필드 차이</h3>
              {result.differences.length === 0 ? (
                <p className="muted">없음</p>
              ) : (
                result.differences.map((difference, index) => (
                  <p key={`${difference.field}:${index}`}>
                    {difference.field}: {readUnknownValue(difference.left)} → {readUnknownValue(difference.right)} ({difference.severity})
                  </p>
                ))
              )}
            </div>
            <div className="info-list">
              <h3>한국어 설명</h3>
              {result.explanation.length === 0 ? (
                <p className="muted">제공되지 않음</p>
              ) : (
                result.explanation.map((item, index) => <p key={`${item}:${index}`}>{item}</p>)
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReportCard({
  testId,
  title,
  badge,
  generatedAt,
  children
}: {
  testId: string;
  title: string;
  badge: ReportBadge;
  generatedAt: string | null;
  children: ReactNode;
}) {
  return (
    <div className="result-block report-card" data-testid={testId}>
      <div className="report-card-header">
        <h3>{title}</h3>
        <span className={`report-status-badge ${badge.tone}`} data-testid={`report-status-${testId}`}>
          {badge.label}
        </span>
      </div>
      <p className="muted">생성 시각: {generatedAt ? new Date(generatedAt).toLocaleString("ko-KR") : "제공되지 않음"}</p>
      {children}
    </div>
  );
}

function ReportImportDetails({ summary }: { summary: ImportReportSummary }) {
  return (
    <div className="info-grid">
      <div className="info-list">
        <h3>Skipped files</h3>
        {summary.skippedDetails.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          summary.skippedDetails.map((item) => (
            <p key={`${item.fileName}:${item.reason}`}>
              {item.fileName}: {item.reason}
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>Discarded hrcz</h3>
        {summary.discardedHrczList.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          summary.discardedHrczList.map((name) => <p key={name}>{name}</p>)
        )}
      </div>
      <div className="info-list">
        <h3>Warnings</h3>
        {summary.warnings.length === 0 ? (
          <p className="muted">없음</p>
        ) : (
          summary.warnings.map((warning) => <p key={warning}>{warning}</p>)
        )}
      </div>
      <div className="info-list">
        <h3>실패 상태</h3>
        <p>{formatFailedRecords(summary.failedRecords)}</p>
      </div>
    </div>
  );
}

function VerificationDetailSection({ summary }: { summary: VerificationReportSummary }) {
  const exactFailures = summary.exactLookup.failures ?? [];
  const randomFailures = summary.randomLookup.failures ?? [];
  const duplicateDetails = summary.duplicateCanonicalKeyDetails ?? [];
  const nearFalsePositives = summary.nearMatchFalsePositives ?? [];

  return (
    <div className="info-grid">
      <div className="info-list">
        <h3>Exact lookup 실패 목록</h3>
        {exactFailures.length === 0 ? (
          <p className="muted">문제 없음</p>
        ) : (
          exactFailures.map((failure, index) => (
            <p key={`exact-failure-${index}`}>
              {failure.id ? `id ${failure.id}: ` : ""}
              {failure.reason}
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>Random lookup 실패 목록</h3>
        {randomFailures.length === 0 ? (
          <p className="muted">문제 없음</p>
        ) : (
          randomFailures.map((failure, index) => (
            <p key={`random-failure-${index}`}>
              {failure.id ? `id ${failure.id}: ` : ""}
              {failure.reason}
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>Duplicate canonical key</h3>
        {(summary.duplicateCanonicalKeyCount ?? 0) === 0 ? (
          <p className="muted">문제 없음</p>
        ) : duplicateDetails.length === 0 ? (
          <p>count: {formatCount(summary.duplicateCanonicalKeyCount)} / 상세: 제공되지 않음</p>
        ) : (
          duplicateDetails.map((item, index) => (
            <p key={`duplicate-key-${index}`}>
              {item.canonicalKey.slice(0, 80)}... (count: {formatCount(item.count)})
            </p>
          ))
        )}
      </div>
      <div className="info-list">
        <h3>Near-match HRC false positive</h3>
        {(summary.nearMatchFalsePositiveCount ?? 0) === 0 ? (
          <p className="muted">문제 없음</p>
        ) : nearFalsePositives.length === 0 ? (
          <p>count: {formatCount(summary.nearMatchFalsePositiveCount)} / 상세: 제공되지 않음</p>
        ) : (
          nearFalsePositives.map((item, index) => (
            <p key={`near-fp-${index}`}>
              id {item.id ?? "제공되지 않음"} / mutation {item.mutation ?? "제공되지 않음"} / source {item.source ?? "제공되지 않음"}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function DatabaseView({
  onGoImport,
  onFillAnalyze
}: {
  onGoImport: () => void;
  onFillAnalyze: (spot: unknown, context: AnalyzeHandoffContext) => void;
}) {
  const [imports, setImports] = useState<ImportResponse["import"][]>([]);
  const [solutions, setSolutions] = useState<SolutionListItem[]>([]);
  const [filters, setFilters] = useState<DatabaseFilters>(defaultDatabaseFilters);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSolutionId, setSelectedSolutionId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [importRows, solutionRows] = await Promise.all([listImports(), listSolutions("", 500)]);
      setImports(importRows);
      setSolutions(solutionRows);
    } catch (caught) {
      setError(toUserFacingApiError(caught, "database 조회에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const catalog = useMemo(() => solutions.map((solution) => buildCatalogItem(solution)), [solutions]);
  const filteredCatalog = useMemo(() => filterCatalog(catalog, filters), [catalog, filters]);

  const heroPositionOptions = useMemo(
    () => uniqueSorted(catalog.map((item) => item.heroPosition).filter((item) => item.length > 0)),
    [catalog]
  );
  const tableSizeOptions = useMemo(
    () =>
      uniqueSorted(
        catalog
          .map((item) => (typeof item.tableSize === "number" ? String(item.tableSize) : ""))
          .filter((item) => item.length > 0)
      ),
    [catalog]
  );
  const treeConfigOptions = useMemo(
    () => uniqueSorted(catalog.map((item) => item.treeConfig).filter((item) => item.length > 0)),
    [catalog]
  );

  useEffect(() => {
    if (filteredCatalog.length === 0) {
      setSelectedSolutionId(null);
      return;
    }
    if (!selectedSolutionId || !filteredCatalog.some((item) => item.row.id === selectedSolutionId)) {
      setSelectedSolutionId(filteredCatalog[0]?.row.id ?? null);
    }
  }, [filteredCatalog, selectedSolutionId]);

  const selected = filteredCatalog.find((item) => item.row.id === selectedSolutionId) ?? null;

  function resetFilters() {
    setFilters(defaultDatabaseFilters);
  }

  return (
    <section className="database-grid">
      <div className="panel stack">
        <div className="panel-title">
          <Database size={18} />
          <h2>Solutions</h2>
          <button className="icon-button" onClick={refresh} type="button" title="새로고침" aria-label="Database 목록 새로고침">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="panel-title">
          <h3>Imports</h3>
        </div>
        {imports.map((item) => (
          <div className="list-row" key={item.id}>
            <strong>{item.name}</strong>
            {item.databaseFeatures && <FeatureChips features={item.databaseFeatures} compact />}
            <span>{item.rowCount} rows</span>
            <span>{new Date(item.createdAt).toLocaleString("ko-KR")}</span>
          </div>
        ))}
        {imports.length === 0 && <p className="muted">저장된 import가 없습니다.</p>}

        <div className="form-grid">
          <label>
            Hero 포지션
            <select
              value={filters.heroPosition}
              onChange={(event) => setFilters((prev) => ({ ...prev, heroPosition: event.target.value }))}
              aria-label="Database Hero 포지션 필터"
            >
              <option value="">전체</option>
              {heroPositionOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            테이블 인원
            <select
              value={filters.tableSize}
              onChange={(event) => setFilters((prev) => ({ ...prev, tableSize: event.target.value }))}
              aria-label="Database 테이블 인원 필터"
            >
              <option value="">전체</option>
              {tableSizeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            트리 설정
            <select
              value={filters.treeConfig}
              onChange={(event) => setFilters((prev) => ({ ...prev, treeConfig: event.target.value }))}
              aria-label="Database 트리 설정 필터"
            >
              <option value="">전체</option>
              {treeConfigOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hero stack 최소 (BB)
            <input
              type="number"
              step={0.1}
              value={filters.stackMin}
              onChange={(event) => setFilters((prev) => ({ ...prev, stackMin: event.target.value }))}
            />
          </label>
          <label>
            Hero stack 최대 (BB)
            <input
              type="number"
              step={0.1}
              value={filters.stackMax}
              onChange={(event) => setFilters((prev) => ({ ...prev, stackMax: event.target.value }))}
            />
          </label>
          <label>
            Source file 검색
            <input value={filters.sourceFile} onChange={(event) => setFilters((prev) => ({ ...prev, sourceFile: event.target.value }))} />
          </label>
          <label>
            Canonical key 검색
            <input
              value={filters.canonicalKey}
              onChange={(event) => setFilters((prev) => ({ ...prev, canonicalKey: event.target.value }))}
              aria-label="Database canonical key 검색"
            />
          </label>
        </div>

        <div className="search-line">
          <button className="icon-button" onClick={resetFilters} type="button" title="필터 초기화" aria-label="Database 필터 초기화">
            <RefreshCw size={16} />
          </button>
          <span className="muted">결과 {filteredCatalog.length} / {catalog.length}</span>
        </div>

        {error && <p className="error-text">조회 실패: {error}</p>}
        {loading && <p className="muted">불러오는 중...</p>}

        {solutions.length === 0 && !loading ? (
          <div className="notice">
            <p>저장된 solution이 없습니다.</p>
            <p>Import 화면에서 HRC DB를 먼저 불러오세요.</p>
            <button className="primary-action" onClick={onGoImport} type="button">
              Import 화면으로 이동
            </button>
          </div>
        ) : null}

        {solutions.length > 0 && filteredCatalog.length === 0 ? <p className="muted">조건에 맞는 solution이 없습니다.</p> : null}

        {filteredCatalog.map((item) => (
          <button
            key={item.row.id}
            className={`solution-card ${item.row.id === selectedSolutionId ? "selected" : ""}`}
            onClick={() => setSelectedSolutionId(item.row.id)}
            type="button"
          >
            <div>
              <strong>{item.heroPosition || "제공되지 않음"}</strong>
              <span>{item.tableSize ? `${item.tableSize} players` : "table size 제공되지 않음"}</span>
              <span>Hero {formatBb(item.heroStackBb)} / Eff {formatBb(item.effectiveStackBb)}</span>
              <span>Tree {item.treeConfig || "제공되지 않음"}</span>
            </div>
            <div>
              <span>Strategy {item.strategyCount ?? "제공되지 않음"}</span>
              <span>{item.sourceFile || "source file 제공되지 않음"}</span>
              <span>{new Date(item.row.importedAt).toLocaleString("ko-KR")}</span>
              <code>{item.canonicalKey.slice(0, 88)}</code>
            </div>
          </button>
        ))}
      </div>

      <div className="panel stack">
        <div className="panel-title">
          <Search size={18} />
          <h2>Detail</h2>
        </div>
        {!selected ? (
          <p className="muted">왼쪽에서 solution을 선택해 주세요.</p>
        ) : (
          <>
            <div className="result-block">
              <h3>Canonical Key</h3>
              <code>{selected.canonicalKey}</code>
              <button
                className="preset-action"
                type="button"
                onClick={() => onFillAnalyze(selected.row.spot, buildDatabaseAnalyzeHandoffContext(selected))}
                data-testid="db-fill-analyze-button"
              >
                <Download size={14} />
                이 spot으로 Analyze 채우기
              </button>
            </div>

            <div className="detail-grid">
              <ResultDetailItem label="Hero position" value={selected.heroPosition || "제공되지 않음"} />
              <ResultDetailItem label="Table size" value={selected.tableSize ? String(selected.tableSize) : "제공되지 않음"} />
              <ResultDetailItem label="Hero stack (BB)" value={formatBb(selected.heroStackBb)} />
              <ResultDetailItem label="Effective stack (BB)" value={formatBb(selected.effectiveStackBb)} />
              <ResultDetailItem label="Tree config" value={selected.treeConfig || "제공되지 않음"} />
              <ResultDetailItem label="Strategy entries" value={String(selected.strategyCount ?? "제공되지 않음")} />
              <ResultDetailItem label="Source file" value={selected.sourceFile || "제공되지 않음"} />
              <ResultDetailItem label="ImportedAt" value={new Date(selected.row.importedAt).toLocaleString("ko-KR")} />
            </div>

            {selected.row.databaseFeatures && <FeatureChips features={selected.row.databaseFeatures} />}

            <DatabaseActionSizingSummaryBlock row={selected.row} />

            <div className="result-block">
              <h3>Spot JSON 요약</h3>
              <pre className="spot-json-preview">{JSON.stringify(toSpotSummary(selected.row.spot), null, 2)}</pre>
            </div>

            <div className="result-block">
              <h3>Source metadata</h3>
              <p>sourceLabel: {selected.row.sourceLabel || "제공되지 않음"}</p>
              <p>externalId: {selected.row.externalId || "제공되지 않음"}</p>
              <p>fileHash: {selected.row.fileHash || "제공되지 않음"}</p>
            </div>

            {selected.row.strategy ? (
              <div className="matrix-wrap">
                <div className="matrix-summary">
                  <span>Strategy Matrix</span>
                  <span>{selected.strategyCount ?? 0} entries</span>
                </div>
                <StrategyMatrixPreview strategy={selected.row.strategy} />
              </div>
            ) : (
              <p className="muted">strategy 정보가 제공되지 않음</p>
            )}

            <DatabaseMultiActionPreviewBlock row={selected.row} />

            <DatabaseBrowserV2Block row={selected.row} />
          </>
        )}
      </div>
    </section>
  );
}

function DatabaseActionSizingSummaryBlock({ row }: { row: SolutionListItem }) {
  const summary = useMemo(() => buildDatabaseActionSizingSummary(row), [row]);
  const raiseSizeText = summary.detectedRaiseSizes.length > 0
    ? summary.detectedRaiseSizes.map((item) => item.sizeLabel).join(", ")
    : "제공되지 않음";
  const allInText = summary.detectedAllInActions.length > 0
    ? uniqueSorted(summary.detectedAllInActions.map((item) => item.action)).join(", ")
    : "제공되지 않음";

  return (
    <div className="result-block" data-testid="db-action-sizing-summary">
      <h3>액션/사이즈 요약 (Action / Sizing Summary)</h3>
      <div className="notice">
        <p>이 정보는 DB에 저장된 spot/action/tree metadata에서 감지한 값입니다.</p>
        <p>DB에 없는 size를 임의 생성하지 않습니다.</p>
        <p>UNKNOWN/UNSPECIFIED는 imported data에 명시적 size 정보가 부족하다는 뜻입니다.</p>
      </div>

      <div className="detail-grid">
        <ResultDetailItem label="actionPath" value={summary.actionPathText} />
        <ResultDetailItem label="treeConfig" value={summary.treeConfig ?? "제공되지 않음"} />
        <ResultDetailItem label="detected actions" value={summary.detectedActions.join(", ") || "제공되지 않음"} />
        <ResultDetailItem label="detected raise sizes" value={raiseSizeText} />
        <ResultDetailItem label="all-in / shove" value={allInText} />
        <ResultDetailItem label="candidate count" value={String(summary.candidates.length)} />
      </div>

      {summary.warnings.length > 0 ? (
        <div className="notice" data-testid="db-action-sizing-warning">
          {summary.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      {summary.candidates.length === 0 ? (
        <p className="muted">action/sizing 후보가 제공되지 않음</p>
      ) : (
        <div className="range-table" role="table" aria-label="Database action sizing 후보 표">
          <div className="range-row range-head action-sizing-row" role="row">
            <span>action</span>
            <span>sizeKind</span>
            <span>sizeLabel</span>
            <span>confidence</span>
            <span>sourceCount</span>
          </div>
          {summary.candidates.map((candidate) => (
            <div
              className="range-row action-sizing-row"
              role="row"
              key={`${candidate.action}-${candidate.sizeKind}-${candidate.sizeLabel}-${candidate.sizeBb ?? "none"}`}
            >
              <span>{candidate.action}</span>
              <span>{candidate.sizeKind}</span>
              <span>{candidate.sizeBb !== undefined ? `${candidate.sizeLabel} (${candidate.sizeBb}bb)` : candidate.sizeLabel}</span>
              <span>{candidate.confidence}</span>
              <span>{candidate.sourceCount}</span>
            </div>
          ))}
        </div>
      )}

      <div className="meta-list">
        <p>
          <strong>size signals</strong>: {summary.sizeSignals.length > 0
            ? summary.sizeSignals.map((signal) => `${signal.raw}/${signal.source}/${signal.confidence}`).join(" | ")
            : "제공되지 않음"}
        </p>
        <p>
          <strong>explicit size fields</strong>: {summary.explicitSizeFieldPaths.length > 0
            ? summary.explicitSizeFieldPaths.join(", ")
            : "제공되지 않음"}
        </p>
        <p className="muted">candidate label: {summary.candidates[0] ? formatActionSizingOption(summary.candidates[0]) : "제공되지 않음"}</p>
      </div>
    </div>
  );
}

function DatabaseMultiActionPreviewBlock({ row }: { row: SolutionListItem }) {
  const view = useMemo(() => buildMultiActionFromSolution(row), [row]);
  const previewHands = view?.hands.slice(0, 20) ?? [];

  return (
    <div className="result-block" data-testid="db-multi-action-preview">
      <h3>액션별 전략 미리보기 (Multi-action preview)</h3>
      <div className="notice">
        <p>v1.8은 DB schema migration 없이 저장된 v2 actions[] 또는 기존 strategy를 multi-action view로 보여줍니다.</p>
        <p>{view?.isReadOnlyLegacyAdapter ? "v1 legacy strategy를 actions[] view model로 변환해 표시합니다." : "v2 multi-action strategy의 원본 actions[] 데이터를 표시합니다."}</p>
        <p>향후 schema v2에서는 raise/call/fold/all-in 복수 action frequency와 EV를 저장할 예정입니다.</p>
        <p>현재 preview는 read-only 표시이며 새 solver 계산이 아닙니다.</p>
      </div>

      {!view ? (
        <p className="muted">multi-action preview를 만들 strategy 정보가 제공되지 않음</p>
      ) : (
        <>
          <div className="detail-grid">
            <ResultDetailItem label="source" value={view.source} />
            <ResultDetailItem label="actionKinds" value={view.actionKinds.join(", ") || "제공되지 않음"} />
            <ResultDetailItem label="preview hands" value={`${previewHands.length} / ${view.hands.length}`} />
            <ResultDetailItem label="strategy mode" value={view.strategyMode} />
          </div>

          <div className="range-table" role="table" aria-label="Database multi-action 미리보기 표">
            <div className="range-row range-head multi-action-row" role="row">
              <span>hand</span>
              <span>action</span>
              <span>size</span>
              <span>frequency</span>
              <span>EV</span>
              <span>ChipEV</span>
              <span>ICM EV</span>
              <span>warnings</span>
            </div>
            {previewHands.flatMap((hand) =>
              hand.actions.map((action, actionIndex) => (
                <div className="range-row multi-action-row" role="row" key={`${hand.hand}-${action.action}-${actionIndex}`}>
                  <span>{hand.hand}</span>
                  <span>{action.action}</span>
                  <span>{formatMultiActionSize(action.size)}</span>
                  <span>{formatActionFrequency(action.frequency)}</span>
                  <span>{action.evLabel || formatActionEv(action.ev)}</span>
                  <span>{formatActionEv(action.chipEv)}</span>
                  <span>{formatActionEv(action.icmEv)}</span>
                  <span>{formatMultiActionWarnings(action.warnings)}</span>
                </div>
              ))
            )}
          </div>

          {view.warnings.length > 0 ? (
            <div className="notice">
              {view.warnings.map((warning) => (
                <p key={warning}>{formatMultiActionWarning(warning)}</p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function DatabaseBrowserV2Block({ row }: { row: SolutionListItem }) {
  const [selectedActionKind, setSelectedActionKind] = useState("ALL");
  const [selectedSizeLabel, setSelectedSizeLabel] = useState("ALL");
  const [selectedEvMode, setSelectedEvMode] = useState<BrowserV2EvMode>("EV");
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const model = useMemo(() => {
    try {
      return buildBrowserV2Model(row.strategy);
    } catch {
      return null;
    }
  }, [row.strategy]);
  const filteredHands = useMemo(
    () => filterBrowserV2Hands(model?.hands ?? [], selectedActionKind, selectedSizeLabel),
    [model, selectedActionKind, selectedSizeLabel]
  );
  const previewHands = filteredHands.slice(0, 24);
  const detailHand = filteredHands.find((hand) => hand.hand.hand === selectedHand) ?? previewHands[0] ?? null;
  const actionKindOptions = model ? ["ALL", ...model.availableActionKinds] : ["ALL"];
  const sizeLabelOptions = model ? ["ALL", ...model.availableSizeLabels] : ["ALL"];
  const modeLabel = model?.strategyMode === "multi-action-v2"
    ? "v2 원본 actions[]"
    : model?.strategyMode === "legacy-adapter"
      ? "v1 legacy 변환"
      : model?.strategyMode === "mixed"
        ? "v2 + legacy 혼합"
        : "제공되지 않음";

  useEffect(() => {
    if (!previewHands.some((hand) => hand.hand.hand === selectedHand)) {
      setSelectedHand(previewHands[0]?.hand.hand ?? null);
    }
  }, [previewHands, selectedHand]);

  return (
    <div className="result-block" data-testid="db-browser-v2">
      <h3>Browser v2 · Action Frequency Matrix</h3>
      <div className="notice">
        <p>v2 strategy는 저장된 actions[]를 직접 표시합니다.</p>
        <p>v1 legacy strategy는 Browser v2 view model로 변환해 표시합니다.</p>
        <p>이 화면은 read-only 탐색용이며 solver 계산을 새로 수행하지 않습니다.</p>
        <p>필터는 DB에 존재하는 action/size만 기준으로 동작합니다.</p>
      </div>

      {!model ? (
        <p className="muted">Browser v2 view model을 생성할 수 없습니다.</p>
      ) : (
        <>
          <div className="browser-v2-controls" data-testid="db-browser-v2-controls">
            <label>
              Action kind filter
              <select aria-label="Browser v2 action kind 필터" value={selectedActionKind} onChange={(event) => setSelectedActionKind(event.target.value)}>
                {actionKindOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size filter
              <select aria-label="Browser v2 size 필터" value={selectedSizeLabel} onChange={(event) => setSelectedSizeLabel(event.target.value)}>
                {sizeLabelOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "ALL" : formatBrowserV2SizeFilterLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              EV display mode
              <select aria-label="Browser v2 EV 표시 방식" value={selectedEvMode} onChange={(event) => setSelectedEvMode(parseBrowserV2EvMode(event.target.value))}>
                <option value="EV">EV</option>
                <option value="CHIP_EV">ChipEV</option>
                <option value="ICM_EV">ICM EV</option>
              </select>
            </label>
          </div>

          <div className="detail-grid">
            <ResultDetailItem label="strategy mode" value={modeLabel} />
            <ResultDetailItem label="hands" value={String(model.handCount)} />
            <ResultDetailItem label="actions" value={String(model.totalActionCount)} />
            <ResultDetailItem label="mixed hands" value={String(model.mixedHandCount)} />
            <ResultDetailItem label="action kinds" value={model.availableActionKinds.join(", ") || "제공되지 않음"} />
            <ResultDetailItem label="size labels" value={model.availableSizeLabels.join(", ") || "제공되지 않음"} />
            <ResultDetailItem label="filtered hands" value={String(filteredHands.length)} />
            <ResultDetailItem label="EV display mode" value={browserV2EvModeLabel(selectedEvMode)} />
          </div>

          {previewHands.length === 0 ? (
            <p className="muted">현재 action/size filter에 맞는 Browser v2 hand/action 데이터가 제공되지 않음</p>
          ) : (
            <>
              <div className="browser-v2-matrix" aria-label="Browser v2 action frequency matrix">
                {previewHands.map((hand) => (
                  <button
                    aria-label={`Browser v2 hand ${hand.hand.hand}`}
                    className={`browser-v2-cell ${hand.actions.length > 1 ? "mixed" : ""} ${detailHand?.hand.hand === hand.hand.hand ? "selected" : ""}`}
                    key={hand.hand.hand}
                    onClick={() => setSelectedHand(hand.hand.hand)}
                    type="button"
                  >
                    <strong>{hand.hand.hand}</strong>
                    <span>{formatBrowserV2HandLine(hand.actions, selectedEvMode)}</span>
                    <small>{hand.actions.length > 1 ? "mixed" : getBrowserV2PrimaryAction(hand.actions)?.actionLabel ?? "UNKNOWN"}</small>
                  </button>
                ))}
              </div>

              <div className="browser-v2-detail" data-testid="db-browser-v2-hand-detail">
                <h4>Hand detail preview</h4>
                {detailHand ? (
                  <>
                    <div className="detail-grid">
                      <ResultDetailItem label="hand" value={detailHand.hand.hand} />
                      <ResultDetailItem label="primary action" value={getBrowserV2PrimaryAction(detailHand.actions)?.actionLabel ?? "UNKNOWN"} />
                      <ResultDetailItem label="primary frequency" value={formatActionFrequency(getBrowserV2PrimaryAction(detailHand.actions)?.frequency ?? null)} />
                      <ResultDetailItem label="selected EV mode" value={browserV2EvModeLabel(selectedEvMode)} />
                    </div>
                    <div className="range-table" role="table" aria-label="Browser v2 hand 상세 표">
                      <div className="range-row range-head browser-v2-row" role="row">
                        <span>action</span>
                        <span>size</span>
                        <span>frequency</span>
                        <span>selected EV</span>
                        <span>ChipEV</span>
                        <span>ICM EV</span>
                        <span>warnings</span>
                      </div>
                      {detailHand.actions.map((action, actionIndex) => (
                        <div className="range-row browser-v2-row" role="row" key={`${detailHand.hand.hand}-${action.action}-${actionIndex}`}>
                          <span>{action.actionLabel}</span>
                          <span>{formatBrowserV2ActionSizeLabel(action)}</span>
                          <span>{formatActionFrequency(action.frequency)}</span>
                          <span>{formatBrowserV2SelectedEv(action, selectedEvMode)}</span>
                          <span>{formatActionEv(action.chipEv)}</span>
                          <span>{formatActionEv(action.icmEv)}</span>
                          <span>{formatBrowserV2Warnings(action.warnings)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">Hand detail이 제공되지 않음</p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

interface FilteredBrowserV2Hand {
  hand: BrowserV2HandCell;
  actions: BrowserV2ActionView[];
}

function filterBrowserV2Hands(hands: BrowserV2HandCell[], actionKind: string, sizeLabel: string): FilteredBrowserV2Hand[] {
  return hands
    .map((hand) => ({
      hand,
      actions: hand.actions.filter((action) =>
        (actionKind === "ALL" || action.action === actionKind) &&
        (sizeLabel === "ALL" || action.sizeGroupLabel === sizeLabel)
      )
    }))
    .filter((hand) => hand.actions.length > 0);
}

function formatBrowserV2HandLine(actions: BrowserV2ActionView[], evMode: BrowserV2EvMode): string {
  if (actions.length === 0) {
    return "제공되지 않음";
  }
  return actions
    .map((action) => `${action.actionLabel} ${formatActionFrequency(action.frequency)} · ${browserV2EvModeLabel(evMode)} ${formatBrowserV2SelectedEv(action, evMode)}`)
    .join(" / ");
}

function formatBrowserV2FilteredFrequency(actions: BrowserV2ActionView[]): string {
  const frequencies = actions
    .map((action) => action.frequency)
    .filter((frequency): frequency is number => typeof frequency === "number" && Number.isFinite(frequency));
  if (frequencies.length === 0) {
    return "제공되지 않음";
  }
  return formatActionFrequency(frequencies.reduce((sum, frequency) => sum + frequency, 0));
}

function getBrowserV2PrimaryAction(actions: BrowserV2ActionView[]): BrowserV2ActionView | null {
  if (actions.length === 0) {
    return null;
  }
  return [...actions].sort((left, right) => (right.frequency ?? -1) - (left.frequency ?? -1))[0] ?? null;
}

function formatBrowserV2SelectedEv(action: BrowserV2ActionView, evMode: BrowserV2EvMode): string {
  if (evMode === "CHIP_EV") {
    return formatActionEv(action.chipEv);
  }
  if (evMode === "ICM_EV") {
    return formatActionEv(action.icmEv);
  }
  return formatActionEv(action.ev);
}

function browserV2EvModeLabel(evMode: BrowserV2EvMode): string {
  if (evMode === "CHIP_EV") {
    return "ChipEV";
  }
  if (evMode === "ICM_EV") {
    return "ICM EV";
  }
  return "EV";
}

function parseBrowserV2EvMode(value: string): BrowserV2EvMode {
  if (value === "CHIP_EV") {
    return "CHIP_EV";
  }
  if (value === "ICM_EV") {
    return "ICM_EV";
  }
  return "EV";
}

function formatBrowserV2SizeFilterLabel(sizeLabel: string): string {
  return sizeLabel === "unknown/unspecified" ? "사이즈 미지정" : sizeLabel;
}

function formatBrowserV2ActionSizeLabel(action: BrowserV2ActionView): string {
  return action.sizeGroupLabel === "unknown/unspecified" ? "사이즈 미지정" : action.sizeLabel;
}

function formatBrowserV2Warnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "없음";
  }
  return warnings.map(formatMultiActionWarning).join(" | ");
}

function summarizeBrowserMetadataWarnings(model: BrowserV2Model | null): {
  missingEvCount: number;
  missingSizeCount: number;
  unknownActionCount: number;
} {
  const actions = model?.hands.flatMap((hand) => hand.actions) ?? [];
  return {
    missingEvCount: actions.filter((action) => action.missingEv).length,
    missingSizeCount: actions.filter((action) => action.missingSize).length,
    unknownActionCount: actions.filter((action) => action.unknownAction).length
  };
}

function formatBrowserSchemaNotice(schemaLabel: string): string {
  if (schemaLabel.includes("multi-action-v2")) {
    return "v2 actions[] 원본 데이터를 표시합니다.";
  }
  if (schemaLabel.includes("legacy")) {
    return "v1 legacy strategy를 Browser v2 model로 변환해 표시합니다.";
  }
  if (!schemaLabel || schemaLabel === "제공되지 않음" || schemaLabel.includes("unknown")) {
    return "schema 정보 제공되지 않음";
  }
  return schemaLabel;
}

function formatBrowserImportedAt(value: string): string {
  if (!value) {
    return "제공되지 않음";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ko-KR");
}

function formatMultiActionSize(size: Parameters<typeof formatActionSize>[0]): string {
  const formatted = formatActionSize(size);
  return formatted === "제공되지 않음" ? "사이즈 미지정 / DB 원본에 명시 필요" : formatted;
}

function formatMultiActionWarnings(warnings: string[]): string {
  if (warnings.length === 0) {
    return "없음";
  }
  return warnings.map(formatMultiActionWarning).join(" | ");
}

function formatMultiActionWarning(warning: string): string {
  if (warning.toLowerCase().includes("size")) {
    return "사이즈 미지정 / DB 원본에 명시 필요";
  }
  return warning;
}

function StrategyMatrixPreview({ strategy }: { strategy: StrategyMatrix }) {
  return (
    <div className="hand-matrix">
      {HAND_KEYS.map((hand) => {
        const entry = strategy[hand];
        const action = entry?.action ?? "FOLD";
        const frequency = entry?.frequency ?? 0;
        return (
          <button
            key={hand}
            className={`hand-cell ${action.toLowerCase()}`}
            title={`${hand} ${action} ${(frequency * 100).toFixed(0)}%`}
            type="button"
          >
            <strong>{hand}</strong>
            <span>{Math.round(frequency * 100)}</span>
          </button>
        );
      })}
    </div>
  );
}

function FeatureChips({ features, compact = false }: { features: HrcDatabaseFeatures; compact?: boolean }) {
  const chips = [
    features.playerCount ? `${features.playerCount}P` : "players unknown",
    features.stackDepthBb ? `${features.stackDepthBb}BB` : "stack unknown",
    features.treeDepth ? `Depth ${features.treeDepth}` : "depth unknown",
    features.calculationModel,
    features.spotFamily,
    features.preflopOnly ? "PREFLOP_ONLY" : features.streetScope
  ];

  return (
    <div className={`feature-chips ${compact ? "compact" : ""}`}>
      {chips.map((chip) => (
        <span className={chip === "PREFLOP_ONLY" ? "danger" : ""} key={chip}>
          {chip}
        </span>
      ))}
      {features.actionTags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
      {features.warnings.map((warning) => (
        <strong key={warning}>{warning}</strong>
      ))}
    </div>
  );
}

function isHrcDatabaseFeatures(value: unknown): value is HrcDatabaseFeatures {
  return Boolean(value && typeof value === "object" && "fileName" in value && "preflopOnly" in value);
}

function normalizeHeroSeat(state: AnalyzeFormState, heroSeatInput: number): AnalyzeFormState {
  const heroSeat = clamp(heroSeatInput, 1, state.tableSize);
  const players = state.players.map((player) => ({ ...player, isHero: player.seat === heroSeat }));
  const heroPosition = players.find((player) => player.seat === heroSeat)?.position ?? state.heroPosition;
  return { ...state, heroSeat, heroPosition, players };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function formatSensitivityScenario(value: VillainRangeSensitivityRank | null): string {
  if (!value) {
    return "제공되지 않음";
  }
  const pct = value.callRangePct === null ? "제공되지 않음" : `${value.callRangePct.toFixed(1)}%`;
  return `${value.presetName} (difference ${value.difference.toFixed(4)}, call ${pct})`;
}

function formatSensitivityPercent(value: number | null): string {
  if (value === null) {
    return "제공되지 않음";
  }
  return `${value.toFixed(1)}%`;
}

function formatSensitivityMetric(value: string): string {
  return formatNotProvidedLabel(value);
}

function formatSensitivityLabel(value: VillainRangeSensitivityLabel): string {
  if (value === "shove_advantage") {
    return "shove 우세";
  }
  if (value === "fold_advantage") {
    return "fold 우세";
  }
  if (value === "neutral") {
    return "중립";
  }
  return "제공되지 않음";
}

function formatNotProvidedLabel(value: string): string {
  return value === "not_provided" ? "제공되지 않음" : value;
}

function formatOptionalNumber(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return value.toFixed(4);
}

function formatRecommendation(value: string | undefined): string {
  if (!value) {
    return "제공되지 않음";
  }
  return value;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readUnknownValue(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "제공되지 않음";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "제공되지 않음";
  }
}

function parseCanonicalDiffText(raw: string, side: "left" | "right"): SpotInput | CanonicalDiffInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${side} JSON 파싱 실패: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const record = toRecord(parsed);
  if (!record) {
    throw new Error(`${side} 입력은 JSON 객체여야 합니다.`);
  }
  if ("spot" in record) {
    const spotRecord = toRecord(record.spot);
    if (!spotRecord) {
      throw new Error(`${side}.spot은 객체여야 합니다.`);
    }
    return {
      spot: record.spot as SpotInput,
      ...(typeof record.treeConfig === "string" ? { treeConfig: record.treeConfig } : {})
    };
  }
  return parsed as SpotInput;
}

function buildCatalogItem(solution: SolutionListItem): SolutionCatalogItem {
  const spot = solution.spot;
  const heroStackBb = findHeroStack(spot);
  const effectiveStackBb = findEffectiveStack(spot);
  const treeConfig = deriveTreeConfig(solution);
  const strategyCount = solution.strategy ? Object.keys(solution.strategy).length : null;
  const remainingPlayers = countRemainingPlayers(spot);
  const actionTree = classifyActionTreeSpot({
    source: solution.sourceLabel,
    heroPosition: spot.heroPosition,
    tableSize: spot.tableSize,
    ...(remainingPlayers !== null ? { remainingPlayers } : {}),
    ...(heroStackBb !== null ? { heroStackBb } : {}),
    actionPath: spot.actionPath,
    treeConfig,
    ...(solution.fileName ? { sourceFile: solution.fileName } : {}),
    canonicalKey: solution.canonicalKey,
    sourceMetadata: {
      databaseFeatures: solution.databaseFeatures,
      fileName: solution.fileName,
      fileHash: solution.fileHash,
      externalId: solution.externalId
    },
    strategy: solution.strategy
  });
  return {
    row: solution,
    heroPosition: spot.heroPosition ?? "",
    tableSize: typeof spot.tableSize === "number" ? spot.tableSize : null,
    heroStackBb,
    effectiveStackBb,
    treeConfig,
    strategyCount,
    sourceFile: solution.fileName ?? "",
    canonicalKey: solution.canonicalKey,
    actionTree
  };
}

function buildDatabaseAnalyzeHandoffContext(item: SolutionCatalogItem): AnalyzeHandoffContext {
  const tableLabel = item.tableSize === null ? "인원 미상" : `${item.tableSize}명`;
  const heroLabel = item.heroPosition || "Hero 포지션 미상";
  const treeLabel = item.treeConfig || "트리 설정 미상";
  return {
    origin: "database",
    label: `${heroLabel} · ${tableLabel} · ${treeLabel}`,
    canonicalKey: item.canonicalKey,
    heroPosition: item.heroPosition,
    tableSize: item.tableSize,
    treeConfig: item.treeConfig
  };
}

function isSpotInputCandidate(value: unknown): value is SpotInput {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function countRemainingPlayers(spot: SpotInput): number | null {
  const inHandCount = spot.players.filter((player) => player.inHand).length;
  if (inHandCount > 0) {
    return inHandCount;
  }
  return spot.players.length > 0 ? spot.players.length : null;
}

function formatBrowserActionPath(actionPath: string[]): string {
  return actionPath.length > 0 ? actionPath.join(" > ") : "제공되지 않음";
}

function shortCanonicalKey(canonicalKey: string): string {
  if (!canonicalKey) {
    return "제공되지 않음";
  }
  return canonicalKey.length > 56 ? `${canonicalKey.slice(0, 56)}...` : canonicalKey;
}

function describeSolutionStrategySchema(solution: SolutionListItem, modelMode: string | null): string {
  if (modelMode) {
    return formatBrowserStrategyMode(modelMode);
  }
  const strategy = toRecord(solution.strategy);
  if (!strategy) {
    return "제공되지 않음";
  }
  const entries = Object.values(strategy);
  if (entries.length === 0) {
    return "empty";
  }
  const hasMultiActionV2 = entries.some((entry) => {
    const record = toRecord(entry);
    return Array.isArray(record?.actions);
  });
  const hasLegacy = entries.some((entry) => {
    const record = toRecord(entry);
    return typeof record?.action === "string";
  });
  if (hasMultiActionV2 && hasLegacy) {
    return "mixed";
  }
  if (hasMultiActionV2) {
    return "multi-action-v2";
  }
  if (hasLegacy) {
    return "legacy-v1";
  }
  return "unknown";
}

function formatBrowserStrategyMode(mode: string): string {
  if (mode === "multi-action-v2") {
    return "multi-action-v2 actions[]";
  }
  if (mode === "legacy-adapter") {
    return "legacy-v1 adapter";
  }
  if (mode === "mixed") {
    return "mixed v1/v2";
  }
  if (mode === "empty") {
    return "empty";
  }
  return mode;
}

function formatActionTreeSpotType(value: string): string {
  const labels: Record<ActionTreeSpotType, string> = {
    PUSH_FOLD: "Push/Fold",
    RFI: "RFI / Open Raise",
    LIMP: "Limp",
    FACING_OPEN: "Facing Open",
    FACING_LIMP: "Facing Limp",
    THREE_BET: "3bet",
    VS_THREE_BET: "vs 3bet",
    UNKNOWN: "Unknown"
  };
  return isActionTreeSpotType(value) ? labels[value] : value;
}

function formatActionTreeNode(value: string): string {
  const labels: Record<ActionTreeNode, string> = {
    OPEN_SHOVE: "Open shove",
    FIRST_IN: "First-in",
    OPEN_RAISE: "Open raise",
    OPEN_LIMP: "Open limp",
    VS_OPEN: "Vs open",
    VS_LIMP: "Vs limp",
    THREE_BET: "3bet",
    VS_THREE_BET: "Vs 3bet",
    UNKNOWN: "Unknown"
  };
  return isActionTreeNode(value) ? labels[value] : value;
}

function formatActionTreeList(values: Array<string | ActionTreeActionKind>, separator = " / "): string {
  return values.length > 0 ? values.join(separator) : "제공되지 않음";
}

function formatBrowserSpotTypeFilter(value: string): string {
  return value === "ALL" ? "ALL" : formatActionTreeSpotType(value);
}

function formatBrowserActionNodeFilter(value: string): string {
  return value === "ALL" ? "ALL" : formatActionTreeNode(value);
}

function buildBrowserNodeCandidateSummary(catalog: SolutionCatalogItem[]): BrowserNodeCandidateSummary {
  const availableActions = Array.from(new Set(catalog.flatMap((item) => item.actionTree.availableActions))).sort((a, b) =>
    a.localeCompare(b)
  );
  const availableSizes = uniqueSorted(catalog.flatMap((item) => item.actionTree.availableSizes));
  return {
    candidateCount: catalog.length,
    availableActions,
    availableSizes
  };
}

function isActionTreeSpotType(value: string): value is ActionTreeSpotType {
  return ["PUSH_FOLD", "RFI", "LIMP", "FACING_OPEN", "FACING_LIMP", "THREE_BET", "VS_THREE_BET", "UNKNOWN"].includes(value);
}

function isActionTreeNode(value: string): value is ActionTreeNode {
  return ["OPEN_SHOVE", "FIRST_IN", "OPEN_RAISE", "OPEN_LIMP", "VS_OPEN", "VS_LIMP", "THREE_BET", "VS_THREE_BET", "UNKNOWN"].includes(value);
}

function deriveTreeConfig(solution: SolutionListItem): string {
  const features = solution.databaseFeatures;
  if (features?.spotFamily) {
    return features.spotFamily;
  }
  if (Array.isArray(solution.spot.actionPath) && solution.spot.actionPath.length > 0) {
    return "open_shove_only";
  }
  return "제공되지 않음";
}

function findHeroStack(spot: SpotInput): number | null {
  const hero = spot.players.find((player) => player.seat === spot.heroSeat || player.isHero);
  if (!hero || typeof hero.stackBb !== "number" || !Number.isFinite(hero.stackBb)) {
    return null;
  }
  return hero.stackBb;
}

function findEffectiveStack(spot: SpotInput): number | null {
  const inHand = spot.players.filter((player) => player.inHand && typeof player.stackBb === "number" && Number.isFinite(player.stackBb));
  if (inHand.length === 0) {
    return null;
  }
  return inHand.reduce((min, player) => Math.min(min, player.stackBb), Number.POSITIVE_INFINITY);
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function filterCatalog(catalog: SolutionCatalogItem[], filters: DatabaseFilters): SolutionCatalogItem[] {
  const min = parseOptionalNumber(filters.stackMin);
  const max = parseOptionalNumber(filters.stackMax);
  return catalog.filter((item) => {
    if (filters.heroPosition && item.heroPosition !== filters.heroPosition) {
      return false;
    }
    if (filters.tableSize && String(item.tableSize ?? "") !== filters.tableSize) {
      return false;
    }
    if (filters.treeConfig && item.treeConfig !== filters.treeConfig) {
      return false;
    }
    if (filters.sourceFile && !item.sourceFile.toLowerCase().includes(filters.sourceFile.toLowerCase())) {
      return false;
    }
    if (filters.canonicalKey && !item.canonicalKey.toLowerCase().includes(filters.canonicalKey.toLowerCase())) {
      return false;
    }
    if (typeof min === "number" && (typeof item.heroStackBb !== "number" || item.heroStackBb < min)) {
      return false;
    }
    if (typeof max === "number" && (typeof item.heroStackBb !== "number" || item.heroStackBb > max)) {
      return false;
    }
    return true;
  });
}

function filterBrowserCatalogByActionTree(catalog: SolutionCatalogItem[], spotTypeFilter: string, actionNodeFilter: string): SolutionCatalogItem[] {
  return catalog.filter((item) => {
    if (spotTypeFilter !== "ALL" && item.actionTree.spotType !== spotTypeFilter) {
      return false;
    }
    if (actionNodeFilter !== "ALL" && item.actionTree.actionNode !== actionNodeFilter) {
      return false;
    }
    return true;
  });
}

function toSpotSummary(spot: SpotInput): Record<string, unknown> {
  return {
    gameType: spot.gameType,
    tournamentType: spot.tournamentType,
    decisionType: spot.decisionType,
    tableSize: spot.tableSize,
    heroSeat: spot.heroSeat,
    heroPosition: spot.heroPosition,
    blinds: spot.blinds,
    payouts: spot.payouts,
    actionPath: spot.actionPath,
    players: spot.players.map((player) => ({
      seat: player.seat,
      position: player.position,
      stackBb: player.stackBb,
      inHand: player.inHand
    }))
  };
}

function formatBb(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return `${value.toFixed(1)} BB`;
}

function formatCount(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return value.toLocaleString("ko-KR");
}

function formatFailedRecords(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  if (value === 0) {
    return "실패 없음";
  }
  return `${value.toLocaleString("ko-KR")} 건`;
}

function formatIssueRow(rowNumber: number | null): string {
  if (typeof rowNumber !== "number" || !Number.isFinite(rowNumber)) {
    return "[global]";
  }
  return `[row ${rowNumber}]`;
}

function formatRate(success: number | null, total: number | null, ratePct: number | null): string {
  if (
    typeof success !== "number" ||
    !Number.isFinite(success) ||
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return "제공되지 않음";
  }
  const rate = typeof ratePct === "number" && Number.isFinite(ratePct) ? ratePct.toFixed(2) : ((success / total) * 100).toFixed(2);
  return `${success}/${total} (${rate}%)`;
}

function formatSummaryPct(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return `${value.toFixed(2)}%`;
}

function missingReportMessage(status: LatestReportEnvelope<unknown>["status"] | undefined): string {
  if (status === "invalid") {
    return "리포트 파일을 읽을 수 없습니다.";
  }
  return "아직 import 검증 리포트가 없습니다.";
}

function formatReportStatus(status: LatestReportEnvelope<unknown>["status"] | null): string {
  if (status === "available") {
    return "정상";
  }
  if (status === "invalid") {
    return "실패 있음";
  }
  if (status === "missing") {
    return "리포트 없음";
  }
  return "제공되지 않음";
}

function labelForValidationStatus(status: ImportValidationSummary["status"] | null): string {
  if (status === "PASS") {
    return "정상";
  }
  if (status === "WARN") {
    return "주의 필요";
  }
  if (status === "FAIL") {
    return "실패 있음";
  }
  return "검증 리포트 없음";
}

function badgeToneForValidation(status: ImportValidationSummary["status"] | null): ReportBadgeTone {
  if (status === "PASS") {
    return "ok";
  }
  if (status === "WARN") {
    return "warn";
  }
  if (status === "FAIL") {
    return "fail";
  }
  return "missing";
}

function badgeForDbHealth(summary: DbHealthSummary | null): ReportBadge {
  if (!summary) {
    return { tone: "missing", label: "리포트 없음" };
  }
  if (
    summary.latestImportStatus === "invalid" ||
    summary.latestVerificationStatus === "invalid" ||
    summary.latestCanonicalKeyReportStatus === "invalid" ||
    (summary.failedRecordCount ?? 0) > 0 ||
    (summary.canonicalKey.collisionCount ?? 0) > 0 ||
    (summary.canonicalKey.invalidCount ?? 0) > 0
  ) {
    return { tone: "fail", label: "실패 있음" };
  }
  const exactIncomplete =
    typeof summary.exactLookup.success === "number" &&
    typeof summary.exactLookup.total === "number" &&
    summary.exactLookup.success < summary.exactLookup.total;
  const randomIncomplete =
    typeof summary.randomLookup.success === "number" &&
    typeof summary.randomLookup.total === "number" &&
    summary.randomLookup.success < summary.randomLookup.total;
  if (
    (summary.duplicateCanonicalKeyCount ?? 0) > 0 ||
    (summary.nearMatchFalsePositiveCount ?? 0) > 0 ||
    (summary.skippedFileCount ?? 0) > 0 ||
    (summary.discardedHrczCount ?? 0) > 0 ||
    (summary.canonicalKey.mismatchCount ?? 0) > 0 ||
    exactIncomplete ||
    randomIncomplete
  ) {
    return { tone: "warn", label: "주의 필요" };
  }
  return { tone: "ok", label: "정상" };
}

function badgeForImportReport(report: LatestReportEnvelope<ImportReportSummary> | null): ReportBadge {
  if (!report || report.status === "missing") {
    return { tone: "missing", label: "검증 리포트 없음" };
  }
  if (report.status === "invalid") {
    return { tone: "fail", label: "실패 있음" };
  }
  const summary = report.summary;
  if (!summary) {
    return { tone: "missing", label: "검증 리포트 없음" };
  }
  if ((summary.failedRecords ?? 0) > 0) {
    return { tone: "fail", label: "실패 있음" };
  }
  if (summary.warnings.length > 0 || (summary.skippedFiles ?? 0) > 0 || (summary.discardedHrczFiles ?? 0) > 0) {
    return { tone: "warn", label: "주의 필요" };
  }
  return { tone: "ok", label: "정상" };
}

function badgeForVerificationReport(report: LatestReportEnvelope<VerificationReportSummary> | null): ReportBadge {
  if (!report || report.status === "missing") {
    return { tone: "missing", label: "검증 리포트 없음" };
  }
  if (report.status === "invalid") {
    return { tone: "fail", label: "실패 있음" };
  }
  const summary = report.summary;
  if (!summary) {
    return { tone: "missing", label: "검증 리포트 없음" };
  }
  const exactIncomplete =
    typeof summary.exactLookup.success === "number" &&
    typeof summary.exactLookup.total === "number" &&
    summary.exactLookup.success < summary.exactLookup.total;
  const randomIncomplete =
    typeof summary.randomLookup.success === "number" &&
    typeof summary.randomLookup.total === "number" &&
    summary.randomLookup.success < summary.randomLookup.total;
  if (
    (summary.duplicateCanonicalKeyCount ?? 0) > 0 ||
    (summary.nearMatchFalsePositiveCount ?? 0) > 0 ||
    exactIncomplete ||
    randomIncomplete
  ) {
    return { tone: "warn", label: "주의 필요" };
  }
  return { tone: "ok", label: "정상" };
}

function badgeForCanonicalReport(report: LatestReportEnvelope<CanonicalKeyReportSummary> | null): ReportBadge {
  if (!report || report.status === "missing") {
    return { tone: "missing", label: "검증 리포트 없음" };
  }
  if (report.status === "invalid") {
    return { tone: "fail", label: "실패 있음" };
  }
  const summary = report.summary;
  if (!summary) {
    return { tone: "missing", label: "검증 리포트 없음" };
  }
  if ((summary.collisionCount ?? 0) > 0 || (summary.invalidCount ?? 0) > 0) {
    return { tone: "fail", label: "실패 있음" };
  }
  if ((summary.mismatchCount ?? 0) > 0) {
    return { tone: "warn", label: "주의 필요" };
  }
  return { tone: "ok", label: "정상" };
}


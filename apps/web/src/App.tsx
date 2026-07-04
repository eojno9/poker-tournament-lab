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
  buildTrainerProblemFromSolution,
  gradeTrainerAnswer,
  HAND_KEYS,
  RESULT_SOURCES,
  type CanonicalDiffInput,
  type CanonicalKeyDiffResult,
  type AnalyzeRequest,
  type AnalyzeResult,
  type HrcDatabaseFeatures,
  type HrcImportPayload,
  type SpotInput,
  type StrategyMatrix,
  type TrainerChoiceAction,
  type TrainerGradeResult,
  type TrainerProblem,
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
import {
  addTrainerMistakeHistory,
  addTrainerRecentHistory,
  clearTrainerMistakesHistory,
  clearTrainerRecentHistory,
  loadTrainerMistakesHistory,
  loadTrainerRecentHistory,
  type TrainerHistoryEntry
} from "./trainerHistory.js";
import {
  buildTrainerSourceSolutions,
  defaultTrainerProblemFilters,
  deriveTrainerTreeConfig,
  filterTrainerSolutions,
  normalizeTrainerHandInput,
  parseTrainerSeedInput,
  resolveTrainerSolutionIndex,
  type TrainerProblemFilters
} from "./trainerOptions.js";
import { buildTrainerSummary } from "./trainerSummary.js";
import { buildSensitivitySummaryFromAnalyzeResult } from "./sensitivityAdapter.js";
import { buildEvComparisonFromAnalyzeResult } from "./evComparisonAdapter.js";
import { buildRangePresetComparisonFromAnalyzeResult } from "./rangePresetComparisonAdapter.js";

type Tab = "analyze" | "import" | "database" | "trainer";
type AnalyzeMode = "form" | "json";
type PresetNoticeTone = "success" | "error";

interface PresetNotice {
  tone: PresetNoticeTone;
  text: string;
}

interface AnalyzePrefillPayload {
  id: string;
  spot: SpotInput;
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

  function moveToAnalyzeWithSpot(spot: SpotInput) {
    setAnalyzePrefill({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      spot
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
          <button className={activeTab === "trainer" ? "active" : ""} onClick={() => setActiveTab("trainer")} type="button" data-testid="trainer-tab">
            <GraduationCap size={16} /> Trainer
          </button>
          <button className={activeTab === "import" ? "active" : ""} onClick={() => setActiveTab("import")} type="button">
            <FileUp size={16} /> Import
          </button>
          <button className={activeTab === "database" ? "active" : ""} onClick={() => setActiveTab("database")} type="button">
            <Database size={16} /> Database
          </button>
        </nav>
      </header>

      {activeTab === "analyze" && <AnalyzeView prefill={analyzePrefill} onConsumePrefill={() => setAnalyzePrefill(null)} />}
      {activeTab === "trainer" && <TrainerView />}
      {activeTab === "import" && <ImportView />}
      {activeTab === "database" && (
        <DatabaseView onGoImport={() => setActiveTab("import")} onFillAnalyze={(spot) => moveToAnalyzeWithSpot(spot)} />
      )}
    </main>
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

  const formBuildResult = useMemo(() => buildAnalyzeRequestFromForm(formState), [formState]);
  const heroPositionOptions = positionsForTableSize(formState.tableSize);

  useEffect(() => {
    if (!prefill) {
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
    if (transformed.warnings.length > 0) {
      setFormNotice({
        tone: "error",
        text: `Database spot을 불러왔습니다. 일부 값을 확인해 주세요. (${transformed.warnings[0]})`
      });
    } else {
      setFormNotice({
        tone: "success",
        text: "Database spot을 Analyze 폼에 채웠습니다. Analyze 실행은 직접 눌러주세요."
      });
    }
    onConsumePrefill();
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
      setError(caught instanceof Error ? caught.message : "분석 요청에 실패했습니다.");
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

        <div className="tabs" aria-label="analyze input mode">
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

        {mode === "form" ? (
          <>
            <div className="editor-block">
              <h3>Analyze 프리셋</h3>
              <div className="preset-toolbar">
                <label>
                  프리셋 이름
                  <input
                    aria-label="preset name"
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

            <div className="form-grid">
              <label>
                Game type
                <input value="NLHE MTT (고정)" readOnly />
              </label>
              <label>
                Decision type
                <input value="Shove/Fold decision (고정)" readOnly />
              </label>
              <label>
                남은 인원 (2~10)
                <input
                  aria-label="remaining players"
                  type="number"
                  min={2}
                  max={10}
                  value={formState.tableSize}
                  onChange={(event) => setTableSize(Number(event.target.value))}
                />
              </label>
              <label>
                Hero seat
                <input
                  type="number"
                  min={1}
                  max={formState.tableSize}
                  value={formState.heroSeat}
                  onChange={(event) => setHeroSeat(Number(event.target.value))}
                />
              </label>
              <label>
                Hero position
                <select
                  value={formState.heroPosition}
                  onChange={(event) => setHeroPosition(event.target.value)}
                  aria-label="hero position"
                >
                  {heroPositionOptions.map((position) => (
                    <option key={position} value={position}>
                      {position}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tree config
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
                Small blind
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
                Big blind
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
                Fallback equity samples
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
              <h3>Players (stack BB / villain preset)</h3>
              <p className="muted">stack BB는 0보다 큰 숫자로 입력하세요. Hero가 아닌 자리에서 range preset/call %를 조정할 수 있습니다.</p>
              <div className="player-table">
                <span>Seat</span>
                <span>Pos</span>
                <span>Stack</span>
                <span>In</span>
                <span>Hero</span>
                <span>Range</span>
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

function TrainerView() {
  const [solutions, setSolutions] = useState<SolutionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TrainerProblemFilters>(defaultTrainerProblemFilters);
  const [handInput, setHandInput] = useState("");
  const [seedInput, setSeedInput] = useState("");
  const [problem, setProblem] = useState<TrainerProblem | null>(null);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [selectedAction, setSelectedAction] = useState<TrainerChoiceAction | null>(null);
  const [grade, setGrade] = useState<TrainerGradeResult | null>(null);
  const [trainerRecent, setTrainerRecent] = useState<TrainerHistoryEntry[]>(() => loadTrainerRecentHistory());
  const [trainerMistakes, setTrainerMistakes] = useState<TrainerHistoryEntry[]>(() => loadTrainerMistakesHistory());

  const trainerSourceSolutions = useMemo(() => buildTrainerSourceSolutions(solutions), [solutions]);
  const trainerCandidates = useMemo(() => filterTrainerSolutions(trainerSourceSolutions, filters), [trainerSourceSolutions, filters]);
  const heroPositionOptions = useMemo(
    () => uniqueSorted(trainerSourceSolutions.map((row) => row.spot.heroPosition).filter((value) => typeof value === "string" && value.length > 0)),
    [trainerSourceSolutions]
  );
  const tableSizeOptions = useMemo(
    () =>
      uniqueSorted(
        trainerSourceSolutions
          .map((row) => (typeof row.spot.tableSize === "number" ? String(row.spot.tableSize) : ""))
          .filter((value) => value.length > 0)
      ),
    [trainerSourceSolutions]
  );
  const treeConfigOptions = useMemo(
    () => uniqueSorted(trainerSourceSolutions.map((row) => deriveTrainerTreeConfig(row)).filter((value) => value.length > 0)),
    [trainerSourceSolutions]
  );

  async function refreshProblems() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listSolutions("", 500);
      setSolutions(rows);
      setCursor(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trainer 문제를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshProblems();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    buildProblemFromCursor(cursor, trainerCandidates);
  }, [cursor, trainerCandidates, handInput, seedInput, loading]);

  function buildProblemFromCursor(nextCursor: number, sourceRows = trainerCandidates) {
    if (sourceRows.length === 0) {
      setProblem(null);
      setProblemError("조건에 맞는 Trainer 문제가 없습니다.");
      setGrade(null);
      setSelectedAction(null);
      return;
    }

    const normalizedIndex = resolveTrainerSolutionIndex(nextCursor, sourceRows.length, seedInput);
    const selected = sourceRows[normalizedIndex]!;
    const hand = normalizeTrainerHandInput(handInput);
    const seed = parseTrainerSeedInput(seedInput);
    const generated = buildTrainerProblemFromSolution(
      {
        source: RESULT_SOURCES.HRC_PRECOMPUTED_DB,
        canonicalKey: selected.canonicalKey,
        sourceLabel: selected.sourceLabel,
        spot: selected.spot,
        strategy: selected.strategy,
        ...(selected.evSummary ? { evSummary: selected.evSummary } : {}),
        metadata: {
          treeConfig: deriveTreeConfig(selected),
          ...(selected.databaseFeatures ? { databaseFeatures: selected.databaseFeatures } : {})
        }
      },
      {
        ...(hand ? { hand } : {}),
        randomSeed: seed === undefined ? selected.id : `${String(seed)}:${selected.id}`
      }
    );

    if (!generated.ok) {
      setProblem(null);
      if (generated.error.code === "HAND_NOT_FOUND") {
        setProblemError(`입력한 hand(${hand})가 선택된 strategy에 없습니다.`);
      } else {
        setProblemError(`Trainer 문제 생성 실패: ${generated.error.message}`);
      }
      setCursor(nextCursor);
      setGrade(null);
      setSelectedAction(null);
      return;
    }

    setProblem(generated.problem);
    setProblemError(null);
    setCursor(nextCursor);
    setGrade(null);
    setSelectedAction(null);
  }

  function onAnswer(action: TrainerChoiceAction) {
    if (!problem) {
      return;
    }
    setSelectedAction(action);
    const graded = gradeTrainerAnswer(problem, action);
    setGrade(graded);

    const historyInput = {
      canonicalKey: problem.canonicalKey,
      hand: problem.hand,
      selectedAction: graded.selectedAction,
      correctAction: graded.correctAction,
      isCorrect: graded.isCorrect,
      frequency: graded.frequency,
      ev: graded.ev,
      evLabel: graded.evLabel,
      source: problem.source,
      spotSummary: problem.spotSummary
    };

    setTrainerRecent(addTrainerRecentHistory(historyInput));
    setTrainerMistakes(addTrainerMistakeHistory(historyInput));
  }

  function onNextProblem() {
    if (trainerCandidates.length === 0) {
      return;
    }
    setCursor((previous) => previous + 1);
  }

  function onClearTrainerRecent() {
    clearTrainerRecentHistory();
    setTrainerRecent([]);
  }

  function onClearTrainerMistakes() {
    clearTrainerMistakesHistory();
    setTrainerMistakes([]);
  }

  function resetTrainerFilters() {
    setFilters(defaultTrainerProblemFilters);
    setCursor(0);
  }

  const filterSummary = [
    filters.heroPosition ? `hero=${filters.heroPosition}` : null,
    filters.tableSize ? `table=${filters.tableSize}` : null,
    filters.treeConfig ? `tree=${filters.treeConfig}` : null,
    filters.sourceFile ? `file~${filters.sourceFile}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
  const handSummary = normalizeTrainerHandInput(handInput) ? `hand 고정: ${normalizeTrainerHandInput(handInput)}` : "hand 자동 선택(deterministic)";
  const trainerSummary = useMemo(
    () => buildTrainerSummary(trainerRecent, trainerMistakes, { recentWindowSize: 10, maxByHandRows: 5 }),
    [trainerRecent, trainerMistakes]
  );

  return (
    <section className="workspace-grid">
      <div className="panel stack">
        <div className="panel-title">
          <GraduationCap size={18} />
          <h2>Trainer</h2>
          <button className="icon-button" onClick={() => void refreshProblems()} type="button" title="문제 새로고침">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="notice">
          <p>오프테이블 학습용 문제입니다.</p>
          <p>Trainer 기본 문제는 HRC_PRECOMPUTED_DB만 사용하며 FALLBACK_ICM / NOT_SOLVED는 제외됩니다.</p>
        </div>

        <div className="editor-block" data-testid="trainer-filter-controls">
          <h3>문제 선택 옵션</h3>
          <div className="form-grid">
            <label>
              Hero position
              <select
                value={filters.heroPosition}
                onChange={(event) => setFilters((previous) => ({ ...previous, heroPosition: event.target.value }))}
                data-testid="trainer-filter-hero-position"
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
              Table size
              <select
                value={filters.tableSize}
                onChange={(event) => setFilters((previous) => ({ ...previous, tableSize: event.target.value }))}
                data-testid="trainer-filter-table-size"
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
              Tree config
              <select
                value={filters.treeConfig}
                onChange={(event) => setFilters((previous) => ({ ...previous, treeConfig: event.target.value }))}
                data-testid="trainer-filter-tree-config"
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
              Source file contains
              <input
                value={filters.sourceFile}
                onChange={(event) => setFilters((previous) => ({ ...previous, sourceFile: event.target.value }))}
                data-testid="trainer-filter-source-file"
              />
            </label>
            <label>
              Hand 입력 (예: AKo, K8s, 22)
              <input value={handInput} onChange={(event) => setHandInput(event.target.value)} data-testid="trainer-hand-input" />
            </label>
            <label>
              Seed
              <input value={seedInput} onChange={(event) => setSeedInput(event.target.value)} data-testid="trainer-seed-input" />
            </label>
          </div>
          <div className="search-line">
            <button className="preset-action" onClick={resetTrainerFilters} type="button" data-testid="trainer-filter-reset-button">
              <RefreshCw size={14} />
              필터 초기화
            </button>
          </div>
          <p className="muted" data-testid="trainer-filter-summary">필터: {filterSummary.length > 0 ? filterSummary : "전체"}</p>
          <p className="muted" data-testid="trainer-candidate-count">
            후보 문제 {trainerCandidates.length} / 전체 {trainerSourceSolutions.length}
          </p>
          <p className="muted">{handSummary}</p>
        </div>

        {error && <p className="error-text">{error}</p>}
        {loading && <p className="muted">Trainer 문제를 불러오는 중...</p>}

        {!loading && !problem && (
          <div className="notice not-solved-help">
            <p>{problemError ?? "Trainer 문제를 생성할 수 없습니다."}</p>
            <p>HRC import 데이터가 없거나 strategy 정보가 비어 있으면 Trainer 문제를 만들 수 없습니다.</p>
          </div>
        )}

        {problem && (
          <div className="result-block" data-testid="trainer-problem-card">
            <h3>문제 카드</h3>
            <div className="detail-grid">
              <ResultDetailItem label="Hero position" value={problem.spotSummary.heroPosition} />
              <ResultDetailItem label="Table size" value={String(problem.spotSummary.tableSize)} />
              <ResultDetailItem label="Hero stack (BB)" value={formatBb(problem.spotSummary.heroStackBb)} />
              <ResultDetailItem label="Tree config" value={problem.spotSummary.treeConfig ?? "제공되지 않음"} />
              <ResultDetailItem label="Hand" value={problem.hand} />
              <ResultDetailItem label="Source" value={problem.source} />
            </div>
            <p className="muted">action path: {problem.spotSummary.actionPath.join(", ")}</p>
            <code>{problem.canonicalKey.slice(0, 88)}...</code>

            <div className="trainer-actions">
              <button
                className={`primary-action ${selectedAction === "SHOVE" ? "selected-answer" : ""}`}
                type="button"
                onClick={() => onAnswer("SHOVE")}
                data-testid="trainer-shove-button"
              >
                SHOVE
              </button>
              <button
                className={`primary-action ${selectedAction === "FOLD" ? "selected-answer" : ""}`}
                type="button"
                onClick={() => onAnswer("FOLD")}
                data-testid="trainer-fold-button"
              >
                FOLD
              </button>
              <button className="preset-action" type="button" onClick={onNextProblem} data-testid="trainer-next-button">
                다음 문제
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="panel stack">
        <div className="panel-title">
          <BadgeCheck size={18} />
          <h2>결과</h2>
        </div>

        <div className="result-block" data-testid="trainer-summary-card">
          <h3>학습 요약</h3>
          <p className="muted">localStorage 기반 오프테이블 학습 기록입니다.</p>
          {trainerSummary.totalAttempts === 0 ? (
            <p className="muted">아직 Trainer 기록이 없습니다.</p>
          ) : (
            <>
              <div className="detail-grid">
                <ResultDetailItem label="전체 풀이 수" value={String(trainerSummary.totalAttempts)} />
                <ResultDetailItem label="정답 수" value={String(trainerSummary.correctCount)} />
                <ResultDetailItem label="오답 수" value={String(trainerSummary.incorrectCount)} />
                <ResultDetailItem label="전체 정답률" value={formatSummaryPct(trainerSummary.accuracyPct)} />
                <ResultDetailItem
                  label="최근 10문제 정답률"
                  value={
                    trainerSummary.recentWindowAttempts > 0
                      ? `${formatSummaryPct(trainerSummary.recentWindowAccuracyPct)} (${trainerSummary.recentWindowAttempts}문제)`
                      : "제공되지 않음"
                  }
                />
                <ResultDetailItem label="오답 노트 개수" value={String(trainerSummary.mistakeCount)} />
              </div>
              <p className="muted" data-testid="trainer-summary-total-attempts">totalAttempts: {trainerSummary.totalAttempts}</p>
              <p className="muted" data-testid="trainer-summary-accuracy">accuracy: {formatSummaryPct(trainerSummary.accuracyPct)}</p>

              <div className="meta-list">
                <p>
                  <strong>가장 최근 결과</strong>: {trainerSummary.latestResult
                    ? `${trainerSummary.latestResult.hand} / ${trainerSummary.latestResult.selectedAction} → ${trainerSummary.latestResult.correctAction} (${trainerSummary.latestResult.isCorrect ? "정답" : "오답"})`
                    : "제공되지 않음"}
                </p>
                <p>
                  <strong>가장 최근 오답</strong>: {trainerSummary.mostRecentMistake
                    ? `${trainerSummary.mostRecentMistake.hand} / ${trainerSummary.mostRecentMistake.selectedAction} → ${trainerSummary.mostRecentMistake.correctAction}`
                    : "오답 없음"}
                </p>
              </div>

              {trainerSummary.byHand.length > 0 ? (
                <div className="range-table" role="table" aria-label="trainer by hand summary">
                  <div className="range-row range-head" role="row">
                    <span>hand</span>
                    <span>attempts</span>
                    <span>correct</span>
                    <span>incorrect</span>
                    <span>accuracy</span>
                  </div>
                  {trainerSummary.byHand.map((row) => (
                    <div className="range-row" role="row" key={row.hand}>
                      <span>{row.hand}</span>
                      <span>{row.attempts}</span>
                      <span>{row.correctCount}</span>
                      <span>{row.incorrectCount}</span>
                      <span>{formatSummaryPct(row.accuracyPct)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        {!problem ? (
          <p className="muted">문제를 먼저 불러와 주세요.</p>
        ) : !grade ? (
          <p className="muted">SHOVE 또는 FOLD를 선택하면 결과가 표시됩니다.</p>
        ) : (
          <div className="result-block" data-testid="trainer-result-card">
            <h3>채점 결과</h3>
            <div className={`notice ${grade.isCorrect ? "success" : ""}`}>
              <p>{grade.isCorrect ? "정답입니다." : "오답입니다."}</p>
            </div>
            <div className="detail-grid">
              <ResultDetailItem label="선택한 action" value={grade.selectedAction} />
              <ResultDetailItem label="정답 action" value={grade.correctAction} />
              <ResultDetailItem label="frequency" value={grade.frequency.toFixed(3)} />
              <ResultDetailItem label="EV" value={grade.evLabel} />
              <ResultDetailItem label="source" value={problem.source} />
              <ResultDetailItem label="canonical key" value={`${problem.canonicalKey.slice(0, 60)}...`} />
            </div>
            <InfoList title="Explanation" items={problem.explanation} />
          </div>
        )}

        <div className="editor-block" data-testid="trainer-recent-section">
          <div className="panel-title">
            <h3>최근 퀴즈</h3>
            <button className="preset-action danger" type="button" onClick={onClearTrainerRecent} data-testid="trainer-clear-recent-button">
              <Trash2 size={14} />
              전체 삭제
            </button>
          </div>
          {trainerRecent.length === 0 ? (
            <p className="muted">아직 제출한 기록이 없습니다.</p>
          ) : (
            <div className="recent-list" data-testid="trainer-recent-list">
              {trainerRecent.map((entry) => (
                <div className="recent-row" key={entry.id} data-testid="trainer-recent-row">
                  <div className="recent-summary">
                    <strong>
                      {entry.hand} · {entry.selectedAction} → {entry.correctAction}
                    </strong>
                    <span>{entry.isCorrect ? "정답" : "오답"} · {entry.source}</span>
                    <span>
                      freq {entry.frequency.toFixed(3)} · EV {entry.evLabel}
                    </span>
                    <span>
                      {entry.spotSummary.heroPosition} / {entry.spotSummary.tableSize}명
                    </span>
                    <span>{new Date(entry.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="editor-block" data-testid="trainer-mistakes-section">
          <div className="panel-title">
            <h3>오답 노트</h3>
            <button className="preset-action danger" type="button" onClick={onClearTrainerMistakes} data-testid="trainer-clear-mistakes-button">
              <Trash2 size={14} />
              전체 삭제
            </button>
          </div>
          {trainerMistakes.length === 0 ? (
            <p className="muted">오답 기록이 없습니다.</p>
          ) : (
            <div className="recent-list" data-testid="trainer-mistakes-list">
              {trainerMistakes.map((entry) => (
                <div className="recent-row" key={entry.id} data-testid="trainer-mistake-row">
                  <div className="recent-summary">
                    <strong>
                      {entry.hand} · {entry.selectedAction} → {entry.correctAction}
                    </strong>
                    <span>{entry.source}</span>
                    <span>{entry.spotSummary.heroPosition} / {entry.spotSummary.tableSize}명</span>
                    <span>{new Date(entry.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
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
      <input type="checkbox" checked={player.inHand} onChange={(event) => onChange({ inHand: event.target.checked })} aria-label="in hand" />
      <input
        type="radio"
        checked={player.isHero}
        onChange={() => onChange({ setHeroSeat: true })}
        aria-label={`hero seat ${player.seat}`}
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
              <div className="range-table" role="table" aria-label="chipev vs icm comparison table">
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
              <h3>Range preset comparison (read-only)</h3>
              <p className="muted">{rangePresetComparison.notes[0] ?? "range preset 비교 정보입니다."}</p>
              <div className="detail-grid">
                <ResultDetailItem label="rows" value={String(rangePresetComparison.rowCount)} />
                <ResultDetailItem label="source" value={rangePresetComparison.source} />
              </div>
              {fallbackRanges.length > 0 ? (
                <div className="range-table" role="table" aria-label="fallback villain ranges">
                  <div className="range-row range-head" role="row">
                    <span>position</span>
                    <span>presetName</span>
                    <span>editedByUser</span>
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
                <div className="range-table" role="table" aria-label="villain range sensitivity table" data-testid="sensitivity-summary-table">
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

      <div className="info-grid">
        <InfoList title="Assumptions" items={result.assumptions} />
        <InfoList title="Limitations" items={result.limitations} />
      </div>
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
      setReportsError(caught instanceof Error ? caught.message : "리포트 조회에 실패했습니다.");
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
      setError(caught instanceof Error ? caught.message : "import에 실패했습니다.");
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
      setValidationError(caught instanceof Error ? caught.message : "검증 실행에 실패했습니다.");
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
      setDiffError(caught instanceof Error ? caught.message : "canonical diff 실행에 실패했습니다.");
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
            aria-label="canonical diff left json"
          />
        </label>
        <label>
          Right spot JSON
          <textarea
            className="compact-textarea"
            value={rightText}
            onChange={(event) => onChangeRight(event.target.value)}
            spellCheck={false}
            aria-label="canonical diff right json"
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

function DatabaseView({ onGoImport, onFillAnalyze }: { onGoImport: () => void; onFillAnalyze: (spot: SpotInput) => void }) {
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
      setError(caught instanceof Error ? caught.message : "database 조회에 실패했습니다.");
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
          <button className="icon-button" onClick={refresh} type="button" title="새로고침">
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
            Hero position
            <select
              value={filters.heroPosition}
              onChange={(event) => setFilters((prev) => ({ ...prev, heroPosition: event.target.value }))}
              aria-label="db hero position filter"
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
            Table size
            <select
              value={filters.tableSize}
              onChange={(event) => setFilters((prev) => ({ ...prev, tableSize: event.target.value }))}
              aria-label="db table size filter"
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
            Tree config
            <select
              value={filters.treeConfig}
              onChange={(event) => setFilters((prev) => ({ ...prev, treeConfig: event.target.value }))}
              aria-label="db tree config filter"
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
            Hero stack min (BB)
            <input
              type="number"
              step={0.1}
              value={filters.stackMin}
              onChange={(event) => setFilters((prev) => ({ ...prev, stackMin: event.target.value }))}
            />
          </label>
          <label>
            Hero stack max (BB)
            <input
              type="number"
              step={0.1}
              value={filters.stackMax}
              onChange={(event) => setFilters((prev) => ({ ...prev, stackMax: event.target.value }))}
            />
          </label>
          <label>
            Source file
            <input value={filters.sourceFile} onChange={(event) => setFilters((prev) => ({ ...prev, sourceFile: event.target.value }))} />
          </label>
          <label>
            Canonical key 검색
            <input
              value={filters.canonicalKey}
              onChange={(event) => setFilters((prev) => ({ ...prev, canonicalKey: event.target.value }))}
              aria-label="db canonical key search"
            />
          </label>
        </div>

        <div className="search-line">
          <button className="icon-button" onClick={resetFilters} type="button" title="필터 초기화">
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
                onClick={() => onFillAnalyze(selected.row.spot)}
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
          </>
        )}
      </div>
    </section>
  );
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
  return {
    row: solution,
    heroPosition: spot.heroPosition ?? "",
    tableSize: typeof spot.tableSize === "number" ? spot.tableSize : null,
    heroStackBb,
    effectiveStackBb,
    treeConfig,
    strategyCount,
    sourceFile: solution.fileName ?? "",
    canonicalKey: solution.canonicalKey
  };
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


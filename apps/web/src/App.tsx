import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Database,
  FileUp,
  Loader2,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal
} from "lucide-react";
import {
  HAND_KEYS,
  RESULT_SOURCES,
  type AnalyzeRequest,
  type AnalyzeResult,
  type HrcDatabaseFeatures,
  type HrcImportPayload,
  type SpotInput,
  type StrategyMatrix
} from "@poker-tournament-lab/core";
import {
  analyzeSpot,
  getLatestReportsSummary,
  importHrc,
  listImports,
  listSolutions,
  type CanonicalKeyReportSummary,
  type ImportReportSummary,
  type ImportResponse,
  type LatestReportEnvelope,
  type LatestReportsSummary,
  type SolutionListItem,
  type VerificationReportSummary
} from "./api.js";
import { defaultSpot, sampleImportPayload } from "./sampleData.js";
import {
  buildAnalyzeRequestFromForm,
  defaultAnalyzeFormState,
  positionsForTableSize,
  resizePlayers,
  type AnalyzeFormState,
  type VillainPresetOption
} from "./analyzeForm.js";

type Tab = "analyze" | "import" | "database";
type AnalyzeMode = "form" | "json";

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
          <button className={activeTab === "import" ? "active" : ""} onClick={() => setActiveTab("import")} type="button">
            <FileUp size={16} /> Import
          </button>
          <button className={activeTab === "database" ? "active" : ""} onClick={() => setActiveTab("database")} type="button">
            <Database size={16} /> Database
          </button>
        </nav>
      </header>

      {activeTab === "analyze" && <AnalyzeView />}
      {activeTab === "import" && <ImportView />}
      {activeTab === "database" && <DatabaseView onGoImport={() => setActiveTab("import")} />}
    </main>
  );
}

function AnalyzeView() {
  const [mode, setMode] = useState<AnalyzeMode>("form");
  const [formState, setFormState] = useState<AnalyzeFormState>(initialFormState);
  const [jsonRequest, setJsonRequest] = useState(() => JSON.stringify(initialAnalyzeRequest, null, 2));
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const formBuildResult = useMemo(() => buildAnalyzeRequestFromForm(formState), [formState]);
  const heroPositionOptions = positionsForTableSize(formState.tableSize);

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

        <div className="search-line">
          <button className="primary-action" onClick={runAnalyze} type="button" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            Analyze 실행
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
  const fallbackRanges = result.fallbackMetadata?.villainRanges ?? [];
  const fallbackLimitations = result.fallbackMetadata?.limitations ?? [];
  const missingRequirements = result.missingRequirements ?? [];

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
          <div className="detail-grid">
            <ResultDetailItem label="modelVersion" value={result.fallbackMetadata?.modelVersion ?? "제공되지 않음"} />
            <ResultDetailItem label="villain range rows" value={String(fallbackRanges.length)} />
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
          {fallbackLimitations.length > 0 && (
            <div className="notice">
              {fallbackLimitations.map((item) => (
                <p key={item}>{item}</p>
              ))}
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
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  async function loadReports() {
    setReportsLoading(true);
    setReportsError(null);
    try {
      setReports(await getLatestReportsSummary());
    } catch (caught) {
      setReportsError(caught instanceof Error ? caught.message : "리포트 조회에 실패했습니다.");
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
        <button className="primary-action" onClick={submitImport} type="button" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <FileUp size={18} />}
          Import 저장
        </button>
        {error && <p className="error-text">{error}</p>}
        {response && (
          <div className="notice success">
            <p>import #{response.import.id} 저장 완료</p>
            <p>{response.import.rowCount} records</p>
            <p>{response.import.fileHash.slice(0, 16)}</p>
            {response.import.databaseFeatures && <FeatureChips features={response.import.databaseFeatures} />}
          </div>
        )}
      </div>
      <ImportReportsPanel reports={reports} loading={reportsLoading} error={reportsError} onRefresh={loadReports} />
    </section>
  );
}

function ImportReportsPanel({
  reports,
  loading,
  error,
  onRefresh
}: {
  reports: LatestReportsSummary | null;
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

function DatabaseView({ onGoImport }: { onGoImport: () => void }) {
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

function missingReportMessage(status: LatestReportEnvelope<unknown>["status"] | undefined): string {
  if (status === "invalid") {
    return "리포트 파일을 읽을 수 없습니다.";
  }
  return "아직 import 검증 리포트가 없습니다.";
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


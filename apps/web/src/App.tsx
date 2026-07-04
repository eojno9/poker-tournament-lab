import { useEffect, useMemo, useState } from "react";
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
  type AnalyzeResult,
  type HrcDatabaseFeatures,
  type HrcImportPayload,
  type PlayerState,
  type RangePreset,
  type SpotInput
} from "@poker-tournament-lab/core";
import { analyzeSpot, importHrc, listImports, listSolutions, type ImportResponse, type SolutionListItem } from "./api.js";
import { defaultSpot, sampleImportPayload } from "./sampleData.js";

type Tab = "analyze" | "import" | "database";

const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const sourceClass: Record<string, string> = {
  [RESULT_SOURCES.HRC_PRECOMPUTED_DB]: "source-hrc",
  [RESULT_SOURCES.FALLBACK_ICM]: "source-fallback",
  [RESULT_SOURCES.NOT_SOLVED]: "source-empty"
};

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
            <Play size={16} /> 분석
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
      {activeTab === "database" && <DatabaseView />}
    </main>
  );
}

function AnalyzeView() {
  const [spot, setSpot] = useState<SpotInput>(defaultSpot);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalyze() {
    setLoading(true);
    setError(null);
    try {
      const response = await analyzeSpot({
        spot,
        villainRanges: spot.players
          .filter((player) => !player.isHero)
          .map((player) => ({
            seat: player.seat,
            ...(player.rangePreset ? { preset: player.rangePreset } : {}),
            ...(typeof player.callRangePct === "number" ? { callRangePct: player.callRangePct } : {})
          })),
        fallbackOptions: { equitySamples: 80 }
      });
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
          <h2>Spot</h2>
        </div>
        <SpotEditor spot={spot} onChange={setSpot} />
        <button className="primary-action" onClick={runAnalyze} type="button" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
          분석 실행
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
      <ResultPanel result={result} loading={loading} />
    </section>
  );
}

function SpotEditor({ spot, onChange }: { spot: SpotInput; onChange: (spot: SpotInput) => void }) {
  const update = (patch: Partial<SpotInput>) => onChange({ ...spot, ...patch });
  const updateBlind = (key: keyof SpotInput["blinds"], value: number) => update({ blinds: { ...spot.blinds, [key]: value } });

  function updatePlayer(seat: number, patch: Partial<PlayerState>) {
    update({
      players: spot.players.map((player) => (player.seat === seat ? { ...player, ...patch } : player))
    });
  }

  return (
    <>
      <div className="form-grid">
        <label>
          테이블
          <input type="number" min={2} max={10} value={spot.tableSize} onChange={(event) => update({ tableSize: Number(event.target.value) })} />
        </label>
        <label>
          Hero seat
          <input type="number" min={1} max={10} value={spot.heroSeat} onChange={(event) => update({ heroSeat: Number(event.target.value) })} />
        </label>
        <label>
          Hero position
          <select value={spot.heroPosition} onChange={(event) => update({ heroPosition: event.target.value })}>
            {positions.map((position) => (
              <option key={position}>{position}</option>
            ))}
          </select>
        </label>
        <label>
          Pot BB
          <input type="number" min={0} step={0.1} value={spot.potBb} onChange={(event) => update({ potBb: Number(event.target.value) })} />
        </label>
        <label>
          SB
          <input type="number" min={0} step={0.1} value={spot.blinds.smallBb} onChange={(event) => updateBlind("smallBb", Number(event.target.value))} />
        </label>
        <label>
          BB
          <input type="number" min={0} step={0.1} value={spot.blinds.bigBb} onChange={(event) => updateBlind("bigBb", Number(event.target.value))} />
        </label>
        <label>
          Ante
          <input type="number" min={0} step={0.01} value={spot.blinds.anteBb} onChange={(event) => updateBlind("anteBb", Number(event.target.value))} />
        </label>
      </div>

      <div className="editor-block">
        <h3>Players</h3>
        <div className="player-table">
          <span>Seat</span>
          <span>Pos</span>
          <span>Stack</span>
          <span>In</span>
          <span>Hero</span>
          <span>Range</span>
          {spot.players.map((player) => (
            <PlayerRow key={player.seat} player={player} onChange={(patch) => updatePlayer(player.seat, patch)} />
          ))}
        </div>
      </div>

      <div className="editor-block">
        <h3>Payouts</h3>
        <div className="payout-grid">
          {spot.payouts.map((payout, index) => (
            <label key={index}>
              {index + 1}위
              <input
                type="number"
                min={0}
                value={payout}
                onChange={(event) => {
                  const payouts = [...spot.payouts];
                  payouts[index] = Number(event.target.value);
                  update({ payouts });
                }}
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function PlayerRow({ player, onChange }: { player: PlayerState; onChange: (patch: Partial<PlayerState>) => void }) {
  return (
    <>
      <strong>{player.seat}</strong>
      <select value={player.position} onChange={(event) => onChange({ position: event.target.value })}>
        {positions.map((position) => (
          <option key={position}>{position}</option>
        ))}
      </select>
      <input type="number" min={0.1} step={0.1} value={player.stackBb} onChange={(event) => onChange({ stackBb: Number(event.target.value) })} />
      <input type="checkbox" checked={player.inHand} onChange={(event) => onChange({ inHand: event.target.checked })} aria-label="in hand" />
      <input type="checkbox" checked={Boolean(player.isHero)} onChange={(event) => onChange({ isHero: event.target.checked })} aria-label="hero" />
      <div className="range-controls">
        <select value={player.rangePreset ?? "standard"} onChange={(event) => onChange({ rangePreset: event.target.value as RangePreset })}>
          <option value="tight">tight</option>
          <option value="standard">standard</option>
          <option value="loose">loose</option>
        </select>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={player.callRangePct ?? 16}
          onChange={(event) => onChange({ callRangePct: Number(event.target.value) })}
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
        <p>계산 중</p>
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
        <p>spot을 입력하고 분석을 실행하세요.</p>
      </div>
    );
  }

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
        </div>
        <div className="ev-card">
          <span>Unit</span>
          <strong>{result.evSummary?.unit ?? "unknown"}</strong>
        </div>
      </div>

      {databaseFeatures && <FeatureChips features={databaseFeatures} />}

      {result.missingRequirements && result.missingRequirements.length > 0 && (
        <div className="notice">
          {result.missingRequirements.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      )}

      {result.strategy ? <HandMatrix result={result} /> : <div className="not-solved-box">NOT_SOLVED</div>}

      <div className="info-grid">
        <InfoList title="Assumptions" items={result.assumptions} />
        <InfoList title="Limitations" items={result.limitations} />
      </div>
    </div>
  );
}

function HandMatrix({ result }: { result: AnalyzeResult }) {
  const shoveCount = useMemo(() => Object.values(result.strategy ?? {}).filter((entry) => entry.action === "SHOVE").length, [result.strategy]);
  return (
    <div className="matrix-wrap">
      <div className="matrix-summary">
        <span>Shove {shoveCount}/169</span>
        <span>Fold {169 - shoveCount}/169</span>
      </div>
      <div className="hand-matrix">
        {HAND_KEYS.map((hand) => {
          const entry = result.strategy?.[hand];
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

function ImportView() {
  const [format, setFormat] = useState<HrcImportPayload["format"]>("json");
  const [sourceLabel, setSourceLabel] = useState(sampleImportPayload.sourceLabel ?? "");
  const [fileName, setFileName] = useState(sampleImportPayload.fileName ?? "");
  const [content, setContent] = useState(sampleImportPayload.content);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    </section>
  );
}

function DatabaseView() {
  const [imports, setImports] = useState<ImportResponse["import"][]>([]);
  const [solutions, setSolutions] = useState<SolutionListItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const [importRows, solutionRows] = await Promise.all([listImports(), listSolutions(search)]);
      setImports(importRows);
      setSolutions(solutionRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "database 조회에 실패했습니다.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <section className="database-grid">
      <div className="panel stack">
        <div className="panel-title">
          <Database size={18} />
          <h2>Imports</h2>
          <button className="icon-button" onClick={refresh} type="button" title="새로고침">
            <RefreshCw size={16} />
          </button>
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
      </div>
      <div className="panel stack">
        <div className="panel-title">
          <Search size={18} />
          <h2>Solutions</h2>
        </div>
        <div className="search-line">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="source, external id, canonical key" />
          <button className="icon-button" onClick={refresh} type="button" title="검색">
            <Search size={16} />
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {solutions.map((solution) => (
          <div className="solution-row" key={solution.id}>
            <div>
              <strong>{solution.sourceLabel}</strong>
              {solution.databaseFeatures && <FeatureChips features={solution.databaseFeatures} compact />}
              <span>{solution.externalId ?? "external id 없음"}</span>
            </div>
            <code>{solution.canonicalKey.slice(0, 140)}</code>
          </div>
        ))}
        {solutions.length === 0 && <p className="muted">solution이 없습니다.</p>}
      </div>
    </section>
  );
}

function FeatureChips({ features, compact = false }: { features: HrcDatabaseFeatures; compact?: boolean }) {
  const chips = [
    features.playerCount ? `${features.playerCount}P` : "인원수 미확인",
    features.stackDepthBb ? `${features.stackDepthBb}BB` : "스택 미확인",
    features.treeDepth ? `Depth ${features.treeDepth}` : "Depth 미확인",
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

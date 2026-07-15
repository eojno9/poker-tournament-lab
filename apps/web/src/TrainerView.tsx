import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, BookmarkPlus, Download, GraduationCap, RefreshCw, Trash2 } from "lucide-react";
import {
  buildTrainerProblemFromSolution,
  gradeTrainerAnswer,
  RESULT_SOURCES,
  type TrainerChoiceAction,
  type TrainerGradeResult,
  type TrainerProblem
} from "@poker-tournament-lab/core";
import { listSolutions, type SolutionListItem } from "./api.js";
import { toUserFacingApiError } from "./apiError.js";
import {
  addTrainerMistakeHistory,
  addTrainerRecentHistory,
  clearTrainerMistakesHistory,
  clearTrainerRecentHistory,
  dismissTrainerMistakeHistory,
  loadTrainerMistakesHistory,
  loadTrainerRecentHistory,
  type TrainerHistoryEntry,
  type TrainerMistakeStatus
} from "./trainerHistory.js";
import {
  buildTrainerSourceSolutions,
  clearTrainerFilterSettings,
  defaultTrainerFilterSettings,
  deriveTrainerTreeConfig,
  filterTrainerSolutions,
  loadTrainerFilterSettings,
  normalizeTrainerHandInput,
  parseTrainerSeedInput,
  resolveTrainerSolutionIndex,
  saveTrainerFilterSettings,
  uniqueSorted,
  type TrainerProblemFilters
} from "./trainerOptions.js";
import { buildTrainerSummary, type TrainerSummaryBucket } from "./trainerSummary.js";

type TrainerSessionStatus = "empty" | "not_started" | "in_progress" | "completed";
type TrainerMistakeFilterMode = "all" | "unresolved" | "resolved" | "dismissed";

export function TrainerView() {
  const [solutions, setSolutions] = useState<SolutionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialTrainerFilterSettings] = useState(() => loadTrainerFilterSettings());
  const [filters, setFilters] = useState<TrainerProblemFilters>(initialTrainerFilterSettings.filters);
  const [handInput, setHandInput] = useState(initialTrainerFilterSettings.handInput);
  const [seedInput, setSeedInput] = useState(initialTrainerFilterSettings.seedInput);
  const [problem, setProblem] = useState<TrainerProblem | null>(null);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [selectedAction, setSelectedAction] = useState<TrainerChoiceAction | null>(null);
  const [grade, setGrade] = useState<TrainerGradeResult | null>(null);
  const [trainerRecent, setTrainerRecent] = useState<TrainerHistoryEntry[]>(() => loadTrainerRecentHistory());
  const [trainerMistakes, setTrainerMistakes] = useState<TrainerHistoryEntry[]>(() => loadTrainerMistakesHistory());
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [sessionAttempts, setSessionAttempts] = useState(0);
  const [sessionCorrectCount, setSessionCorrectCount] = useState(0);
  const [filterStorageNotice, setFilterStorageNotice] = useState("저장된 필터는 이 브라우저에만 보관됩니다.");
  const [mistakeFilterMode, setMistakeFilterMode] = useState<TrainerMistakeFilterMode>("unresolved");
  const answerLockedRef = useRef(false);

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
      setError(toUserFacingApiError(caught, "Trainer 문제를 불러오지 못했습니다."));
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

  function resetTrainerSessionState(nextStartedAt = new Date().toISOString()) {
    answerLockedRef.current = false;
    setSessionStartedAt(nextStartedAt);
    setSessionAttempts(0);
    setSessionCorrectCount(0);
    setGrade(null);
    setSelectedAction(null);
  }

  function resetTrainerSessionForContextChange() {
    setCursor(0);
    resetTrainerSessionState();
  }

  function updateTrainerFilters(patch: Partial<TrainerProblemFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
    resetTrainerSessionForContextChange();
  }

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
          treeConfig: deriveTrainerTreeConfig(selected),
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
    if (!problem || grade || answerLockedRef.current) {
      return;
    }
    answerLockedRef.current = true;
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
    setSessionAttempts((previous) => previous + 1);
    setSessionCorrectCount((previous) => previous + (graded.isCorrect ? 1 : 0));
  }

  function onNextProblem() {
    if (trainerCandidates.length === 0 || !grade || sessionAttempts >= trainerCandidates.length) {
      return;
    }
    answerLockedRef.current = false;
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

  function onResetTrainerSession() {
    resetTrainerSessionState();
  }

  function onRetryTrainerMistake(entry: TrainerHistoryEntry) {
    setFilters({
      heroPosition: entry.spotSummary.heroPosition,
      tableSize: String(entry.spotSummary.tableSize),
      treeConfig: entry.spotSummary.treeConfig ?? "",
      sourceFile: ""
    });
    setHandInput(entry.hand);
    setSeedInput("");
    resetTrainerSessionForContextChange();
  }

  function onDismissTrainerMistake(id: string) {
    setTrainerMistakes(dismissTrainerMistakeHistory(id));
  }

  function applyTrainerFilterSettings(nextSettings = defaultTrainerFilterSettings) {
    setFilters(nextSettings.filters);
    setHandInput(nextSettings.handInput);
    setSeedInput(nextSettings.seedInput);
    resetTrainerSessionForContextChange();
  }

  function onSaveTrainerFilters() {
    const saved = saveTrainerFilterSettings({ filters, handInput, seedInput });
    setFilterStorageNotice(saved ? "현재 필터를 이 브라우저에 저장했습니다." : "필터 저장에 실패했지만 현재 세션은 계속 사용할 수 있습니다.");
  }

  function onLoadTrainerFilters() {
    const saved = loadTrainerFilterSettings();
    applyTrainerFilterSettings(saved);
    setFilterStorageNotice("저장된 필터를 안전하게 불러왔습니다.");
  }

  function resetTrainerFilters() {
    clearTrainerFilterSettings();
    applyTrainerFilterSettings(defaultTrainerFilterSettings);
    setFilterStorageNotice("필터를 기본값으로 초기화했습니다. 전체 기록은 유지됩니다.");
  }

  const filterSummary = [
    filters.heroPosition ? `포지션=${filters.heroPosition}` : null,
    filters.tableSize ? `인원=${filters.tableSize}` : null,
    filters.treeConfig ? `트리=${filters.treeConfig}` : null,
    filters.sourceFile ? `소스~${filters.sourceFile}` : null
  ]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
  const handSummary = normalizeTrainerHandInput(handInput) ? `핸드 고정: ${normalizeTrainerHandInput(handInput)}` : "핸드 자동 선택(결정적 선택)";
  const trainerSummary = useMemo(
    () => buildTrainerSummary(trainerRecent, trainerMistakes, { recentWindowSize: 10, maxByHandRows: 5 }),
    [trainerRecent, trainerMistakes]
  );
  const visibleTrainerMistakes = trainerMistakes.filter((entry) => !entry.status || entry.status === "unresolved");
  const resolvedTrainerMistakes = trainerMistakes.filter((entry) => entry.status === "resolved");
  const dismissedTrainerMistakes = trainerMistakes.filter((entry) => entry.status === "dismissed");
  const mistakeFilterCounts: Record<TrainerMistakeFilterMode, number> = {
    all: trainerMistakes.length,
    unresolved: visibleTrainerMistakes.length,
    resolved: resolvedTrainerMistakes.length,
    dismissed: dismissedTrainerMistakes.length
  };
  const displayedTrainerMistakes = trainerMistakes.filter((entry) => {
    if (mistakeFilterMode === "all") {
      return true;
    }
    const status = entry.status ?? "unresolved";
    return status === mistakeFilterMode;
  });
  const recentTrainerPreview = trainerRecent.slice(0, 5);
  const sessionIncorrectCount = sessionAttempts - sessionCorrectCount;
  const sessionAccuracyPct = sessionAttempts > 0 ? Number(((sessionCorrectCount / sessionAttempts) * 100).toFixed(2)) : null;
  const sessionProblemIndex = trainerCandidates.length > 0 ? ((cursor % trainerCandidates.length) + trainerCandidates.length) % trainerCandidates.length + 1 : 0;
  const sessionStatus: TrainerSessionStatus =
    trainerCandidates.length === 0
      ? "empty"
      : sessionAttempts === 0
        ? "not_started"
        : sessionAttempts >= trainerCandidates.length
          ? "completed"
          : "in_progress";
  const sessionStatusLabel = formatTrainerSessionStatusLabel(sessionStatus);
  const sessionStatusHelp = formatTrainerSessionStatusHelp(sessionStatus);
  const answerDisabled = !problem || Boolean(grade) || sessionStatus === "completed";
  const nextDisabled = !grade || trainerCandidates.length === 0 || sessionStatus === "completed";

  return (
    <section className="workspace-grid">
      <div className="panel stack">
        <div className="panel-title">
          <GraduationCap size={18} />
          <h2>Trainer 학습</h2>
            <button className="icon-button" onClick={() => void refreshProblems()} type="button" title="문제 새로고침" aria-label="Trainer 문제 새로고침">
              <RefreshCw size={16} />
            </button>
        </div>

        <div className="notice trainer-hero-note">
          <p>오프테이블 학습 전용 Trainer입니다.</p>
          <p>실시간 플레이 보조, 화면 캡처, OCR, 오버레이, 핫키, 포커 클라이언트 연동 기능은 제공하지 않습니다.</p>
          <p>최근 기록과 오답 복습은 이 브라우저의 로컬 저장소에만 저장됩니다.</p>
        </div>

        <div className="editor-block" data-testid="trainer-filter-controls">
          <div className="panel-title">
            <h3>학습 문제 설정</h3>
            <span className="status-pill">로컬 세션</span>
          </div>
          <div className="form-grid">
            <label>
              포지션
              <select
                value={filters.heroPosition}
                onChange={(event) => updateTrainerFilters({ heroPosition: event.target.value })}
                aria-label="Trainer 포지션 필터"
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
              테이블 인원
              <select
                value={filters.tableSize}
                onChange={(event) => updateTrainerFilters({ tableSize: event.target.value })}
                aria-label="Trainer 테이블 인원 필터"
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
              트리 유형
              <select
                value={filters.treeConfig}
                onChange={(event) => updateTrainerFilters({ treeConfig: event.target.value })}
                aria-label="Trainer 트리 유형 필터"
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
              로컬 소스 필터
              <input
                value={filters.sourceFile}
                onChange={(event) => updateTrainerFilters({ sourceFile: event.target.value })}
                aria-label="Trainer 로컬 소스 필터"
                data-testid="trainer-filter-source-file"
              />
            </label>
            <label>
              핸드 입력 (예: AKo, K8s, 22)
              <input
                value={handInput}
                onChange={(event) => {
                  setHandInput(event.target.value);
                  resetTrainerSessionForContextChange();
                }}
                aria-label="Trainer 핸드 입력"
                data-testid="trainer-hand-input"
              />
            </label>
            <label>
              시드
              <input
                value={seedInput}
                onChange={(event) => {
                  setSeedInput(event.target.value);
                  resetTrainerSessionForContextChange();
                }}
                aria-label="Trainer 시드 입력"
                data-testid="trainer-seed-input"
              />
            </label>
          </div>
          <div className="search-line">
            <button className="preset-action" onClick={onSaveTrainerFilters} type="button" data-testid="trainer-filter-save-button">
              <BookmarkPlus size={14} />
              필터 저장
            </button>
            <button className="preset-action" onClick={onLoadTrainerFilters} type="button" data-testid="trainer-filter-load-button">
              <Download size={14} />
              저장된 필터 불러오기
            </button>
            <button className="preset-action" onClick={resetTrainerFilters} type="button" data-testid="trainer-filter-reset-button">
              <RefreshCw size={14} />
              필터 초기화
            </button>
            <button className="preset-action" onClick={onResetTrainerSession} type="button" data-testid="trainer-session-reset-button">
              <RefreshCw size={14} />
              세션 다시 시작
            </button>
          </div>
          <p className="muted" data-testid="trainer-filter-storage-notice" role="status" aria-live="polite">{filterStorageNotice}</p>
          <div className="trainer-local-session" data-testid="trainer-session-card" aria-label="Trainer 로컬 세션 상태">
            <div data-testid="trainer-session-status" role="status" aria-live="polite">
              <span>세션 상태</span>
              <strong>{sessionStatusLabel}</strong>
            </div>
            <div>
              <span>현재 문제</span>
              <strong>{sessionProblemIndex > 0 ? `${sessionProblemIndex} / ${trainerCandidates.length}` : "대기 중"}</strong>
            </div>
            <div>
              <span>세션 시도</span>
              <strong>{sessionAttempts}</strong>
            </div>
            <div>
              <span>세션 정답률</span>
              <strong>{formatTrainerSummaryPct(sessionAccuracyPct)}</strong>
            </div>
            <div>
              <span>시작</span>
              <strong>{new Date(sessionStartedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</strong>
            </div>
          </div>
          <p className="muted" data-testid="trainer-session-help">{sessionStatusHelp}</p>
          <p className="muted" data-testid="trainer-filter-summary">필터 요약: {filterSummary.length > 0 ? filterSummary : "전체 문제"}</p>
          <p className="muted" data-testid="trainer-candidate-count">
            후보 문제 {trainerCandidates.length}개 / 전체 {trainerSourceSolutions.length}개
          </p>
          <p className="muted">{handSummary}</p>
        </div>

        {error && <p className="error-text">{error}</p>}
        {loading && <p className="muted">Trainer 문제를 불러오는 중...</p>}

        {!loading && !problem && (
          <div className="notice not-solved-help">
            <p>{problemError ?? "Trainer 문제를 생성할 수 없습니다."}</p>
            <p>로컬에 설정된 사전 계산 학습 데이터가 없거나 strategy 정보가 비어 있으면 Trainer 문제를 만들 수 없습니다.</p>
          </div>
        )}

        {problem && (
          <div className="result-block" data-testid="trainer-problem-card">
            <div className="trainer-card-heading">
              <div>
                <h3>문제 카드</h3>
                <p className="muted">현재 로컬 세션의 오프테이블 학습 문제입니다.</p>
              </div>
              <span className="status-pill">{formatTrainerSourceLabel(problem.source)}</span>
            </div>
            <div className="detail-grid">
              <TrainerDetailItem label="포지션" value={problem.spotSummary.heroPosition} />
              <TrainerDetailItem label="테이블 인원" value={String(problem.spotSummary.tableSize)} />
              <TrainerDetailItem label="스택(BB)" value={formatTrainerBb(problem.spotSummary.heroStackBb)} />
              <TrainerDetailItem label="트리 유형" value={problem.spotSummary.treeConfig ?? "제공되지 않음"} />
              <TrainerDetailItem label="핸드" value={problem.hand} />
              <TrainerDetailItem label="후보 순서" value={sessionProblemIndex > 0 ? `${sessionProblemIndex}/${trainerCandidates.length}` : "제공되지 않음"} />
            </div>
            <p className="muted">액션 경로: {problem.spotSummary.actionPath.join(", ")}</p>
            <code>{problem.canonicalKey.slice(0, 88)}...</code>

            <div className="trainer-actions">
              <button
                className={`primary-action ${selectedAction === "SHOVE" ? "selected-answer" : ""}`}
                type="button"
                onClick={() => onAnswer("SHOVE")}
                disabled={answerDisabled}
                aria-pressed={selectedAction === "SHOVE"}
                data-testid="trainer-shove-button"
              >
                올인(Shove)
              </button>
              <button
                className={`primary-action ${selectedAction === "FOLD" ? "selected-answer" : ""}`}
                type="button"
                onClick={() => onAnswer("FOLD")}
                disabled={answerDisabled}
                aria-pressed={selectedAction === "FOLD"}
                data-testid="trainer-fold-button"
              >
                폴드(Fold)
              </button>
              <button className="preset-action" type="button" onClick={onNextProblem} disabled={nextDisabled} data-testid="trainer-next-button">
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
          <p className="muted">통계는 이 기기의 로컬 Trainer 기록만 기준으로 계산합니다.</p>
          {trainerSummary.totalAttempts === 0 ? (
            <div className="notice">
              <p>아직 학습 기록이 없습니다.</p>
              <p>문제를 풀면 세션 요약, 정답률, 오답 복습 상태가 이곳에 표시됩니다.</p>
            </div>
          ) : (
            <>
              <div className="trainer-summary-strip">
                <div data-testid="trainer-summary-total-attempts">
                  <span>총 시도</span>
                  <strong>{trainerSummary.totalAttempts}</strong>
                </div>
                <div data-testid="trainer-summary-accuracy">
                  <span>전체 정답률</span>
                  <strong>{formatTrainerSummaryPct(trainerSummary.accuracyPct)}</strong>
                </div>
                <div>
                  <span>최근 10문제</span>
                  <strong>{formatTrainerSummaryPct(trainerSummary.recentWindowAccuracyPct)}</strong>
                </div>
                <div>
                  <span>미해결 오답</span>
                  <strong>{trainerSummary.unresolvedMistakeCount}</strong>
                </div>
              </div>
              <div className="detail-grid">
                <TrainerDetailItem label="정답" value={String(trainerSummary.correctCount)} />
                <TrainerDetailItem label="오답" value={String(trainerSummary.incorrectCount)} />
                <TrainerDetailItem label="세션 정답" value={String(sessionCorrectCount)} />
                <TrainerDetailItem label="세션 오답" value={String(sessionIncorrectCount)} />
                <TrainerDetailItem
                  label="최근 10문제 정답률"
                  value={
                    trainerSummary.recentWindowAttempts > 0
                      ? `${formatTrainerSummaryPct(trainerSummary.recentWindowAccuracyPct)} (${trainerSummary.recentWindowAttempts}문제)`
                      : "제공되지 않음"
                  }
                />
                <TrainerDetailItem label="미해결 오답" value={String(trainerSummary.unresolvedMistakeCount)} />
                <TrainerDetailItem label="해결된 오답" value={String(trainerSummary.resolvedMistakeCount)} />
                <TrainerDetailItem label="숨긴 오답" value={String(trainerSummary.dismissedMistakeCount)} />
              </div>
              {sessionStatus === "completed" ? (
                <div className="notice success" data-testid="trainer-session-complete-summary">
                  <p>세션 완료: 이번 세션 {sessionAttempts}문제를 풀었습니다.</p>
                  <p>
                    이번 세션 정답 {sessionCorrectCount}개 / 오답 {sessionIncorrectCount}개 · 정답률 {formatTrainerSummaryPct(sessionAccuracyPct)}
                  </p>
                </div>
              ) : null}

              <div className="meta-list">
                <p>
                  <strong>가장 최근 결과</strong>: {trainerSummary.latestResult
                    ? `${trainerSummary.latestResult.hand} / ${formatTrainerActionLabel(trainerSummary.latestResult.selectedAction)} → ${formatTrainerActionLabel(trainerSummary.latestResult.correctAction)} (${trainerSummary.latestResult.isCorrect ? "정답" : "오답"})`
                    : "제공되지 않음"}
                </p>
                <p>
                  <strong>가장 최근 오답</strong>: {trainerSummary.mostRecentMistake
                    ? `${trainerSummary.mostRecentMistake.hand} / ${formatTrainerActionLabel(trainerSummary.mostRecentMistake.selectedAction)} → ${formatTrainerActionLabel(trainerSummary.mostRecentMistake.correctAction)}`
                    : "오답 없음"}
                </p>
              </div>

              {trainerSummary.byHand.length > 0 ? (
                <div className="range-table" role="table" aria-label="Trainer 핸드별 요약">
                  <div className="range-row range-head" role="row">
                    <span>핸드</span>
                    <span>시도</span>
                    <span>정답</span>
                    <span>오답</span>
                    <span>정답률</span>
                  </div>
                  {trainerSummary.byHand.map((row) => (
                    <div className="range-row" role="row" key={row.hand}>
                      <span>{row.hand}</span>
                      <span>{row.attempts}</span>
                      <span>{row.correctCount}</span>
                      <span>{row.incorrectCount}</span>
                      <span>{formatTrainerSummaryPct(row.accuracyPct)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {trainerSummary.byPosition.length > 0 ? (
                <TrainerSummaryBucketTable title="포지션별 로컬 통계" rows={trainerSummary.byPosition} formatLabel={(label) => label} />
              ) : null}
              {trainerSummary.byAction.length > 0 ? (
                <TrainerSummaryBucketTable title="액션별 로컬 통계" rows={trainerSummary.byAction} formatLabel={formatTrainerActionLabel} />
              ) : null}
            </>
          )}
        </div>

        {!problem ? (
          <p className="muted">문제를 먼저 불러와 주세요.</p>
        ) : !grade ? (
          <p className="muted">올인(Shove) 또는 폴드(Fold)를 선택하면 결과가 표시됩니다.</p>
        ) : (
          <div className="result-block" data-testid="trainer-result-card">
            <h3>채점 결과</h3>
            <div className={`notice ${grade.isCorrect ? "success" : ""}`}>
              <p>{grade.isCorrect ? "정답입니다." : "오답입니다."}</p>
              <p>
                {grade.isCorrect
                  ? "이 시도는 로컬 세션 정답으로 기록됩니다."
                  : "오답 복습에 저장했습니다. 오프테이블에서 다시 풀어볼 수 있습니다."}
              </p>
            </div>
            <div className="detail-grid">
              <TrainerDetailItem label="선택한 액션" value={formatTrainerActionLabel(grade.selectedAction)} />
              <TrainerDetailItem label="정답 액션" value={formatTrainerActionLabel(grade.correctAction)} />
              <TrainerDetailItem label="빈도" value={grade.frequency.toFixed(3)} />
              <TrainerDetailItem label="EV" value={grade.evLabel} />
              <TrainerDetailItem label="데이터 범위" value={formatTrainerSourceLabel(problem.source)} />
              <TrainerDetailItem label="canonical key" value={`${problem.canonicalKey.slice(0, 60)}...`} />
            </div>
            <TrainerInfoList title="풀이 설명" items={problem.explanation} />
          </div>
        )}

        <div className="editor-block" data-testid="trainer-recent-section">
          <div className="panel-title">
            <h3>최근 기록</h3>
            <button className="preset-action danger" type="button" onClick={onClearTrainerRecent} data-testid="trainer-clear-recent-button">
              <Trash2 size={14} />
              전체 삭제
            </button>
          </div>
          <p className="muted">최근 5개 제출만 간단히 표시합니다. 전체 기록은 이 기기의 로컬 저장소에만 남습니다.</p>
          {trainerRecent.length === 0 ? (
            <p className="muted">아직 제출한 기록이 없습니다.</p>
          ) : (
            <div className="recent-list" data-testid="trainer-recent-list">
              {recentTrainerPreview.map((entry) => (
                <div className="recent-row" key={entry.id} data-testid="trainer-recent-row">
                  <div className="recent-summary">
                    <strong>
                      {entry.hand} · {formatTrainerActionLabel(entry.selectedAction)} → {formatTrainerActionLabel(entry.correctAction)}
                    </strong>
                    <span>{entry.isCorrect ? "정답" : "오답"} · {formatTrainerSourceLabel(entry.source)}</span>
                    <span>
                      빈도 {entry.frequency.toFixed(3)} · EV {entry.evLabel}
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
            <h3>오답 복습</h3>
            <button className="preset-action danger" type="button" onClick={onClearTrainerMistakes} data-testid="trainer-clear-mistakes-button">
              <Trash2 size={14} />
              로컬 오답 기록 지우기
            </button>
          </div>
          <div className="trainer-mistake-status-grid" data-testid="trainer-mistake-status-grid">
            <div>
              <span>미해결</span>
              <strong>{visibleTrainerMistakes.length}</strong>
            </div>
            <div>
              <span>해결됨</span>
              <strong>{resolvedTrainerMistakes.length}</strong>
            </div>
            <div>
              <span>숨김</span>
              <strong>{dismissedTrainerMistakes.length}</strong>
            </div>
          </div>
          <div className="trainer-filter-tabs" role="group" aria-label="오답 복습 상태 필터" data-testid="trainer-mistake-filter-tabs">
            {(["all", "unresolved", "resolved", "dismissed"] as const).map((mode) => (
              <button
                key={mode}
                className={`preset-action ${mistakeFilterMode === mode ? "active" : ""}`}
                type="button"
                onClick={() => setMistakeFilterMode(mode)}
                aria-pressed={mistakeFilterMode === mode}
                data-testid={`trainer-mistake-filter-${mode}`}
              >
                {formatTrainerMistakeFilterLabel(mode)} {mistakeFilterCounts[mode]}
              </button>
            ))}
          </div>
          <p className="muted">오답 복습은 이 기기의 로컬 기록만 사용합니다. 학습 데이터나 원본 설정은 변경하지 않습니다.</p>
          {displayedTrainerMistakes.length === 0 ? (
            <div className="notice" data-testid="trainer-mistakes-empty-state">
              <p>{formatTrainerMistakeEmptyState(mistakeFilterMode, trainerMistakes.length)}</p>
              <p>
                {resolvedTrainerMistakes.length > 0
                  ? "해결된 오답은 로컬 통계에 반영됩니다."
                  : "틀린 문제는 이 브라우저의 로컬 저장소에만 저장됩니다."}
              </p>
            </div>
          ) : (
            <div className="recent-list" data-testid="trainer-mistakes-list">
              {displayedTrainerMistakes.map((entry) => (
                <div className="recent-row" key={entry.id} data-testid="trainer-mistake-row">
                  <div className="recent-summary">
                    <strong>
                      {entry.hand} · {formatTrainerActionLabel(entry.selectedAction)} → {formatTrainerActionLabel(entry.correctAction)}
                    </strong>
                    <span>{formatTrainerMistakeStatusLabel(entry.status)} · 재시도 {entry.retryCount ?? 0}회</span>
                    <span>{formatTrainerSourceLabel(entry.source)}</span>
                    <span>{entry.spotSummary.heroPosition} / {entry.spotSummary.tableSize}명</span>
                    <span>
                      최초 오답 {new Date(entry.createdAt).toLocaleString("ko-KR")}
                      {entry.lastReviewedAt ? ` · 최근 복습 ${new Date(entry.lastReviewedAt).toLocaleString("ko-KR")}` : ""}
                    </span>
                  </div>
                  <div className="recent-actions">
                    <button className="preset-action" type="button" onClick={() => onRetryTrainerMistake(entry)} data-testid="trainer-retry-mistake-button">
                      다시 풀기
                    </button>
                    <button className="preset-action danger" type="button" onClick={() => onDismissTrainerMistake(entry.id)} data-testid="trainer-dismiss-mistake-button">
                      숨기기
                    </button>
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

function TrainerSummaryBucketTable({
  title,
  rows,
  formatLabel
}: {
  title: string;
  rows: TrainerSummaryBucket[];
  formatLabel: (label: string) => string;
}) {
  return (
    <div>
      <h4>{title}</h4>
      <div className="range-table" role="table" aria-label={title}>
        <div className="range-row range-head" role="row">
          <span>항목</span>
          <span>시도</span>
          <span>정답</span>
          <span>오답</span>
          <span>정답률</span>
        </div>
        {rows.map((row) => (
          <div className="range-row" role="row" key={row.label}>
            <span>{formatLabel(row.label)}</span>
            <span>{row.attempts}</span>
            <span>{row.correctCount}</span>
            <span>{row.incorrectCount}</span>
            <span>{formatTrainerSummaryPct(row.accuracyPct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTrainerActionLabel(action: string): string {
  const labels: Record<string, string> = {
    SHOVE: "올인(Shove)",
    FOLD: "폴드(Fold)",
    CALL: "콜(Call)",
    RAISE: "레이즈(Raise)",
    MIXED: "혼합(Mixed)"
  };
  return labels[action] ?? action;
}

function formatTrainerSourceLabel(source: TrainerHistoryEntry["source"]): string {
  if (source === RESULT_SOURCES.HRC_PRECOMPUTED_DB) {
    return "로컬 사전 계산 학습 데이터";
  }
  if (source === RESULT_SOURCES.FALLBACK_ICM) {
    return "대체 평가";
  }
  if (source === RESULT_SOURCES.NOT_SOLVED) {
    return "해결되지 않음";
  }
  return "로컬 학습 데이터";
}

function formatTrainerMistakeStatusLabel(status: TrainerMistakeStatus | undefined): string {
  if (status === "resolved") {
    return "해결됨";
  }
  if (status === "dismissed") {
    return "숨김";
  }
  return "미해결";
}

function formatTrainerMistakeFilterLabel(mode: TrainerMistakeFilterMode): string {
  if (mode === "all") {
    return "전체";
  }
  if (mode === "resolved") {
    return "해결됨";
  }
  if (mode === "dismissed") {
    return "숨김";
  }
  return "미해결";
}

function formatTrainerMistakeEmptyState(mode: TrainerMistakeFilterMode, totalCount: number): string {
  if (totalCount === 0) {
    return "아직 저장된 오답이 없습니다.";
  }
  if (mode === "all") {
    return "현재 표시할 오답 기록이 없습니다.";
  }
  return `${formatTrainerMistakeFilterLabel(mode)} 상태의 오답이 없습니다.`;
}

function formatTrainerSessionStatusLabel(status: TrainerSessionStatus): string {
  if (status === "empty") {
    return "문제 없음";
  }
  if (status === "completed") {
    return "세션 완료";
  }
  if (status === "in_progress") {
    return "진행 중";
  }
  return "시작 전";
}

function formatTrainerSessionStatusHelp(status: TrainerSessionStatus): string {
  if (status === "empty") {
    return "현재 필터에 맞는 문제가 없습니다. 필터를 초기화하거나 다른 조건을 선택해 주세요.";
  }
  if (status === "completed") {
    return "이번 세션 목표 수만큼 풀었습니다. 새 세션을 시작해도 전체 로컬 기록은 유지됩니다.";
  }
  if (status === "in_progress") {
    return "세션이 진행 중입니다. 결과는 이 브라우저의 로컬 기록에만 저장됩니다.";
  }
  return "첫 답안을 선택하면 세션이 시작됩니다. 필터를 저장해도 서버에는 저장하지 않습니다.";
}

function TrainerInfoList({ title, items }: { title: string; items: string[] }) {
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

function TrainerDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatTrainerBb(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return `${value.toFixed(1)} BB`;
}

function formatTrainerSummaryPct(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "제공되지 않음";
  }
  return `${value.toFixed(2)}%`;
}

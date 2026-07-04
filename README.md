# poker-tournament-lab

오프테이블 포커 토너먼트 학습/분석용 로컬 앱입니다.  
v1.4는 기존 분석 기능(v1.x)을 유지하면서 Trainer/Study Mode 기초 기능을 추가했습니다.

## 핵심 원칙
- 실시간 플레이 보조 기능 없음 (RTA/live 기능 미구현)
- 정확 매칭 우선:
  - `HRC_PRECOMPUTED_DB`: HRC precomputed exact canonical key 매칭
  - `FALLBACK_ICM`: fallback ICM EV 평가 (Nash solver 아님)
  - `NOT_SOLVED`: exact 매칭 없음 + fallback 조건 미충족
- 추측/heuristic 추천 없음

## 실행 방법 (Windows)
PowerShell 환경에서는 `npm.ps1` 대신 `npm.cmd`를 사용합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

기본 주소:
- `http://127.0.0.1:5173`

원클릭 실행:

```powershell
.\run-all.cmd
```

## 검증 명령
```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run test:smoke
```

Playwright 최초 설치:

```powershell
npm.cmd exec playwright install chromium
```

## 화면별 사용 가이드

### 1) Analyze
- 폼 입력 또는 고급 JSON 입력으로 `/api/analyze` 호출
- 결과는 source enum 기준으로 명확히 표시
- Analyze Preset / Recent Analyses 지원
- Database spot 불러오기 지원 (자동 실행 없음, 입력만 채움)

### 2) Trainer (v1.4)
Trainer는 `HRC_PRECOMPUTED_DB` 기반 문제만 기본 출제합니다.

- 문제 카드: hero position, table size, hero stack, tree config, action path, hand, source
- 사용자 선택: `SHOVE` / `FOLD`
- 결과 카드: 선택 action, 정답 action, 정오, frequency, EV, canonical key, explanation
- 최근 퀴즈 / 오답 노트: localStorage 기반
- 학습 요약 카드:
  - 전체 풀이 수 / 정답 수 / 오답 수
  - 전체 정답률
  - 최근 N문제 정답률
  - 오답 노트 개수
  - 최신 결과 / 최신 오답
  - hand별 간단 집계

Trainer 문제 선택 옵션:
- hero position 필터
- table size 필터
- tree config 필터
- source file 필터
- hand 직접 입력 (`AKo`, `K8s`, `22` 등)
- seed 입력 (deterministic 문제/hand 선택)
- 필터 초기화

정책:
- `FALLBACK_ICM`, `NOT_SOLVED`는 기본 Trainer 문제에서 제외
- Trainer 기록은 **브라우저 localStorage에만 저장**되고 서버/DB에는 저장하지 않음

### 3) Import
- HRC pre-normalized JSON/CSV import
- import/verification/canonical-key 최신 리포트 요약 확인
- validation preview(dry-run) 확인

### 4) Database
- solution 목록 탐색/필터링/상세 보기
- canonical key 및 strategy matrix 확인
- `이 spot으로 Analyze 채우기` 지원 (자동 실행 없음)

## localStorage 키

Analyze:
- `poker-tournament-lab:analyze-presets:v1`
- `poker-tournament-lab:recent-analyses:v1`

Trainer:
- `poker-tournament-lab:trainer-recent:v1`
- `poker-tournament-lab:trainer-mistakes:v1`

손상된 localStorage 데이터는 안전하게 빈 상태로 처리합니다.

## 리포트 파일
- `artifacts/latest-import-report.json`
- `artifacts/latest-verification-report.json`
- `artifacts/latest-canonical-key-report.json`

## 범위 밖 기능
다음 기능은 의도적으로 미구현입니다.
- nearest match recommendation
- Nash approximation
- PKO/bounty/satellite 특수 로직
- postflop solver
- OCR/screen capture/overlay/hotkey/live watcher
- poker client integration
- real-time assistance / RTA workflow

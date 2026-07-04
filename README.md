# poker-tournament-lab

오프테이블 전용 MTT 프리플랍/ICM 학습용 로컬 웹앱입니다.  
v1.5는 새 solver를 추가하지 않고, 기존 결과를 더 잘 해석하도록 분석 설명력을 강화했습니다.

## 핵심 원칙
- 실시간 플레이 보조 기능 없음 (RTA/live 기능 없음)
- exact lookup 우선:
  - `HRC_PRECOMPUTED_DB`: HRC 사전 계산 DB exact canonical key 매칭
  - `FALLBACK_ICM`: fallback ICM EV 평가 (Nash solver 아님)
  - `NOT_SOLVED`: exact 매칭 없음 + fallback 조건 미충족
- nearest match/heuristic 추천 없음

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

## v1.5 분석 설명 강화 기능
v1.5 기능은 **새 계산 엔진 추가가 아니라 read-only 분석 설명 강화**입니다.

### 1) Villain Range Sensitivity
- `FALLBACK_ICM` 결과에서만 표시
- villain calling range 가정별 EV 민감도 요약
- Nash solution이 아니라 가정 기반 비교임을 명시

### 2) ChipEV vs ICM EV Comparison
- `FALLBACK_ICM` 결과에서만 read-only 표시
- 기존 payload 값을 그대로 표시 (새 계산 아님)
- ChipEV 값이 없으면 `제공되지 않음`

### 3) Range Preset Comparison
- `fallbackMetadata.villainRanges` 기반 표시
- 표시 항목:
  - `position`
  - `presetName`
  - `editedByUser`
  - `callRangePct`
  - `rangeSource`
- solver 결과가 아니라 입력/가정 비교임을 명시

### 4) Fallback Explanation Enhancement
- fallback 결과임
- exact HRC DB match가 아님
- Nash solution이 아님
- villain calling range 가정 기반 ICM EV 평가임
- `assumptions`, `limitations`, `modelVersion`, `villainRanges` 표시

## 화면별 사용 가이드

### 1) Analyze
- 폼 입력 또는 고급 JSON 입력으로 `/api/analyze` 호출
- source enum 기준으로 결과를 명확히 표시
- Analyze Presets / Recent Analyses 지원
- Database spot 불러오기 지원 (자동 분석 실행 없음)

### 2) Trainer (v1.4+)
Trainer는 `HRC_PRECOMPUTED_DB` 기반 문제만 기본 출제합니다.

- 문제 카드: hero position, table size, hero stack, tree config, action path, hand, source
- 선택: `SHOVE` / `FOLD`
- 결과 카드: 선택 action, 정답 action, 정오, frequency, EV, canonical key, explanation
- recent/mistakes/history는 브라우저 localStorage에만 저장
- 서버/DB 저장 없음

### 3) Import
- HRC pre-normalized JSON/CSV import
- import/verification/canonical-key 최신 리포트 요약 확인
- validation preview(dry-run) 확인

### 4) Database
- solution 목록 탐색/필터/상세 보기
- canonical key 및 strategy 확인
- 선택한 spot으로 Analyze 입력 채우기 지원 (자동 분석 실행 없음)

## 제품 목표
- 단기 목표:
  - HRC로 만든 DB를 정확히 import하고 GTO Wizard처럼 탐색/학습
- 중기 목표:
  - DB에 있는 액션/레이즈 사이즈만 선택하게 하고 raise/call/fold/all-in 비율과 EV를 보기 좋게 표시
- 장기 목표:
  - HRC Pro / ICMIZER처럼 계산 job을 만들고 자체 또는 외부 계산 결과로 GTO DB를 계속 생산
- 최종 목표:
  - 오프테이블 전용 MTT preflop/ICM GTO DB 제작·탐색·학습 플랫폼

## localStorage keys
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

## 범위 및 비지원 기능
아래 기능은 의도적으로 미구현 상태입니다.

- Nash solver / approximate Nash
- PKO / bounty / satellite 특수 로직
- postflop solver
- nearest recommendation
- hand history parser
- OCR / screen capture / overlay / hotkey / live watcher
- poker client integration
- real-time assistance / RTA workflow

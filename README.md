# poker-tournament-lab

오프테이블 전용 MTT preflop/ICM GTO DB 제작, 탐색, 분석, 학습 플랫폼입니다.

v1.6은 새 solver를 추가하지 않고, DB에 실제로 존재하는 action/raise size 후보를 안전하게 추출하고 화면에 표시하는 기반 버전입니다.

## 핵심 원칙
- 실시간 플레이 보조 기능 없음: RTA/live 기능 없음
- exact lookup 우선:
  - `HRC_PRECOMPUTED_DB`: HRC 사전 계산 DB exact canonical key 매칭
  - `FALLBACK_ICM`: fallback ICM EV 평가, Nash solver 아님
  - `NOT_SOLVED`: exact match 없음 + fallback 조건 미충족
- DB에 없는 action/size를 HRC exact match처럼 표시하지 않음
- nearest match/heuristic recommendation 없음

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

## v1.9 Browser v2

Browser v2는 Database Detail 안에 있는 read-only 탐색 섹션입니다. 별도 Browser 탭은 아직 없으며, 선택된 solution의 stored strategy를 화면용 view model로 변환해 action frequency matrix와 selected hand detail을 보여줍니다.

### What Browser v2 Shows

- v2 `hand -> actions[]` strategy가 있으면 저장된 원본 `actions[]`를 직접 표시합니다.
- v1 legacy strategy는 Browser v2 view model로 변환해 표시합니다.
- Action Frequency Matrix에서 hand별 action frequency를 표시합니다.
- hand를 선택하면 selected hand action detail을 표시합니다.
- action detail 표시 항목:
  - action
  - size
  - frequency
  - EV
  - ChipEV
  - ICM EV
  - warnings
- 없는 값은 `제공되지 않음`으로 표시합니다.
- size 없는 `RAISE` / `BET` / `CALL`은 `사이즈 미지정`으로 표시될 수 있습니다.

### Browser v2 Controls

- Hand 선택 UI: matrix preview에서 hand를 선택해 detail을 확인합니다.
- Action kind filter: DB에 실제 존재하는 action kind만 option으로 표시합니다.
- Size label filter: DB에 실제 존재하는 size label만 option으로 표시합니다.
- EV display mode:
  - `EV`
  - `ChipEV`
  - `ICM EV`

필터는 DB에 존재하는 action/size만 기준으로 동작합니다. DB에 없는 action, size, EV를 임의 생성하거나 추정하지 않습니다.

### Relationship To Existing Views

- 기존 Database Detail 13x13 Strategy Matrix는 유지됩니다.
- 기존 v1.8 Multi-action preview도 유지됩니다.
- Browser v2는 그 위에 추가된 read-only 탐색 foundation입니다.
- Analyze, Import, Trainer, Verification UX 동작은 변경하지 않습니다.

### v1.9 Limits

- 별도 Solution Browser 탭은 아직 없습니다.
- DB schema migration 없음
- 신규 API 없음
- 새 import schema 없음
- solver job generator 없음
- 자체 solver 없음
- GTO Wizard 전체 복제 아님
- solver 계산을 새로 수행하지 않음
- 추천/nearest 기능 아님
- RTA/live/OCR/screen capture/overlay/hotkey/live watcher/poker client integration/real-time assistance 없음
- Nash / approximate Nash 없음
- PKO / bounty / postflop 없음

v1.9는 read-only Browser v2 foundation 단계입니다. v2.0 이후 별도 Solution Browser 탭이나 더 큰 GTO Wizard식 탐색 경험을 검토할 수 있습니다.

## v1.8 Multi-Action Import v2
v1.8 extends the v1.7 `hand -> actions[]` foundation into an import/storage-capable v2 strategy format. It is still an off-table data foundation, not a new solver.

### Import v2 Strategy Shape
- Import records can use `schemaVersion: "multi-action-v2"`.
- Strategy data can be stored as `hand -> actions[]`.
- Each action can preserve:
  - action kind: `FOLD`, `CHECK`, `CALL`, `BET`, `RAISE`, `ALL_IN`, `UNKNOWN`
  - `sizeBb`
  - `sizePctPot`
  - `isAllIn`
  - `rawSizeLabel`
  - `frequency`
  - `EV`
  - `ChipEV`
  - `ICM EV`
  - `sourceActionLabel`
  - `warnings`

### Validation
- v2 validation checks hand notation, non-empty `actions[]`, action kind normalization, frequency range `0..1`, EV number/null values, and warning rows.
- `RAISE`, `BET`, and `CALL` get non-blocking size warnings when size is not explicit.
- `ALL_IN` size remains optional.
- `UNKNOWN` actions are allowed only with warnings.
- Missing values are displayed as `제공되지 않음`; missing sizes are displayed as `사이즈 미지정` or warning text.

### Storage Strategy
- v1.8 uses the existing `solutions.strategy` JSON storage path.
- v2 rows store native `hand -> actions[]` JSON in that existing strategy field.
- Existing v1 single-action strategy rows remain unchanged.
- No DB schema migration was added.
- No new endpoint was added; the existing import flow branches by payload schema version.
- `/api/solutions` returns the stored strategy JSON so the web app can display v1 and v2 rows.

### UI Connection
- Database Detail Multi-action preview prefers stored v2 `actions[]` when present.
- Analyze Result Multi-action detail prefers stored v2 `actions[]` when present.
- v1 legacy strategy rows still use the v1.7 legacy adapter and may show one action per hand.
- v2 rows can show multiple actions per hand with action, size, frequency, EV, ChipEV, ICM EV, source label, and warnings.

### v1.8 Limits
- v1.8 is not a solver and does not compute new EV values.
- No HRC exact lookup policy changed.
- No fallback/analyze/import/solver routing policy changed.
- No full GTO Wizard-style Solution Browser v2 was completed.
- No solver job generator was completed.
- No Nash, approximate Nash, PKO, bounty, satellite solver, postflop solver, or nearest recommendation was added.
- No OCR, screen capture, overlay, hotkey, live watcher, poker client integration, real-time assistance, or RTA workflow was added.

## v1.7 Multi-Action Schema Foundation
v1.7은 DB schema migration 없이 기존 strategy를 `hand -> actions[]` view model로 변환해 보여주는 read-only foundation 단계입니다. 새 solver, 새 API, DB schema 변경 없이 Database와 Analyze 결과에서 action-level 정보를 더 명확히 확인할 수 있게 합니다.

### Multi-Action Shape
- Hand model: `hand -> actions[]`
- 지원 action kind:
  - `FOLD`
  - `CHECK`
  - `CALL`
  - `BET`
  - `RAISE`
  - `ALL_IN`
  - `UNKNOWN`
- Action size 표현:
  - `sizeBb`
  - `sizePctPot`
  - `isAllIn`
  - `rawSizeLabel`
- Action별 표시 값:
  - `frequency`
  - `EV`
  - `ChipEV`
  - `ICM EV`
  - `warning`

### Legacy Strategy Adapter
v1.7 adapter는 기존 single-action legacy strategy row를 one-action `actions[]` entry로 변환합니다. HRC와 fallback 결과 의미는 read-only 표시 데이터로 보존하며, size나 EV가 없으면 값을 임의 생성하지 않고 `제공되지 않음` 또는 warning으로 표시합니다.

대부분 기존 DB에서는 hand당 action 1개만 표시될 수 있습니다. 이는 v1.7에서 DB schema migration과 multi-action import v2를 아직 수행하지 않았기 때문에 정상적인 한계입니다.

### Database Detail Preview
Database Detail에는 read-only Multi-action preview가 추가되었습니다. 선택된 solution의 strategy를 hand, action, size, frequency, EV, ChipEV, ICM EV, warning 단위로 보여주며 기존 Database matrix, source metadata, canonical key, detail UI는 유지합니다.

### Analyze Result Detail
Analyze Result에는 strategy가 있을 때 read-only Multi-action detail이 표시됩니다. 기존 Result source detail, EV summary, 13x13 matrix, Villain Range Sensitivity, ChipEV/ICM comparison, Range Preset Comparison, assumptions, limitations는 유지됩니다.

### v1.7 Limits
- DB schema migration 안 함
- multi-action import v2 안 함
- solver job generator 안 함
- 실제 multi-action solving 안 함
- Nash / approximate Nash 안 함
- PKO / bounty / postflop 안 함
- nearest recommendation 안 함
- OCR / screen capture / overlay / hotkey / live watcher / poker client integration / real-time assistance / RTA workflow 없음

향후 schema v2/import v2에서는 raise/call/fold/all-in 복수 action frequency와 EV를 native multi-action solution data로 저장하는 것을 목표로 합니다.

### Product Goals
- 단기 목표: HRC로 만든 DB를 정확히 import하고 GTO Wizard처럼 탐색/학습
- 중기 목표: DB에 있는 액션/레이즈 사이즈만 선택하게 하고 raise/call/fold/all-in 비율과 EV를 보기 좋게 표시
- 장기 목표: HRC Pro / ICMIZER처럼 계산 job을 만들고 자체 또는 외부 계산 결과로 GTO DB를 계속 생산
- 최종 목표: 오프테이블 전용 MTT preflop/ICM GTO DB 제작·탐색·학습 플랫폼

## v1.6 DB Action/Sizing Selector
v1.6 기능은 multi-action schema v2가 아닙니다. 현재 imported DB와 `/api/solutions`에 실제로 존재하는 action/sizing 신호를 read-only로 추출, 표시, 선택 보조하는 기반 작업입니다.

### Analyze: DB 기준 액션/사이즈 후보
Analyze 화면의 `DB 기준 액션/사이즈 후보` 카드는 기존 `/api/solutions` 응답과 extractor 기반 데이터만 사용합니다.

- DB에 실제 존재하는 action/size 후보만 표시
- 후보 선택은 form fill만 수행
- 자동 Analyze 실행 없음
- DB에 없는 size는 `HRC_PRECOMPUTED_DB` exact match로 처리되지 않음
- fallback 조건이 완전할 때만 `FALLBACK_ICM`으로 평가 가능
- 후보에는 action, sizeKind, sizeLabel, sizeBb, confidence, sourceCount, examples를 표시

### Database: Action / Sizing Summary
Database detail의 `Action / Sizing Summary`는 선택된 solution의 저장 데이터만 읽어 표시합니다.

표시 항목:
- actionPath
- treeConfig
- detected actions
- detected raise sizes
- all-in / shove 여부
- sizeKind
- sizeLabel
- confidence
- sourceCount
- size signals
- explicit size fields

안내:
- 이 정보는 DB에 저장된 spot/action/tree metadata에서 감지한 값입니다.
- DB에 없는 size를 임의 생성하지 않습니다.
- `UNKNOWN/UNSPECIFIED`는 imported data에 명시적 size 정보가 부족하다는 뜻입니다.
- size token은 source metadata, actionPath, treeConfig 문자열에서 감지될 수 있습니다.

## v1.5 분석 설명 강화
v1.5 기능은 새 계산 엔진이 아니라 read-only 분석 설명 강화입니다.

### Villain Range Sensitivity
- `FALLBACK_ICM` 결과에서만 표시
- villain calling range 가정별 EV 민감도 요약
- Nash solution 아님

### ChipEV vs ICM EV Comparison
- `FALLBACK_ICM` 결과에서만 read-only 표시
- 기존 payload 값을 그대로 표시, 새 계산 아님
- ChipEV 값이 없으면 `제공되지 않음`

### Range Preset Comparison
- `fallbackMetadata.villainRanges` 기반 표시
- `position`, `presetName`, `editedByUser`, `callRangePct`, `rangeSource` 표시
- solver 결과가 아니라 입력/가정 비교

### Fallback Explanation Enhancement
- fallback 결과임
- exact HRC DB match가 아님
- Nash solution이 아님
- villain calling range 가정 기반 ICM EV 평가
- `assumptions`, `limitations`, `modelVersion`, `villainRanges` 표시

## 화면별 사용 가이드

### Analyze
- 폼 입력 또는 고급 JSON 입력으로 `/api/analyze` 호출
- source enum 기준으로 결과 표시
- Analyze Presets / Recent Analyses 지원
- Database spot 불러오기 지원
- DB action/sizing 후보 선택은 폼만 채우며 자동 분석하지 않음

### Trainer
Trainer는 `HRC_PRECOMPUTED_DB` 기반 문제만 기본 출제합니다.

- 문제 카드: hero position, table size, hero stack, tree config, action path, hand, source
- 선택: `SHOVE` / `FOLD`
- 결과 카드: 선택 action, 정답 action, 정오, frequency, EV, canonical key, explanation
- recent/mistakes/history는 브라우저 localStorage에만 저장
- 서버/DB 저장 없음

### Import
- HRC pre-normalized JSON/CSV import
- import/verification/canonical-key 최신 리포트 요약 확인
- validation preview(dry-run) 확인

### Database
- solution 목록 검색/필터/상세 보기
- canonical key 및 strategy 확인
- 선택한 spot으로 Analyze 입력 채우기 지원
- Action / Sizing Summary로 DB에 저장된 action/sizing 신호 확인

## 제품 목표
- 단기 목표:
  - HRC로 만든 DB를 정확히 import하고 GTO Wizard처럼 탐색/학습
- 중기 목표:
  - DB에 있는 액션/레이즈 사이즈만 선택하게 하고 raise/call/fold/all-in 비율과 EV를 보기 좋게 표시
- 장기 목표:
  - HRC Pro / ICMIZER처럼 계산 job을 만들고 자체 또는 외부 계산 결과로 GTO DB를 계속 생산
- 최종 목표:
  - 오프테이블 전용 MTT preflop/ICM GTO DB 제작, 탐색, 학습 플랫폼

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

## 범위 밖 기능
아래 기능은 의도적으로 구현하지 않습니다.

- 새 solver
- Nash solver / approximate Nash
- PKO / bounty / satellite 전용 로직
- postflop solver
- nearest recommendation
- hand history parser
- OCR / screen capture / overlay / hotkey / live watcher
- poker client integration
- real-time assistance / RTA workflow

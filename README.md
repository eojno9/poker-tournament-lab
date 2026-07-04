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

## v2.6 Real HRC Dry-run Artifacts

v2.6 is dry-run artifact infrastructure only. It does not connect real HRC raw zip files to product import routes, APIs, DB writes, solver logic, analysis logic, fallback logic, or UI.

The goal is to convert existing dry-run results into artifact-safe JSON structures that can be written and compared safely in test scope before any future production import design is considered.

### Scope

- Raw HRC zip originals remain outside the repo.
- Raw HRC zip originals are not committed.
- Full raw zip extraction output is not committed.
- The repo does not create or commit `artifacts/hrc-dry-run-reports/`.
- Helpers live in `packages/core` test/helper scope only.
- Product runtime code does not import or use these helpers.

### Artifact-Safe Report Helper

The v2.6 report helper converts an existing dry-run report into artifact-safe JSON data:

- `buildHrcDryRunArtifactReport`
- `buildHrcDryRunComparisonSummary`
- `sanitizeArtifactFileName`
- `maskArtifactPath`

The report keeps diagnostic summaries only: status, node shape, validator result, mismatch summary, privacy summary, amount semantics, and optional verification summary.

### TEST_TEMP_ONLY Writer Helper

The writer helper is test-only and limited to OS temp folders:

- `buildHrcDryRunArtifactFileName`
- `writeHrcDryRunArtifactReport`
- `writeHrcDryRunComparisonSummary`

It writes only under `TEST_TEMP_ONLY` scope, rejects repo artifact output, and does not write to `artifacts/hrc-dry-run-reports/`.

### Multiple Artifact Index / Comparison Helper

The index helper summarizes multiple artifact-safe reports:

- `buildHrcDryRunArtifactIndex`
- `buildHrcDryRunArtifactComparisonRows`
- `buildHrcDryRunArtifactIndexFileName`

Deterministic sorting policy:

1. `zipFileNameSanitized` ascending
2. `generatedAt` ascending
3. `selectedNodeEntry` ascending

Index/comparison summaries include:

- `statusCounts`
- `validatorPassCount` / `validatorFailCount`
- `privacySafeCount` / `privacyWarningCount`
- `mismatchCountTotal` / `mismatchCategories`
- `warningCountTotal` / `errorCountTotal`
- `amountUnitCounts`
- `selectedNodeEntriesSample`
- `zipFileNamesSample`

### Safety Policy

- Raw path text is not stored.
- `C:\Users\` path text is not stored.
- User tokens such as `sample-user` are not stored.
- Email text is not stored.
- Raw HRC zip contents are not stored.
- Long hand strategy payload dumps are not stored.
- Mismatch samples remain capped.
- Artifact reports are not product import candidates.

### Amount Semantics

v2.6 keeps HRC amount values uninterpreted:

- `amountUnit: UNKNOWN`
- `amountInterpretation: RAW_HRC_AMOUNT_UNINTERPRETED`
- no bb conversion
- no chip conversion

### v2.6 Limits

- No product import route connection.
- No new API.
- No DB migration.
- No production DB write.
- No UI.
- No solver/analyze/fallback product logic change.
- No actual raw zip import.
- No repo artifact creation or commit.
- No raw zip commit.
- No full raw zip extraction commit.
- No RTA/live workflow.
- No OCR / screen capture / overlay / hotkey / live watcher / poker client integration.
- No Nash / approximate Nash.
- No PKO / bounty / postflop.

## v2.5 Real HRC Import Adapter / Dry-Run Intake

v2.5 is a dry-run compatibility stage only. It does not connect real HRC raw zip files to the product import route, API, DB writes, solver logic, analysis logic, fallback logic, or UI.

The goal is to inspect a repo-external raw HRC zip safely, read only the needed entries in memory, apply the v2.4 raw node adapter for report purposes, and produce a diagnostic dry-run report.

### Raw Zip Safety

- Raw HRC zip originals remain outside the repo.
- Raw HRC zip originals are not committed.
- Full raw zip extraction output is not committed.
- The dry-run reader lives in `packages/core` test/helper scope.
- The helper reads `settings.json` and the selected `nodes/*.json` entry in memory.
- Current default node read target is `nodes/0.json`.
- Raw file paths are masked in reports.
- Reports do not dump raw payload contents.

### Privacy / Safety Scan

The dry-run report scans settings/node text for sensitive patterns and records only warning categories, not raw values.

Patterns include:

- `C:\Users\`
- `AppData`
- `Desktop`
- `Documents`
- `sample-user`
- email pattern
- `playerName`
- `nickname`
- `screenname`
- `userName`

If a privacy pattern is found, the report uses `PRIVACY_WARNING`, keeps `privacySafe: false`, and does not promote the candidate toward product import.

### Dry-Run Status Enum

The report status is fixed to one of:

- `OK`
- `ZIP_NOT_FOUND`
- `SETTINGS_MISSING`
- `NODE_MISSING`
- `SETTINGS_PARSE_ERROR`
- `NODE_PARSE_ERROR`
- `RAW_NODE_SHAPE_INVALID`
- `PRIVACY_WARNING`
- `ADAPTER_FAILED`
- `VALIDATOR_FAILED`

### Multiple Node Policy

- Prefer `nodes/0.json` when it exists.
- If `nodes/0.json` is absent, select the first `nodes/*.json` entry by deterministic string sort.
- Record the selection in `selectedNodeEntry` and `selectedNodeReason`.
- Keep `multiNodeAggregationApplied: false`.
- Multi-node aggregation is future work and is not applied in v2.5.

### Adapter / Validator Summary

The dry-run report includes:

- `adapterReportSummary`
- `validatorResult`
- `mismatchSummary`

These are diagnostic summaries only. They do not write to the DB and do not call product import routes.

### Amount Semantics

v2.5 keeps the v2.4 amount policy:

- `amountUnit: UNKNOWN`
- `amountInterpretation: RAW_HRC_AMOUNT_UNINTERPRETED`
- no bb conversion
- no chip conversion

Raw amounts are preserved as raw labels / metadata candidates until HRC format documentation or multiple samples justify a unit policy.

### v2.5 Limits

- No product import route connection.
- No new API.
- No DB migration.
- No production DB write.
- No UI.
- No solver/analyze/fallback product logic change.
- No raw zip commit.
- No full raw zip extraction commit.
- No RTA/live workflow.
- No OCR / screen capture / overlay / hotkey / live watcher / poker client integration.
- No Nash / approximate Nash.
- No PKO / bounty / postflop.

## v2.4 Real HRC Raw Intake

v2.4 reopens the raw HRC export compatibility track that remained pending in v2.3. It uses one real raw HRC zip candidate only as repo-external source material, then preserves a sanitized JSON fixture and pure adapter/report tests. The raw zip is not connected to product import, API, DB writes, solver logic, or UI.

This is an off-table compatibility and intake preparation step. It is not a strategy recommendation workflow.

### Raw HRC Zip Candidate

- Original raw zip remains outside the repo.
- Raw zip is not committed.
- Full raw zip extraction is not committed.
- Repo uses a sanitized JSON fixture only.
- Generalized candidate file name: `mtt_10p_btn_vs_co_open_25bb_bba_chipev_depth3.zip`

### Sanitized Fixture

Fixture location:

- `packages/core/test/fixtures/real-hrc-raw-samples/`

Fixture metadata:

- `sampleKind: REAL_HRC_RAW_EXPORT_SAMPLE`
- `sanitized: true`
- `originalTool: HRC`
- `rawZipCommitted: false`
- `streetScope: PREFLOP`
- `source: HRC_PRECOMPUTED_DB`

The fixture is a raw HRC shape compatibility sample. It is not a product import payload and is not a GTO strategy recommendation.

### Raw HRC Node Shape

The sanitized fixture preserves the raw HRC node shape:

- node-level `actions[]`
- `hands[hand].played[]`
- `hands[hand].evs[]`
- `sequence[]`
- 169 hands

`played[]` and `evs[]` are interpreted only by index against node-level `actions[]` for compatibility reporting and adapter tests.

### Raw Node Adapter

v2.4 adds pure adapter/report functions in core:

- `convertHrcRawNodeToMultiActionStrategy`
- `mapHrcActionTypeToAppActionKind`
- `mapHrcActionAmountToSizeLabel`
- `buildHrcRawAdapterReport`

Observed raw action mapping is intentionally conservative:

- `F` -> `FOLD`
- `C` -> `CALL`
- `R` -> `RAISE`
- unknown action type -> `UNKNOWN` with warning

The adapter can build an app v2 `hand -> actions[]` candidate shape for tests, and that candidate validates independently. The raw fixture itself remains a non-product payload with expected mismatch.

### Amount Semantics

v2.4 does not infer the HRC amount unit.

- `amountUnit: UNKNOWN`
- `amountInterpretation: RAW_HRC_AMOUNT_UNINTERPRETED`
- `sizeLabelPolicy: PRESERVE_AS_RAW_SIZE_LABEL`
- `bbConversionApplied: false`
- `chipConversionApplied: false`

Raw amount values are preserved in `rawSizeLabel` and source metadata candidate fields. No bb/chip conversion should be added until HRC format documentation or multiple raw sample comparison confirms the unit.

### v2.4 Limits

- Product import route is not connected.
- No new API.
- No DB migration.
- No production DB change.
- No UI change.
- No raw zip commit.
- No full raw zip extraction commit.
- No solver.
- No nearest recommendation.
- No RTA/live workflow.

### Safety Scope

- Off-table only.
- Raw HRC zip must remain outside the repo until sanitized.
- OCR / screen capture / overlay / hotkey / live watcher / poker client integration: none.
- Nash / approximate Nash: none.
- PKO / bounty / postflop: none.

## v2.3 HRC Compatibility

v2.3은 v2.2 TEST_ONLY/SAMPLE fixture 이후 단계로, 실제 imported HRC-derived DB shape를 read-only로 검증합니다. raw HRC export 원본 검증과 이미 import된 DB-derived 검증은 서로 다른 트랙으로 분리합니다.

### Real HRC Sample Intake

sanitized real HRC sample은 아래 테스트 fixture 위치를 기준으로 다룹니다.

- `packages/core/test/fixtures/real-hrc-samples/`

raw HRC export 원본 파일은 repo에 넣지 않습니다. 원본 파일은 repo 밖에 보관하고, fixture로 사용할 때는 sanitized copy만 추가합니다.

sanitize 원칙:

- 개인정보 제거
- 로컬 경로 제거
- 유저명 제거
- 플레이어명 제거
- 민감 메모 제거
- sample metadata에 `REAL_HRC_SAMPLE` 또는 `HRC_SAMPLE`, `sanitized: true`, `originalTool: HRC` 명시

raw sample이 없으면 compatibility test는 실패하지 않고 `not_provided` 또는 pending 상태로 처리합니다.

### DB-Derived HRC Compatibility

현재 v2.3에서 검증된 것은 raw HRC export payload가 아니라, SQLite DB에 이미 저장된 normalized HRC-derived data입니다. 분석은 read-only로 수행하며 `imports.metadata_json`, `solutions.spot_json`, `solutions.strategy_json`, artifacts report를 확인합니다.

검증된 DB-derived 결과:

- `solutions`: 262 rows
- `imports`: 684 rows
- `strategy_json`: legacy hand map 262 rows
- v2 `actions[]` rows: 0
- all strategy rows have 169 hands
- raw/BLOB/original payload columns: none
- exact lookup: 262/262
- random lookup: 20/20
- duplicate canonical key: 0
- near-match HRC false positive: 0

raw export compatibility status는 `pending_raw_export_required`입니다. 실제 raw HRC export 파일을 확보하기 전까지 raw export shape와 current validator mismatch는 확정하지 않습니다.

### v2.3 Limits

- production DB 변경 없음
- 신규 API 없음
- DB schema migration 없음
- import product logic 변경 없음
- raw HRC export compatibility는 실제 raw export 파일 확보 전까지 pending
- 새 solver 없음
- solver job generator 없음
- nearest recommendation 없음
- RTA/live 기능 없음

### Safety Scope

- off-table only
- raw HRC export는 sanitize 전 커밋 금지
- 실제 HRC 원본 파일은 repo 밖 보관
- OCR / screen capture / overlay / hotkey / live watcher / poker client integration 없음
- Nash / approximate Nash 없음
- PKO / bounty / postflop 없음

## v2.2 RFI / Limp Sample Fixture Coverage

v2.2는 v2.1 Action Tree Browser가 Push/Fold 외의 preflop action tree node에서도 안정적으로 작동하는지 검증하기 위한 TEST_ONLY/SAMPLE fixture coverage 단계입니다. production DB를 변경하지 않고, RFI/Open Raise, Limp, Facing Open, Facing Limp, vs 3bet 계열 sample payload와 unit coverage만 추가했습니다.

이 sample data는 실제 GTO 추천 데이터가 아니며, solver 계산 결과처럼 표시하거나 취급하지 않습니다. 목적은 validator, action tree classifier, Browser filter/candidate summary가 여러 node shape를 안전하게 처리하는지 확인하는 것입니다.

### TEST_ONLY / SAMPLE Data Principles

v2.2 sample fixture는 실제 HRC/export 기반 production data와 명확히 분리됩니다.

- `isSample: true`
- `testOnly: true`
- `calculationModel: TEST_ONLY_SAMPLE`
- `streetScope: PREFLOP`
- `exportShape: MULTI_ACTION_V2_SAMPLE`
- `SAMPLE_TEST_ONLY` source label/file naming

sample payload의 frequency/EV 값은 UI/분류/검증용 test value입니다. 없는 spot을 추천하지 않고, nearest recommendation을 수행하지 않으며, DB에 없는 action/size를 생성하지 않습니다.

### Sample Fixture Scope

추가된 TEST_ONLY/SAMPLE node coverage:

- RFI / Open Raise
- Limp
- Facing Open
- Facing Limp
- vs 3bet

### Import Validator Coverage

- TEST_ONLY v2 sample payload가 multi-action import v2 validator를 통과하는지 확인합니다.
- SAMPLE/TEST_ONLY metadata가 보존되는지 확인합니다.
- LIMP sample은 현재 production schema를 확장하지 않고 schema-compatible handling으로 검증합니다.
- 기존 v1/v2 import validator 회귀를 유지합니다.

### Action Tree / Browser Coverage

- RFI, Limp, Facing Open, Facing Limp, vs 3bet 분류를 확인합니다.
- LIMP와 CALL이 분리되는지 확인합니다.
- `availableActions`, `availableSizes`, `breadcrumb` 생성을 확인합니다.
- Spot Type / Action Node filter option coverage를 확인합니다.
- Node Candidate Summary와 Action / Size Filter Context를 확인합니다.
- 0개 결과 empty state가 nearest recommendation 없이 안전하게 처리되는지 확인합니다.

### v2.2 Limits

- production DB 변경 없음
- 신규 API 없음
- DB schema migration 없음
- 신규 import schema 없음
- 새 solver 없음
- solver job generator 없음
- 없는 spot 추천 없음
- nearest recommendation 없음
- GTO Wizard 전체 복제 아님
- HRC Pro / ICMIZER급 계산 엔진 아님
- read-only sample fixture coverage 단계

### Safety Scope

- off-table only
- RTA/live 기능 없음
- OCR / screen capture / overlay / hotkey / live watcher / poker client integration 없음
- Nash / approximate Nash 없음
- PKO / bounty / postflop 없음

## v2.1 Action Tree Browser

v2.1은 v2.0 Solution Browser를 preflop action tree 탐색이 가능한 read-only Browser로 확장합니다. Browser는 DB에 저장된 solution만 기준으로 Push/Fold, RFI/Open Raise, Limp, Facing Open, Facing Limp, 3bet/vs 3bet 같은 spot/action node를 분류하고 표시합니다.

새 solver 계산은 수행하지 않습니다. 신규 API, DB schema migration, 신규 import schema도 추가하지 않았습니다.

### Action Tree Classifier

Action Tree Classifier는 solution metadata, actionPath, treeConfig, sourceMetadata, strategy actions[]를 기반으로 read-only context를 만듭니다.

출력 항목:

- Spot Type
- Action Node
- Available Actions
- Available Sizes
- Breadcrumb
- Warnings

분류 신호가 부족하면 UNKNOWN과 warning으로 표시하며, 값을 임의 계산하거나 solver처럼 추정하지 않습니다.

### Spot Type / Action Node Filters

Browser Spot Selector에는 Spot Type filter와 Action Node filter가 추가되었습니다.

- 필터 option은 실제 DB solution에 존재하는 값만 표시합니다.
- 없는 spot을 추천하거나 생성하지 않습니다.
- nearest recommendation은 수행하지 않습니다.
- 필터 결과가 없으면 현재 적용된 필터와 함께 DB-only 안내를 표시합니다.

### LIMP vs CALL

LIMP와 CALL은 분리해 표시합니다.

- LIMP: unopened/first-in pot에서 limp하는 액션
- CALL: 이미 bet/raise가 있는 상황에서 따라가는 액션

payload가 불명확하면 임의로 LIMP로 바꾸지 않고 warning으로 드러냅니다.

### Breadcrumb / Node Context

Browser 상단에는 Action Tree Breadcrumb이 표시됩니다. Strategy Matrix와 Hand Detail에도 현재 selected solution의 Spot Type / Action Node context가 함께 표시됩니다.

Source / Metadata panel에도 Action Tree 관련 항목이 정리되어 표시됩니다.

- Action Tree Spot Type
- Action Tree Node
- Action Tree Breadcrumb
- Action Tree Available Actions
- Action Tree Available Sizes
- Action Tree Warnings

### Node Candidate Summary / Filter Context

Browser는 현재 Spot Type / Action Node 필터 기준으로 후보 정보를 보여줍니다.

- Candidate Solutions
- Current Node
- Available Actions
- Available Sizes
- Filtered by

Action / Size Filter Context는 현재 action kind filter와 size label filter가 selected solution의 실제 Browser v2 model과 action tree context에서 나온 값임을 보여줍니다.

필터는 DB에 실제 존재하는 action/size만 기준으로 동작합니다. 필터 결과 없음, strategy 없음, model 없음 상태는 한국어 empty state로 안내합니다.

### v2.1 Limits

- 새 solver 없음
- solver job generator 없음
- DB schema migration 없음
- 신규 API 없음
- 신규 import schema 없음
- 없는 spot 추천 없음
- nearest recommendation 없음
- GTO Wizard 전체 복제 아님
- HRC Pro / ICMIZER급 계산 엔진 아님
- read-only DB browser/action-tree classification 단계

### Safety Scope

- off-table only
- RTA/live 기능 없음
- OCR / screen capture / overlay / hotkey / live watcher / poker client integration 없음
- Nash / approximate Nash 없음
- PKO / bounty / postflop 없음

## v2.0 Solution Browser

v2.0은 기존 Database Detail 안에 있던 Browser v2 탐색 경험을 별도 `Browser` 탭으로 승격한 read-only DB browser입니다. 목표는 GTO Wizard식으로 `spot 선택 -> 13x13 strategy matrix -> hand detail` 흐름을 한 화면에서 제공하는 것입니다.

### Browser 탭

- Browser 탭은 DB에 저장된 solution만 탐색합니다.
- 기존 `/api/solutions` 응답을 재사용합니다.
- 신규 API, DB schema migration, 신규 import schema는 추가하지 않았습니다.
- selected solution을 중심으로 Spot Selector, Strategy Matrix, Hand Detail, Source / Metadata를 표시합니다.
- 이 화면은 off-table read-only 탐색용이며 solver 계산을 새로 수행하지 않습니다.

### Spot Selector

- 왼쪽 Spot Selector는 기존 `/api/solutions` 기반 solution 후보를 표시합니다.
- DB에 실제 존재하는 solution만 표시합니다.
- hero position, table size, remaining players, hero stack, action path, tree config, source file, schema, canonical key 일부를 보여줍니다.
- 없는 spot을 만들거나 추천하지 않습니다.
- nearest recommendation은 수행하지 않습니다.

### 13x13 Strategy Matrix

- 중앙 matrix는 selected solution의 Browser v2 model 기반으로 표시됩니다.
- v2 `hand -> actions[]` strategy는 저장된 원본 `actions[]` 데이터를 직접 표시합니다.
- v1 legacy strategy는 Browser v2 model로 변환해 one-action view로 표시합니다.
- hand cell에는 primary action, mixed action 여부, frequency, 선택한 EV display mode 값이 표시됩니다.
- 값이 없으면 `제공되지 않음`으로 표시하며, 값을 임의 계산하거나 0으로 채우지 않습니다.

### Hand Detail Panel

- 오른쪽 Hand Detail Panel은 matrix에서 선택한 hand의 action detail을 표시합니다.
- 표시 항목:
  - action
  - size
  - frequency
  - EV
  - ChipEV
  - ICM EV
  - source
  - warnings
- missing value는 `제공되지 않음`으로 표시합니다.
- size가 없는 `RAISE` / `BET` / `CALL`은 warning 또는 `사이즈 미지정`으로 드러냅니다.

### Controls

- action kind filter: selected solution에 실제 존재하는 action kind만 option으로 표시합니다.
- size label filter: selected solution에 실제 존재하는 size label만 option으로 표시합니다.
- EV display mode:
  - `EV`
  - `ChipEV`
  - `ICM EV`
- 필터는 DB에 존재하는 action/size만 기준으로 동작합니다.
- DB에 없는 action/size option은 만들지 않습니다.

### Source / Metadata Panel

Source / Metadata panel은 selected solution의 출처와 schema 정보를 명확히 보여줍니다.

표시 항목:

- source / source label
- schema
- canonical key 전체
- action path
- tree config
- hero position / table size / remaining players / hero stack
- source file / import id / imported at / file hash / external id
- calculation model / spot family / export shape / street scope / action tags
- strategy hand count / action count / warning count
- missing EV / missing size / unknown action count

### v2.0 Limits

- 새 solver 없음
- solver job generator 없음
- DB schema migration 없음
- 신규 API 없음
- 신규 import schema 없음
- GTO Wizard 전체 복제 아님
- HRC Pro / ICMIZER급 계산 엔진 아님
- HRC exact lookup 정책 변경 없음
- read-only DB browser foundation 단계

### Safety Scope

- off-table only
- RTA/live 기능 없음
- OCR / screen capture / overlay / hotkey / live watcher / poker client integration 없음
- nearest recommendation 없음
- Nash / approximate Nash 없음
- PKO / bounty / postflop 없음

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

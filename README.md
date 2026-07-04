# poker-tournament-lab

오프테이블 포커 토너먼트 학습용 분석 도구입니다.  
v1.2는 계산 엔진 추가 없이 사용성(입력/탐색/재사용) 개선에 집중했습니다.

## v1.2 변경사항

- Analyze Presets 추가
  - 현재 Analyze form 입력값을 프리셋으로 저장/불러오기/삭제
- Recent Analyses 추가
  - Analyze 실행 결과를 최근 20개까지 저장/재사용/삭제
- Database -> Analyze 연동
  - Database Detail의 spot을 Analyze form에 채우기
- Analyze Form validation UX 개선
  - 잘못된 입력을 한국어 메시지로 분석 실행 전에 안내

중요:
- Preset/Recent/Database->Analyze는 **폼만 채웁니다**.
- 자동 Analyze 실행은 하지 않습니다. 사용자가 `Analyze 실행`을 직접 눌러야 합니다.
- DB/API/fallback 계산 로직은 v1.1과 동일하게 유지됩니다.

## Source Enum

- `HRC_PRECOMPUTED_DB`
  - HRC 사전 계산 DB exact canonical key 매칭
- `FALLBACK_ICM`
  - exact 매칭 실패 시, fallback 입력 완비 조건에서 ICM EV 평가
  - Nash solver 결과가 아님
- `NOT_SOLVED`
  - exact 매칭도 없고 fallback 입력도 불완전한 상태
  - 추측/heuristic 추천 없음

## 실행 방법 (Windows)

PowerShell 환경에서는 `npm.ps1` 대신 `npm.cmd` 사용:

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

- 폼 입력 또는 고급 JSON 입력으로 `/api/analyze` 요청
- 주요 입력:
  - remaining players(2~10)
  - hero seat/position
  - blinds/ante/pot
  - stacks
  - payouts
  - action path
  - villain range preset

### 2) Analyze Presets

- `프리셋 이름` 입력 후 `현재 입력을 프리셋으로 저장`
- 저장된 프리셋에서 `불러오기` / `삭제`
- 같은 이름 프리셋 중복 저장 허용

### 3) Recent Analyses

- Analyze 실행 후 결과 source와 요약 정보가 최근 기록에 저장
- 목록에서 `불러오기` 시 formState만 채움
- 개별 삭제 및 전체 삭제 지원

### 4) Database

- import된 solution 목록 탐색/필터/상세 보기
- Detail 패널에서 `이 spot으로 Analyze 채우기` 실행 가능
- Analyze 탭으로 이동하여 해당 spot 기반 formState를 채움 (자동 실행 없음)

### 5) Import

- 최신 리포트 요약 확인:
  - `latest-import-report.json`
  - `latest-verification-report.json`
  - `latest-canonical-key-report.json`

## localStorage 키

- Analyze Presets:
  - `poker-tournament-lab:analyze-presets:v1`
- Recent Analyses:
  - `poker-tournament-lab:recent-analyses:v1`

손상된 localStorage 데이터는 안전하게 빈 상태로 처리합니다.

## 제한 사항 / 비범위

- v1.2도 학습/리뷰용 도구이며, 실시간 보조(RTA/live) 기능은 제공하지 않습니다.
- 다음 기능은 범위 외:
  - nearest match recommendation
  - Nash approximation
  - PKO/bounty/satellite 특수 로직
  - postflop solver
  - OCR/screen capture/overlay/hotkey/live watcher

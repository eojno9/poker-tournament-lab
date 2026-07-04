# poker-tournament-lab

`poker-tournament-lab`은 오프테이블 학습용 포커 토너먼트 분석 로컬 웹앱입니다.

## v1.1 개요

- `HRC_PRECOMPUTED_DB`: import된 HRC 데이터에서 **exact canonical key 매칭** 결과를 반환합니다.
- `FALLBACK_ICM`: exact 매칭이 없고 fallback 입력이 완전할 때, **ICM EV 평가**를 반환합니다.
- `NOT_SOLVED`: exact 매칭이 없고 fallback 입력도 불완전하면 반환합니다. 추측/휴리스틱 추천은 하지 않습니다.
- 지원 범위: regular NLHE tournament push/fold 학습.
- 비지원 범위: PKO, bounty, satellite 특수 로직, Nash solver, nearest match 추천, postflop solver, OCR, overlay, hotkey, live watcher, RTA/live assistance.

## 실행 방법 (Windows PowerShell)

이 워크스페이스에서는 `npm.ps1` 대신 `npm.cmd`를 사용합니다.

```powershell
npm.cmd install
npm.cmd run dev
```

- API + Web 개발 서버가 함께 실행됩니다.
- 기본 접속: `http://127.0.0.1:5173`

원클릭 실행(Windows):

```powershell
.\run-all.cmd
```

## 검증/빌드 명령

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run test:smoke
```

Playwright 최초 1회 브라우저 설치:

```powershell
npm.cmd exec playwright install chromium
```

## 화면별 사용 가이드

## 1) Import 화면

1. `format(json/csv)`, `source label`, `file name`, `content`를 입력하거나 파일을 업로드합니다.
2. `Import 저장`을 실행합니다.
3. 저장 후 Import 리포트 요약 카드에서 최신 결과를 확인합니다.

## 2) Analyze 화면 (Form 모드)

1. 남은 인원(2~10), hero position, blind/ante, 스택, payout, action path를 입력합니다.
2. villain calling range preset(`tight/standard/loose/custom`)을 설정합니다.
3. `Analyze 실행`을 누르면 `/api/analyze` 요청이 실행됩니다.
4. 필요하면 `고급 JSON 입력` 모드에서 요청 payload를 직접 편집할 수 있습니다.

## 3) Database 화면

- import된 solution 목록/상세를 조회할 수 있습니다.
- hero position, table size, stack range, tree config, source file, canonical key로 필터링할 수 있습니다.
- detail 패널에서 canonical key, spot 요약, source metadata, strategy matrix를 확인합니다.

## Result source enum 설명

- `HRC_PRECOMPUTED_DB`
  - HRC 사전 계산 DB 정확 매칭 결과
  - exact canonical key 일치 시에만 사용
- `FALLBACK_ICM`
  - fallback ICM EV 평가 결과
  - Nash solver 결과가 아님
  - villain range 가정 입력 기반
- `NOT_SOLVED`
  - DB exact 매칭 없음 + fallback 입력 미충족
  - missing requirements를 안내

## Import 리포트 해석

최신 리포트 파일:

- `artifacts/latest-import-report.json`
- `artifacts/latest-verification-report.json`
- `artifacts/latest-canonical-key-report.json`

Import 화면 요약 카드에서 확인할 항목:

- import report
  - imported files / skipped files / discarded hrcz files
  - imported records / failed records / warnings
  - skipped 사유, discarded 목록
- verification report
  - exact lookup 성공률
  - random lookup 성공률
  - duplicate canonical key count
  - near-match HRC 오탐 수
- canonical key report
  - mismatch count / updated count / collision count / invalid count

상태 배지:

- `정상`
- `주의 필요`
- `실패 있음`
- `검증 리포트 없음`

## fallback ICM 한계

- fallback은 Nash equilibrium solver가 아닙니다.
- 입력된 villain calling range preset/override 가정에 따라 EV를 평가합니다.
- 결과 해석 시 assumptions / limitations를 반드시 함께 확인하세요.

## 정책 메모

- `.hrcz` 파일은 import 대상에서 제외(discard)됩니다.
- exact match 정책은 nearest/유사 매칭을 허용하지 않습니다.
- 본 프로젝트는 학습/분석용 오프테이블 도구이며, 실시간 플레이 보조 기능(RTA/live)은 포함하지 않습니다.

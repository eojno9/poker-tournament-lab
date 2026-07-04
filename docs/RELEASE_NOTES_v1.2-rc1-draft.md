# RELEASE NOTES (Draft): v1.2-rc1

## 요약
v1.2는 계산 엔진을 바꾸지 않고 Analyze 사용성 개선에 집중한 릴리즈 후보입니다.

## 핵심 변경사항

1. Analyze Presets
- Analyze form 입력값 저장/불러오기/삭제
- localStorage 기반 1차 구현

2. Recent Analyses
- Analyze 실행 결과를 최근 20개까지 저장
- source 정보(HRC_PRECOMPUTED_DB / FALLBACK_ICM / NOT_SOLVED)와 요약 정보 표시
- 불러오기/삭제/전체 삭제 지원

3. Database -> Analyze
- Database Detail에서 `이 spot으로 Analyze 채우기` 제공
- Analyze 탭으로 이동 후 formState만 채움
- 자동 Analyze 실행 없음

4. Analyze Form validation UX
- remaining players(2~10), blinds/ante/pot, stack, payout, action path 검증 강화
- 한국어 validation 메시지로 사전 안내

## 품질 검증
- `npm.cmd run test`: PASS
- `npm.cmd run build`: PASS
- `npm.cmd run test:smoke`: PASS

## 비기능/정책 확인
- DB/API/fallback/solver 계산 로직 변경 없음
- exact lookup 정책 변경 없음
- RTA/live 관련 기능 없음

## 참고
- 본 문서는 태그 생성 전 초안입니다.

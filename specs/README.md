# Specs — 스펙 인덱스 (SDD)

모든 기능은 **스펙 먼저**(Spec-Driven Development). 코드를 짜기 전에 여기 스펙 문서를 만들고, 그 수용 기준을 **테스트로 먼저 작성**(TDD)한 뒤 구현한다.

## 디렉터리 (상태 = 위치)

```
specs/
  _template.md     # 새 스펙은 이걸 복사해서 시작
  not-started/     # 작성됨, 구현 전
  in-progress/     # 구현 중 (테스트 먼저 → 통과)
  in-review/       # 구현·검증 완료, 리뷰 대기
  completed/       # 리뷰 통과
```

상태 전환은 **파일 이동**으로 표현한다. 파일명: `NNNN-kebab-title.md` (NNNN = 0001부터).

## 워크플로 (SDD + TDD, 필수)

1. **Spec**: `_template.md` 복사 → `not-started/NNNN-*.md`. 목표·비목표·사용자 흐름·**수용 기준(테스트 가능한 형태)**·테스트 계획 작성. 모호하면 가정 나열 후 질문(추측 금지).
2. **Red**: 구현 전, 수용 기준을 **실패하는 테스트**로 작성. 스펙을 `in-progress/`로 이동.
3. **Green**: 테스트를 통과시키는 **최소 구현**. 투기적 추가 금지.
4. **Refactor**: 테스트 그린 유지하며 정리.
5. **Review**: `pnpm -r typecheck && pnpm -r build && pnpm -r test` 통과 → `in-review/`로 이동, QA/리뷰 인계. 통과하면 `completed/`.

이 표는 인덱스다. 스펙을 추가·이동·삭제하면 즉시 맞춘다.

| ID | 제목 | 상태 | 생성일 | 파일 |
|----|------|------|--------|------|
| –  | (아직 없음) | – | – | – |

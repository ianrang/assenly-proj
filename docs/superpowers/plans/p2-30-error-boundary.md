# P2-30: 에러 바운더리 + 에러 화면

> 작성일: 2026-03-30
> 근거: user-screens.md §2.1, PRD §3.9, sitemap.md §1, accessibility.md §3.3/§4
> 선행: 없음

---

## 1. 목적

Next.js App Router의 에러 바운더리(error.tsx)와 404 페이지(not-found.tsx)를 구현한다. Full-page 에러 패턴만 담당. Toast(Sonner)와 Inline 에러는 각 페이지 태스크에서 처리.

---

## 2. 산출물

| # | 파일 | 신규/수정 | 설명 |
|---|------|----------|------|
| 1 | `src/app/(user)/[locale]/error.tsx` | 신규 | 라우트 에러 바운더리. `"use client"` 필수 (Next.js 규약) |
| 2 | `src/app/(user)/[locale]/not-found.tsx` | 신규 | 404 페이지 |
| 3 | `messages/en.json` | 수정 | 에러 텍스트 키 추가 |

---

## 3. 수정하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/server/**` | P-2 core 불변. 에러 UI는 클라이언트 전용 |
| `src/client/ui/**` | shadcn 불필요 (TODO 명시) |
| `src/client/features/**` | 에러 화면은 app/ 레벨 |
| `src/app/layout.tsx` | Toaster 이미 설치됨 (P2-29) |
| `src/app/globals.css` | 기존 토큰으로 충분 |

---

## 4. 구현 상세

### 4.1 error.tsx

```typescript
"use client";

// Next.js error boundary — props: error, reset
// - error.message 표시 (개발 환경에서만 상세, 프로덕션은 일반 메시지)
// - reset() 호출 재시도 버튼
// - role="alert" (접근성: 즉시 스크린 리더 알림)
// - 랜딩 페이지 링크
// - Tailwind 기본=모바일, 디자인 토큰 사용
```

**에러 화면 구성:**
- 제목: "Something went wrong"
- 설명: 일반 에러 메시지
- 재시도 버튼: `reset()` 호출 (44px 터치 타겟)
- 홈 링크: `/[locale]/` 이동

### 4.2 not-found.tsx

```typescript
// 404 page — Server Component (가능)
// - 제목: "Page not found"
// - 홈 링크: 랜딩 페이지 이동
// - 디자인 토큰 사용, 최소 마크업
```

### 4.3 messages/en.json 확장

```json
"error": {
  "title": "Something went wrong",
  "description": "An unexpected error occurred. Please try again.",
  "retry": "Try again",
  "home": "Back to home",
  "notFoundTitle": "Page not found",
  "notFoundDescription": "The page you're looking for doesn't exist or has been moved."
}
```

> 기존 `common.error`와 `common.retry`는 컴포넌트 내 인라인 에러용으로 유지. `error.*` 키는 Full-page 에러 전용.

---

## 5. 접근성 (WCAG 2.1 AA)

| 요구사항 | 구현 |
|----------|------|
| 즉시 알림 | error.tsx: `role="alert"` |
| 포커스 이동 | 에러 표시 시 제목으로 포커스 (`autoFocus` 또는 `ref.focus()`) |
| 키보드 | 재시도 버튼 Tab 접근 + Enter 활성화 |
| 터치 타겟 | 버튼 44px 이상 |

---

## 6. 검증 체크리스트

```
□ V-1  의존성 방향: app/ 파일. import 없음 (독립)
□ V-2  core 불변: server/ 수정 0건
□ V-17 제거 안전성: error.tsx 삭제 시 Next.js 기본 폴백
□ S-5  하드코딩 금지: #hex 직접 기입 없음
□ L-12 모바일 퍼스트: Tailwind 기본=모바일
□ G-8  any 타입 없음
□ 접근성: role="alert", 포커스 이동
```

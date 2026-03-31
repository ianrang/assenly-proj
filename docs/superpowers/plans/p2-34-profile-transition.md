# P2-34: 프로필 전환/확인 화면

## 목표

온보딩 제출 후 로딩 애니메이션 + 프로필 확인 카드 표시.

## 정본

- PRD §3.3 (ProfileTransition 와이어프레임, Profile Confirm 와이어프레임)
- user-screens.md §4.3 (ProfileTransition), §5 (Profile)
- GET /api/profile 응답 스키마 (profile.ts)

## 범위

| 포함 | 제외 |
|------|------|
| ProfileTransition 로딩 애니메이션 (3단계 체크) | DV 표시 (API 미제공, MVP: DV-4 미구현) |
| OnboardingWizard 통합 (제출 중 → Transition → 이동) | 재방문 ProfileConfirm 오버레이 (ReturnVisitBanner가 대체) |
| profile/page.tsx (GET /api/profile + ProfileCard 렌더링) | 프로필 수정 모드 (P2-41) |
| Edit/ShowPicks 네비게이션 버튼 | |

## 파일 계획

| 파일 | 작업 | 계층 |
|------|------|------|
| `features/onboarding/ProfileTransition.tsx` | 스텁 → 로딩 애니메이션 구현 | client/features/onboarding/ |
| `features/onboarding/OnboardingWizard.tsx` | 제출 성공 시 ProfileTransition 표시 후 이동 | client/features/onboarding/ |
| `features/profile/ProfileCard.tsx` | **신규** — 프로필 데이터 카드 | client/features/profile/ |
| `features/profile/ProfileClient.tsx` | **신규** — GET /api/profile + 상태 관리 | client/features/profile/ |
| `app/(user)/[locale]/(app)/profile/page.tsx` | 스텁 → ProfileClient 렌더링 | app/ |
| `messages/en.json` | 번역 키 추가 (transition 단계, 프로필 라벨) | — |

## 의존성 방향

```
app/profile/page.tsx → features/profile/ProfileClient.tsx
  → features/profile/ProfileCard.tsx
    → ui/primitives/button.tsx, typography.tsx
    → shared/types/profile.ts
    → shared/constants/beauty.ts

features/onboarding/OnboardingWizard.tsx → features/onboarding/ProfileTransition.tsx
  → ui/primitives/typography.tsx
```

역방향 없음. core/ 수정 없음. profile/ → onboarding/ 참조 없음.

## 컴포넌트 설계

### ProfileTransition

- props: `onComplete: () => void`
- 3단계 체크마크 애니메이션 (600ms 간격)
- 완료 시 onComplete 콜백 호출
- 디자인: 중앙 정렬, 스피너 없이 체크마크 순차 등장

### OnboardingWizard 통합

- 기존 `handleSubmit`: API 성공 → 바로 router.push
- 변경: API 성공 → `showTransition=true` → ProfileTransition 렌더 → onComplete에서 router.push

### ProfileClient

- useEffect로 GET /api/profile 호출
- 200: ProfileCard 렌더링
- 404: `/onboarding`으로 리다이렉트
- 로딩: Skeleton

### ProfileCard

- UP 변수: skin_type, hair_type, hair_concerns, country, age_range
- JC 변수: skin_concerns, interest_activities, stay_days, budget_level, travel_style
- DV 영역: MVP 비표시 (API 미제공). 향후 추가 시 ProfileCard에 섹션 추가만으로 대응
- 하단: Edit(→ /onboarding) + Show my picks(→ /chat) 버튼

## 디자인 일관성

| 요소 | 프리미티브 |
|------|-----------|
| Edit 버튼 | `<Button variant="outline" size="cta">` |
| Show my picks 버튼 | `<Button size="cta">` |
| 프로필 라벨 | `<CardTitle>` (typography.tsx) |
| 프로필 값 | `text-sm text-foreground` |
| 카드 컨테이너 | `rounded-xl border border-border bg-card p-5` |
| Transition 텍스트 | `<SectionTitle>`, `<BodyText>` |
| Skeleton | `<Skeleton>` (primitives/skeleton.tsx) |

## 검증 체크리스트

- [ ] V-1: import DAG 준수
- [ ] V-2: core/ 수정 없음
- [ ] V-4: features 간 직접 호출 없음 (profile/ → onboarding/ 없음)
- [ ] V-13: 디자인 토큰만
- [ ] V-17: features/profile/ 삭제 시 빌드 에러 없음
- [ ] L-0b: "use client" + "client-only"
- [ ] S-5: Button 프리미티브 사용
- [ ] G-5: 온보딩과 동일 패턴

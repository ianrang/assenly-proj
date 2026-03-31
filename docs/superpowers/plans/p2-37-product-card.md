# P2-37: ProductCard 컴포넌트

## 목표

tool-result의 제품 데이터를 시각적 카드로 렌더링.

## 정본

- user-screens.md §1.3 (필드 매핑, 상태)
- PRD §3.5 (카드 UI 요구사항)
- design-preview.html (디자인 토큰, 레이아웃)

## 파일

| 파일 | 작업 |
|------|------|
| `features/cards/ProductCard.tsx` | 스텁 → 구현 |

## Props

- product: Product (shared/types/domain)
- brand: { name: LocalizedText } | null
- store: { name: LocalizedText; map_url?: string } | null
- whyRecommended: string (LLM 생성 추천 이유)
- locale: string
- skeleton: boolean (로딩 상태)

## 상태

| 상태 | 조건 | UI |
|------|------|-----|
| skeleton | skeleton=true | Skeleton 프리미티브 |
| normal | 데이터 있음 | 전체 렌더링 |
| highlighted | is_highlighted+badge | normal + HighlightBadge + border-primary |
| image-error | images 없음/로딩 실패 | surface-warm 배경 폴백 |

## 디자인 (design-preview.html 정본)

- 컨테이너: rounded-xl, border-border, bg-card, overflow-hidden, hover:border-primary
- 이미지: h-40, bg-surface-warm, relative (HighlightBadge absolute top-2 left-2)
- 브랜드: text-xs text-muted-foreground
- 제품명: text-sm font-semibold
- 가격: text-base font-bold text-primary
- 추천 이유: text-xs text-muted-foreground
- 태그: flex flex-wrap gap-1.5
- 매장명: text-[10px] text-muted-foreground

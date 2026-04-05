# P2-68: store map_url E2E 검증

> Date: 2026-04-05
> Status: Completed (2026-04-05)
> Dependency: P2-64a (완료), P2-64c-1 (product_stores 9,900건, 완료)
> Scope: 검증 태스크 — 기존 코드 수정 없음. 테스트 보강만.

---

## 1. 목적

store external_links → card-mapper extractMapUrl → ProductCard 지도 링크의 **전체 데이터 경로가 정상 동작하는지** 검증한다.

---

## 2. 검증 대상 경로

```
① DB stores.external_links (jsonb)
  ↓ buildExternalLinks(): placeUrl → [{type:"kakao_map", url}]
② loadRelatedStores(): product_stores JOIN stores → external_links 포함 SELECT
  ↓ search-handler: stores 배열을 card에 포함
③ card-mapper extractMapUrl(): external_links → map_url 추출
  ↓ ProductCardPart.store.map_url
④ ProductCard: map_url → <a href> 클릭 링크
```

---

## 3. 현재 테스트 커버리지 분석

### 이미 검증된 경로

| 단계 | 테스트 | 파일 | 커버리지 |
|------|--------|------|----------|
| ③ extractMapUrl | kakao_map → URL 추출 | card-mapper.test.ts:304-333 | ✅ |
| ③ extractMapUrl | map 타입 없음 → undefined | card-mapper.test.ts:335-363 | ✅ |
| ③ extractMapUrl | null → undefined | card-mapper.test.ts:365-393 | ✅ |
| ② loadRelatedStores | english_support 필터 | search-handler.test.ts:459-492 | ✅ |
| ④ ProductCard | store map_url → 링크 렌더링 | card-mapper.test.ts:112-125 (간접) | △ 간접 |

### 미검증 경로 (테스트 보강 필요)

| 단계 | 누락 | 설명 |
|------|------|------|
| ④ ProductCard | **store map_url 렌더링 직접 테스트** | card-mapper 테스트에서 간접 검증만. ProductCard 컴포넌트 테스트에 store 렌더링 케이스 없음 |
| ④ ProductCard | **store map_url 없을 때 plain text 렌더링** | map_url undefined → 링크 아닌 텍스트 |

---

## 4. 작업 범위

**코드 수정: 0건** — 모든 구현이 완료된 상태.

**테스트 추가: ProductCard.test.tsx에 store 렌더링 테스트 3건**

| # | 케이스 | 검증 대상 |
|---|--------|----------|
| T-1 | store with map_url | 매장명이 클릭 링크로 렌더링 + href 정확성 + target="_blank" |
| T-2 | store without map_url | 매장명이 plain text로 렌더링 (링크 아님) |
| T-3 | store 없음 (null/undefined) | store 영역 미렌더링 |

---

## 5. 수정하지 않는 것

| 파일 | 이유 |
|------|------|
| `card-mapper.ts` | extractMapUrl 이미 구현+테스트됨 |
| `search-handler.ts` | loadRelatedStores 이미 구현+테스트됨 |
| `ProductCard.tsx` | store 렌더링 이미 구현됨 (line 103-119) |
| `enrich-service.ts` | buildExternalLinks 이미 구현됨 |
| migration 010 | 이미 적용됨 |

---

## 6. 규칙 검증

```
✅ V-2  core 불변: 수정 없음
✅ G-4  미사용 코드 금지: 테스트만 추가
✅ P-7  단일 변경점: ProductCard.test.tsx 1파일
✅ V-17 제거 안전성: 테스트 삭제해도 프로덕션 코드 무영향
```

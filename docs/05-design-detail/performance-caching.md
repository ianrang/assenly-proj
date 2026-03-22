# 성능 목표 + 캐싱 전략 — P1-47 / P1-48

> 버전: 1.0
> 작성일: 2026-03-22
> 근거: TDD §4 PoC 결과, search-engine.md, api-spec.md §4, data-pipeline.md §5
> 원칙: MVP 최소 캐싱. 측정 후 확장.
> 범위: 인프라 캐싱만 (DB 쿼리, DV, 이미지, 정적 페이지). LLM 응답 캐싱(P1-57)은 data-pipeline.md §5 소관.

---

## 1. 성능 기준 (P1-47)

### 1.1 엔드포인트별 SLA

| 구분 | 대상 | 목표 | PoC Baseline | 측정 시점 |
|------|------|------|-------------|----------|
| 페이지 로드 | Landing (SSG) | ≤ 2s | - | Phase 3 P3-12 |
| 페이지 로드 | Chat (CSR) | ≤ 3s | - | Phase 3 P3-12 |
| API | `GET /api/products` | ≤ 200ms | - | Phase 3 P3-13 |
| API | `GET /api/products/:id` | ≤ 100ms | - | Phase 3 P3-13 |
| API | `GET /api/admin/*` (목록) | ≤ 300ms | - | Phase 3 P3-13 |
| Chat | `POST /api/chat` TTFT (텍스트) | ≤ 1.5s | 719~989ms | Phase 3 P3-14 |
| Chat | `POST /api/chat` TTFT (tool) | ≤ 3s | 1,802~1,910ms | Phase 3 P3-14 |
| 검색 | SQL 필터 (findByFilters) | ≤ 100ms | 42~76ms | Phase 3 P3-13 |
| 검색 | 벡터 검색 (matchByVector) | ≤ 200ms | - (MVP sequential) | Phase 3 P3-13 |

> PoC baseline: TDD §4.1~4.2 참조. Gemini 2.0 Flash 기준 측정값.
> 프로덕션(Claude Sonnet)에서는 TTFT가 다를 수 있으므로 Phase 3에서 재측정.

### 1.2 MVP 성능 전략

| 전략 | 적용 | 효과 |
|------|------|------|
| SSG (Landing) | 빌드 시 정적 생성 | 페이지 로드 ~200ms (CDN edge) |
| SSE 스트리밍 | Chat API | 체감 지연 최소화 (TTFT만 대기) |
| GIN 인덱스 | 배열 필터 (skin_types, concerns) | SQL <100ms 보장 |
| PK 인덱스 | 상세 조회 (findById) | ~5ms |
| LIMIT 5 | AI tool 검색 | 결과 세트 최소화 |
| 페이지네이션 | 관리자 목록 | OFFSET + LIMIT 20 |

---

## 2. 캐싱 전략 (P1-48)

### 2.1 MVP 캐싱 범위

| 대상 | 캐시? | 근거 |
|------|-------|------|
| **이미지** (Supabase Storage) | ✅ CDN | Supabase Storage = 자동 CDN + Cache-Control |
| **Landing 페이지** | ✅ SSG + edge | 빌드 시 생성, Vercel CDN에서 서빙 |
| **정적 에셋** (JS/CSS/폰트) | ✅ Vercel CDN | Next.js 자동 해싱 + 불변 캐시 |
| DV 계산 결과 | ❌ 안 함 | 순수 함수 <5ms. 캐시 관리 비용 > 절감 효과 |
| 검색 결과 (findByFilters) | ❌ 안 함 | 개인화 변수 조합으로 히트율 극히 낮음 |
| 카드 상세 (findById) | ❌ 안 함 | PK 쿼리 ~5ms. MVP 규모에서 불필요 |
| LLM 응답 | ❌ 안 함 | data-pipeline.md §5에서 결정: "(a) 캐싱 안 함" |
| Rate limit 카운터 | Memory Map | api-spec §4.2에서 확정 (본 문서 범위 외). 만료 엔트리 GC: 윈도우(1분/1일) 경과 시 lazy delete |
| 임베딩 벡터 | ❌ 안 함 | P1-39 소관 |

### 2.2 이미지 CDN

**Supabase Storage 기본 동작:**
- public 버킷: 인증 없이 접근 가능
- URL 패턴: `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`
- Cache-Control: Supabase 기본 `public, max-age=3600` (1시간)

**Vercel Image Optimization (선택):**
- `next/image` 컴포넌트 사용 시 자동 WebP 변환 + 리사이즈
- MVP: Supabase CDN 직접 사용. `next/image`는 Phase 2에서 적용 검토

**관리자 이미지 업로드/삭제 시:**
- Supabase Storage가 CDN 캐시 자동 무효화
- 별도 purge 로직 불필요

### 2.3 정적 페이지 캐시

| 페이지 | 렌더링 | 캐시 전략 |
|--------|--------|----------|
| Landing (`/[locale]`) | SSG (빌드 시) | Vercel edge CDN, 재배포 시 갱신 |
| Onboarding | CSR | 캐시 없음 (동적 폼) |
| Chat | CSR | 캐시 없음 (실시간 스트리밍) |
| Profile | CSR | 캐시 없음 (사용자 데이터) |
| Admin 전체 | CSR | 캐시 없음 (CRUD 동적) |

### 2.4 v0.2 캐싱 로드맵

| 조건 | 추가 캐시 | 구현 |
|------|----------|------|
| 제품 데이터 1,000건+ | 카드 상세 (findById) TTL 10분 | Memory Map → v0.2 Redis |
| 동시 사용자 50+ | DV 계산 결과 TTL 30분 | 프로필 변경 시 무효화 |
| 다중 Vercel 인스턴스 | 모든 캐시를 Upstash Redis로 이관 | V2-3 |
| 관리자 목록 지연 >300ms | 목록 카운트 캐시 | Supabase materialized view |

---

## 3. 캐시 무효화 (P1-48)

### 3.1 MVP 무효화

MVP에서 애플리케이션 레벨 캐시가 없으므로 무효화 로직도 불필요.

| 이벤트 | 영향 | MVP 처리 |
|--------|------|---------|
| 관리자 데이터 CRUD | DB 즉시 반영 | 캐시 없음 → 무효화 불필요 |
| 이미지 업로드/삭제 | CDN 갱신 필요 | Supabase 자동 처리 |
| 사용자 프로필 변경 | DV 재계산 필요 | 캐시 없음 → 매번 재계산 |
| 재배포 | 정적 페이지 갱신 | Vercel 자동 처리 |

### 3.2 v0.2 무효화 규칙

v0.2에서 캐시 도입 시 적용할 규칙 (사전 설계):

| 트리거 | 무효화 대상 | 방법 |
|--------|-----------|------|
| `PUT /api/admin/products/:id` | 해당 product 캐시 | Redis DEL `product:{id}` |
| `DELETE /api/admin/products/:id` | 해당 product 캐시 | Redis DEL `product:{id}` |
| `PUT /api/profile` | 해당 user DV 캐시 | Redis DEL `dv:{userId}` |
| `POST /api/admin/relations/*` | 관련 엔티티 캐시 | 양쪽 엔티티 DEL |

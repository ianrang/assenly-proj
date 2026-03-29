# P2-56e2: 웹 스크래퍼 프로바이더 (Channel A-3)

## Context

Playwright 헤드리스 브라우저로 브랜드 공식 사이트(1순위) + 올리브영 글로벌(2순위 보조)에서 products 기본 정보를 수집하는 프로바이더.
쿠팡 파트너스(P2-56e) MVP 제외로 **products 자동 수집의 유일한 경로**.

**선행 완료**: P2-56b (config ✅), P2-56c (types ✅), P2-V7 (올리브영 약관 ✅)

---

## 설계 결정

### D-1. 엔진(web-scraper.ts) + 설정(site-configs.ts) 분리

- web-scraper.ts: Playwright 제어, Crawl-delay, RawRecord 변환, dedup — **공통 엔진**
- site-configs.ts: 사이트별 URL, CSS selector — **순수 데이터 (코드 0)**
- 새 사이트 추가 = site-configs.ts 1개 항목 추가 (P-7)
- 비표준 사이트용 customExtractor optional 함수 지원

### D-2. source 분리 (브랜드 vs 올리브영)

- `"scraper-brand"`: 브랜드 공식 사이트 — Stage 4 바로 적재 가능
- `"scraper-oliveyoung"`: 올리브영 글로벌 — Stage 3 수동검수 필수 (약관 제14조②)
- SiteConfig.source로 지정 → 프로바이더가 RawRecord.source에 반영

### D-3. sourceId = 제품 URL

- 사이트 내 유니크, dedup 효과적
- 다른 프로바이더 sourceId와 형식 다름 (URL vs 이름) — source 값으로 구분

### D-4. entityType = "product"

products 수집 전용.

### D-5. Playwright 의존성

`playwright` 패키지를 dependencies에 추가 (Q-9 exact version).
CLI 실행(`npx tsx`)에서 사용. devDependencies의 `@playwright/test`와 별도.

### D-6. Crawl-delay 5초

설계 문서 명시. 상수 CRAWL_DELAY_MS = 5000 (G-10).

### D-7. 관리자 앱 이동 가능 구조

현재: scripts/seed/lib/providers/ (CLI)
후속: server/features/pipeline/providers/ (관리자 앱 통합 시 이동)
상대 경로 의존으로 디렉토리 이동 시 코드 변경 최소.

---

## 파일 목록

### 신규 (3개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/providers/web-scraper.ts` | 크롤링 엔진 |
| `scripts/seed/lib/providers/site-configs.ts` | 사이트별 설정 (순수 데이터) |
| `scripts/seed/lib/providers/web-scraper.test.ts` | 단위 테스트 |

### 수정 (1개)

| 파일 | 변경 |
|------|------|
| `package.json` | `playwright` exact version 추가 |

### 수정 없음

config.ts, types.ts, retry.ts, 기존 프로바이더 전체 — 독립.

---

## 코드 구조

### site-configs.ts (순수 데이터)

```typescript
// 사이트별 크롤링 설정 — 순수 데이터, 코드 없음

export interface SiteFieldSelectors {
  name: string;
  price?: string;
  category?: string;
  imageUrl?: string;
  description?: string;
}

export interface SiteConfig {
  name: string;
  baseUrl: string;
  productListUrl: string;
  selectors: {
    productLink: string;
    fields: SiteFieldSelectors;
  };
  source: "scraper-brand" | "scraper-oliveyoung";
}

export const SITE_CONFIGS: SiteConfig[] = [
  // MVP 브랜드 사이트 (P2-V7 robots.txt 허용 확인)
  // 실제 selector는 크롤링 시 확인 후 채움
  // 관리자가 site-configs에 추가하여 확장
];
```

### web-scraper.ts (엔진)

```typescript
import { chromium, type Page } from "playwright";
import { SITE_CONFIGS, type SiteConfig } from "./site-configs";
import type { RawRecord } from "../types";

const CRAWL_DELAY_MS = 5000;

export function mapPageDataToRawRecord(
  data: Record<string, string>,
  url: string,
  source: string,
): RawRecord { ... }

export async function scrapeProducts(
  configs?: SiteConfig[],
): Promise<RawRecord[]> {
  // configs 미전달 시 SITE_CONFIGS 기본 사용
  // Playwright 브라우저 실행 → 사이트별 순회 → Crawl-delay → RawRecord[] 반환
}
```

---

## 의존 방향

```
web-scraper.ts → site-configs.ts (SiteConfig — 순수 데이터)
              → types.ts        (RawRecord — type import)
              → playwright      (외부 라이브러리)

site-configs.ts → (의존 없음 — 순수 타입 + 데이터)
```

config.ts 미사용 (사이트 설정은 site-configs.ts, API 키 불필요).
retry.ts 미사용 (Playwright는 자체 타임아웃, HTTP retry 불필요).
기존 프로바이더와 병렬. 서로 import 없음. 역방향·순환 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-5 | CLI → scrapeProducts → Playwright. **2단계** |
| P-7 | site-configs.ts = 사이트 설정 단일 변경점 |
| P-8 | 단방향. 순환 없음 |
| P-9 | scripts/ 내부. server/ import 없음 |
| P-10 | 삭제해도 core/, features/ 빌드 에러 없음 |
| G-3 | Playwright 제어 + DOM 추출 + RawRecord 변환 (패스스루 아님) |
| G-5 | 기존 프로바이더 패턴: export 매핑함수 + 메인함수, dedup Map |
| G-8 | any 없음 |
| G-9 | export 3개: mapPageDataToRawRecord, scrapeProducts, SITE_CONFIGS |
| G-10 | CRAWL_DELAY_MS, SITE_CONFIGS 상수 |
| L-14 | scripts/seed/lib/providers/ |
| N-2 | web-scraper.ts, site-configs.ts (kebab-case) |
| Q-9 | playwright exact version |

---

## 테스트 계획

Playwright mock으로 실제 브라우저/네트워크 없이 테스트.

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | mapPageDataToRawRecord 정상 변환 | source, sourceId(URL), entityType="product", data, fetchedAt |
| 2 | sourceId = 제품 URL | URL 형식 |
| 3 | source — "scraper-brand" / "scraper-oliveyoung" | SiteConfig.source 반영 |
| 4 | data에 원본 전체 보존 | name, price, category, imageUrl, description |
| 5 | fetchedAt ISO 8601 | 정규식 |
| 6 | scrapeProducts — Playwright mock 호출 | browser.launch, page.goto |
| 7 | Crawl-delay 준수 | setTimeout mock 호출 검증 |
| 8 | sourceId(URL) dedup | 동일 URL 중복 제거 |
| 9 | 빈 sourceId skip | URL 없는 결과 |
| 10 | 빈 설정 → 빈 배열 | SITE_CONFIGS = [] |
| 11 | 사이트 에러 시 해당 사이트만 skip | try-catch per site |
| 12 | configs 파라미터로 커스텀 설정 전달 | 기본 SITE_CONFIGS 오버라이드 |

---

## 검증 체크리스트

```
□ V-1  의존성 DAG 위반 없음
□ V-2  core/ 수정 없음
□ V-9  기존 코드와 중복 없음
□ V-10 미사용 export 없음
□ V-12 any 타입 없음
□ V-17 제거 안전성
□ V-18 scripts/ 의존 방향 준수
□ 테스트 전체 통과
□ npx tsc --noEmit scripts/ 에러 0건
```

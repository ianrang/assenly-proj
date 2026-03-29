# P2-56g: 식약처 사용제한 프로바이더 (S4)

## Context

식약처 화장품 사용제한 원료정보 API(S4)를 호출하여 ingredients 안전성 보강 데이터를 수집하는 프로바이더.
S3 레코드에 대한 LEFT JOIN enrichment. 단독 레코드 생성하지 않음.
ingredients 3원 소스(S3→S6→S4) 중 **3순위 안전성 소스**.

**선행 완료**: P2-56f (S3 mfds-ingredient ✅), P2-V2 (API 호출 검증 ✅)

---

## 설계 결정

### D-1. 전체 다운로드 + 기술적 dedup만 (비즈니스 필터링 없음)

프로바이더는 raw 데이터 수집만. 기존 4개 프로바이더와 동일 패턴.
- 31,191건 전체 다운로드 (국가별 중복 포함)
- 국가별 레코드 모두 보존 (6개국 서비스 — 한국뿐 아니라 모든 국가 규정이 참고 정보)
- REGULATE_TYPE 필터링, 한국/EU 우선 가중치 → Stage 2~3 담당 (프로바이더 범위 밖)

### D-2. sourceId = 복합키 (INGR_ENG_NAME:COUNTRY_NAME)

- 동일 성분의 국가별 규정을 **모두 보존**해야 함
- INGR_ENG_NAME 단일키면 국가별 정보 손실
- 복합키로 기술적 dedup (동일 성분+동일 국가 중복만 제거)
- RawRecord.sourceId는 string 타입 — 형식 제한 없음

### D-3. mfds-ingredient.ts 패턴 그대로

동일 공공데이터포털 API:
- 동일 MFDS_SERVICE_KEY 사용
- 동일 fetchWithRetry 재사용
- 동일 페이지네이션 구조 (pageNo, numOfRows, totalCount)
- 동일 items 구조 방어 ({ item: [...] } 또는 직접 배열)
- 엔드포인트/필드 매핑/source만 다름

### D-4. 기본 조회 API만 (배합금지국가 API 미사용)

- 기본 조회 API에 COUNTRY_NAME 필드 이미 포함
- 배합금지국가 API 응답 필드가 설계 문서에 미정의
- MVP 범위: 기본 조회 API만

### D-5. config.ts 수정 없음

MFDS_SERVICE_KEY 이미 정의 (S3/S4/S5 공유).

---

## API 사양 (P2-V2 검증 완료)

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET https://apis.data.go.kr/1471000/CsmtcsUseRstrcInfoService/getCsmtcsUseRstrcInfoService` |
| 인증 | `serviceKey` (S3과 동일 MFDS_SERVICE_KEY) |
| 전체 건수 | 31,191건 (국가별 중복 포함) |
| 필터 제한 | REGULATE_TYPE 파라미터 미작동 (P2-V2) → 전체 다운로드 |
| 응답 필드 | REGULATE_TYPE, INGR_STD_NAME, INGR_ENG_NAME, CAS_NO, COUNTRY_NAME, LIMIT_COND 등 |

---

## 파일 목록

### 신규 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/providers/mfds-restricted.ts` | S4 프로바이더 |
| `scripts/seed/lib/providers/mfds-restricted.test.ts` | 단위 테스트 |

### 수정 없음

config.ts, types.ts, retry.ts, mfds-ingredient.ts, cosing-csv.ts, csv-loader.ts — 모두 독립.

---

## 코드 구조

```typescript
// scripts/seed/lib/providers/mfds-restricted.ts

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../retry";
import type { RawRecord } from "../types";

const PAGE_SIZE = 100;
const MFDS_RESTRICTED_ENDPOINT =
  "https://apis.data.go.kr/1471000/CsmtcsUseRstrcInfoService/getCsmtcsUseRstrcInfoService";

export function mapItemToRawRecord(item: Record<string, unknown>): RawRecord {
  const engName = String(item.INGR_ENG_NAME ?? "");
  const country = String(item.COUNTRY_NAME ?? "");
  return {
    source: "mfds-restricted",
    sourceId: engName && country ? `${engName}:${country}` : engName || "",
    entityType: "ingredient",
    data: item,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchAllMfdsRestricted(): Promise<RawRecord[]> {
  // mfds-ingredient.ts와 동일 페이지네이션 패턴
  // 전체 다운로드 → sourceId(복합키) dedup → RawRecord[]
}
```

---

## 의존 방향

```
mfds-restricted.ts → config.ts     (MFDS_SERVICE_KEY — Q-8)
                   → retry.ts      (fetchWithRetry — P-7)
                   → types.ts      (RawRecord — type import)
```

mfds-ingredient.ts와 **병렬** (서로 import 없음). 역방향·순환 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-5 | CLI → fetchAllMfdsRestricted → fetchWithRetry → fetch. **3단계** |
| P-7 | retry.ts 공유 |
| P-8 | 단방향. 순환 없음 |
| P-9 | scripts/ 내부. server/ import 없음 |
| P-10 | 삭제해도 core/, features/ 빌드 에러 없음 |
| G-3 | API 응답 → RawRecord 변환 + 복합키 생성 (패스스루 아님) |
| G-5 | mfds-ingredient 패턴 그대로 (export 매핑함수 + 메인함수, dedup Map, fetchWithRetry) |
| G-8 | any 없음. unknown + assertion |
| G-9 | export 2개: mapItemToRawRecord, fetchAllMfdsRestricted |
| G-10 | PAGE_SIZE, MFDS_RESTRICTED_ENDPOINT 상수 |
| L-14 | scripts/seed/lib/providers/ |
| N-2 | mfds-restricted.ts (kebab-case) |
| Q-8 | pipelineEnv.MFDS_SERVICE_KEY |

---

## 테스트 계획

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | mapItemToRawRecord 정상 변환 | source, sourceId(복합키), entityType, data, fetchedAt |
| 2 | sourceId 복합키 — INGR_ENG_NAME:COUNTRY_NAME | 형식 검증 |
| 3 | INGR_ENG_NAME 없으면 빈 문자열 | 폴백 |
| 4 | COUNTRY_NAME 없으면 INGR_ENG_NAME만 | 폴백 |
| 5 | data에 원본 전체 보존 (LIMIT_COND, REGULATE_TYPE 접근) | Stage 2 의존 필드 |
| 6 | fetchedAt ISO 8601 | 정규식 |
| 7 | MFDS_SERVICE_KEY 없으면 에러 | vi.hoisted mock |
| 8 | 단일 페이지 정상 수집 | mock |
| 9 | 다중 페이지 — totalCount 도달 종료 | 2페이지 mock |
| 10 | sourceId dedup (동일 복합키) | 동일 성분+동일 국가 |
| 11 | 빈 sourceId skip | INGR_ENG_NAME+COUNTRY_NAME 모두 없음 |
| 12 | API 에러 시 throw | response.ok false |
| 13 | serviceKey URL 파라미터 전달 | mock 호출 인자 |
| 14 | 빈 응답 → 빈 배열 | |

---

## 검증 체크리스트

```
□ V-1  의존성 DAG 위반 없음
□ V-2  core/ 수정 없음
□ V-9  기존 코드와 중복 없음 (mfds-ingredient와 병렬, 엔드포인트/매핑만 다름)
□ V-10 미사용 export 없음
□ V-12 any 타입 없음
□ V-17 제거 안전성
□ V-18 scripts/ 의존 방향 준수
□ 테스트 전체 통과
□ npx tsc --noEmit scripts/ 에러 0건
```

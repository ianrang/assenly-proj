# P2-56h: 식약처 보고품목 프로바이더 (S5)

## Context

식약처 기능성화장품 보고품목 API(S5)를 호출하여 products 교차 검증 데이터를 수집하는 프로바이더.
기능성화장품(미백/주름개선/자외선차단) 여부 확인 → tags 보강. **생성이 아닌 검증 도구**.

**선행 완료**: P2-V2 (API 호출 검증 ✅), P2-56c (types.ts ✅)

---

## S3/S4와의 핵심 차이

| 항목 | S3/S4 (mfds-ingredient/restricted) | **S5 (mfds-functional)** |
|------|-----------------------------------|--------------------------|
| 대상 | ingredients | **products** |
| 수집 | 전체 풀 다운로드 (fetchAll) | **키워드 검색** (item_name) |
| 역할 | 소스/보강 | **교차 검증** (생성 아님) |
| 실행 | Phase A | **Phase E** (products 생성 후) |

---

## 설계 결정

### D-1. 키워드 검색 함수 (fetchAll 아님)

S5는 item_name 파라미터로 검색. 전체 다운로드 불필요 (기능성화장품만 대상).
```typescript
searchMfdsFunctional(itemName: string): Promise<RawRecord[]>
```

### D-2. entityType = "product"

S5는 products 교차 검증. ingredients 아님.

### D-3. sourceId = COSMETIC_REPORT_SEQ

보고일련번호 — 유니크 보장. ITEM_NAME은 동명 제품 가능.

### D-4. 퍼지 매칭은 범위 밖

설계 문서 "ITEM_NAME ≠ 시장 판매명 → 퍼지 매칭 필요".
프로바이더는 API 호출 + RawRecord[] 반환만. 퍼지 매칭은 P2-64e (Phase E).

### D-5. config.ts 수정 없음

MFDS_SERVICE_KEY 공유 (S3/S4/S5 동일).

---

## API 사양 (P2-V2 검증 완료)

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `GET http://apis.data.go.kr/1471000/FtnltCosmRptPrdlstInfoService/getRptPrdlstInq` |
| 인증 | `serviceKey` (MFDS_SERVICE_KEY) |
| 검색 | `item_name` 파라미터 (품목명) |
| 응답 필드 | ITEM_NAME, ENTP_NAME, MANUF_NAME, REPORT_DATE, COSMETIC_REPORT_SEQ, EFFECT_YN1~3, SPF, PA |

---

## 파일 목록

### 신규 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/providers/mfds-functional.ts` | S5 프로바이더 |
| `scripts/seed/lib/providers/mfds-functional.test.ts` | 단위 테스트 |

### 수정 없음

config.ts, types.ts, retry.ts, 기존 프로바이더 전체 — 독립.

---

## 코드 구조

```typescript
// scripts/seed/lib/providers/mfds-functional.ts

import { pipelineEnv } from "../../config";
import { fetchWithRetry } from "../retry";
import type { RawRecord } from "../types";

const PAGE_SIZE = 100;
const MFDS_FUNCTIONAL_ENDPOINT =
  "http://apis.data.go.kr/1471000/FtnltCosmRptPrdlstInfoService/getRptPrdlstInq";

export function mapItemToRawRecord(item: Record<string, unknown>): RawRecord {
  return {
    source: "mfds-functional",
    sourceId: String(item.COSMETIC_REPORT_SEQ ?? ""),
    entityType: "product",
    data: item,
    fetchedAt: new Date().toISOString(),
  };
}

export async function searchMfdsFunctional(
  itemName: string,
): Promise<RawRecord[]> {
  // serviceKey 확인 → 페이지네이션 (item_name 파라미터) → dedup → RawRecord[]
}
```

---

## 의존 방향

```
mfds-functional.ts → config.ts     (MFDS_SERVICE_KEY — Q-8)
                   → retry.ts      (fetchWithRetry — P-7)
                   → types.ts      (RawRecord — type import)
```

기존 5개 프로바이더와 병렬. 서로 import 없음. 역방향·순환 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-5 | CLI → searchMfdsFunctional → fetchWithRetry → fetch. **3단계** |
| P-7 | retry.ts 공유 |
| P-8 | 단방향. 순환 없음 |
| P-9 | scripts/ 내부. server/ import 없음 |
| P-10 | 삭제해도 core/, features/ 빌드 에러 없음 |
| G-3 | API 응답 → RawRecord 변환 (패스스루 아님) |
| G-5 | mfds-ingredient 페이지네이션 패턴 + 키워드 검색 시그니처 |
| G-8 | any 없음 |
| G-9 | export 2개: mapItemToRawRecord, searchMfdsFunctional |
| G-10 | PAGE_SIZE, MFDS_FUNCTIONAL_ENDPOINT 상수 |
| L-14 | scripts/seed/lib/providers/ |
| N-2 | mfds-functional.ts (kebab-case) |
| Q-8 | pipelineEnv.MFDS_SERVICE_KEY |

---

## 테스트 계획

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | mapItemToRawRecord 정상 변환 | source, sourceId, entityType="product", data, fetchedAt |
| 2 | sourceId = COSMETIC_REPORT_SEQ | 보고일련번호 |
| 3 | COSMETIC_REPORT_SEQ 없으면 빈 문자열 | 폴백 |
| 4 | data에 원본 전체 보존 (EFFECT_YN1~3, SPF, PA) | Phase E 의존 필드 |
| 5 | fetchedAt ISO 8601 | 정규식 |
| 6 | MFDS_SERVICE_KEY 없으면 에러 | vi.hoisted |
| 7 | 검색 결과 정상 반환 | item_name 파라미터 |
| 8 | item_name URL 파라미터 전달 | mock 호출 인자 |
| 9 | sourceId dedup | 동일 COSMETIC_REPORT_SEQ |
| 10 | 빈 sourceId skip | |
| 11 | API 에러 시 throw | |
| 12 | 빈 응답 → 빈 배열 | |
| 13 | items 직접 배열 형태 | |
| 14 | 다중 페이지 종료 | totalCount |

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

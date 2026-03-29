# P2-56i: CosIng CSV 프로바이더 (S6)

## Context

EU CosIng DB CSV(28,705건)를 파싱하여 ingredients 보강 데이터(inci_name, function, restriction)를 RawRecord[]로 제공하는 프로바이더.
ingredients 3원 소스(S3→S6→S4) 중 **2순위 보강 소스**. S3↔S6 매칭은 fetch-service(P2-56n) 담당.

**선행 완료**: P2-V4 (CosIng CSV 검증 ✅), P2-56c (types.ts ✅), P2-56j (csv-parser.ts ✅)

---

## 설계 결정

### D-1. 별도 파일 (csv-loader 미경유)

cosing-csv.ts는 csv-loader.ts와 병렬 관계:
- source 값 다름: `"cosing"` vs `"csv"`
- config 접근: `pipelineEnv.COSING_CSV_PATH` 자체 참조 (csv-loader는 config 미사용)
- 시그니처: `loadCosIngIngredients()` 파라미터 없음 (csv-loader는 filePath 필수)
- csv-parser.ts 직접 사용 → csv-loader 래퍼 아님 (G-3 준수)

### D-2. sourceId = INCI name

- INCI 국제 표준 명칭 (유니크)
- S3 매칭 1차 JOIN 키 (INGR_ENG_NAME ↔ INCI name)
- 기존 패턴 일관 (kakao: doc.id, mfds: INGR_KOR_NAME — 모두 매칭 키)

### D-3. 구분자 = 세미콜론 (EU 표준)

EU CosIng CSV는 세미콜론 구분. csv-parser.ts delimiter 옵션으로 대응.
실제 CSV 배치 시 확인 후 상수 1곳 수정으로 조정 가능 (P-7).

### D-4. S3↔S6 매칭은 범위 밖

설계 문서: "매칭은 fetch-service에서". cosing-csv.ts는 CSV → RawRecord[] 변환만.

### D-5. config.ts 수정 없음

COSING_CSV_PATH 이미 정의 (default: "./data/cosing.csv").

---

## 파일 목록

### 신규 생성 (2개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/providers/cosing-csv.ts` | S6 프로바이더 |
| `scripts/seed/lib/providers/cosing-csv.test.ts` | 단위 테스트 |

### 수정 없음

config.ts, types.ts, csv-parser.ts, csv-loader.ts, mfds-ingredient.ts — 모두 독립.

---

## 코드 구조

```typescript
// scripts/seed/lib/providers/cosing-csv.ts
// EU CosIng DB CSV (S6) — data-collection.md §3.7
// ingredients INCI 표준화 + function + restriction 보강.
// P-9: scripts/ 내부만. server/ import 금지.
// Q-8: pipelineEnv.COSING_CSV_PATH 경유.
// P-7: CSV 파싱은 csv-parser.ts 공유 유틸.

import { pipelineEnv } from "../../config";
import { parseCsvFile } from "../csv-parser";
import type { RawRecord } from "../types";

const COSING_DELIMITER = ";";

export function mapRowToRawRecord(row: Record<string, string>): RawRecord {
  return {
    source: "cosing",
    sourceId: String(row["INCI name"] ?? ""),
    entityType: "ingredient",
    data: row,
    fetchedAt: new Date().toISOString(),
  };
}

export function loadCosIngIngredients(): RawRecord[] {
  const filePath = pipelineEnv.COSING_CSV_PATH;
  const rows = parseCsvFile(filePath, { delimiter: COSING_DELIMITER });

  const seen = new Map<string, RawRecord>();
  for (const row of rows) {
    const record = mapRowToRawRecord(row);
    if (record.sourceId && !seen.has(record.sourceId)) {
      seen.set(record.sourceId, record);
    }
  }

  return [...seen.values()];
}
```

---

## 의존 방향

```
cosing-csv.ts → config.ts     (COSING_CSV_PATH — Q-8)
             → csv-parser.ts  (parseCsvFile — P-7)
             → types.ts       (RawRecord — type import)
```

csv-loader.ts, mfds-ingredient.ts와 병렬. 서로 import 없음. 역방향·순환 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-5 | CLI → loadCosIngIngredients → parseCsvFile → parseCsvString → csv-parse. **4단계** |
| P-7 | csv-parser.ts 공유 (CSV 파싱 단일 변경점) |
| P-8 | 단방향. 순환 없음 |
| P-9 | scripts/ 내부. server/ import 없음 |
| P-10 | 삭제해도 core/, features/ 빌드 에러 없음 |
| G-3 | csv-parser 직접 사용 (csv-loader 래퍼 아님) |
| G-4 | config.ts COSING_CSV_PATH의 유일한 소비자 |
| G-5 | mfds-ingredient 패턴 (export 매핑함수 + 메인함수, dedup Map) |
| G-8 | any 없음. Record<string, string> |
| G-9 | export 2개: mapRowToRawRecord, loadCosIngIngredients |
| G-10 | COSING_DELIMITER 상수 |
| L-14 | scripts/seed/lib/providers/ |
| N-2 | cosing-csv.ts (kebab-case) |
| Q-8 | pipelineEnv.COSING_CSV_PATH |

---

## 테스트 계획

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | mapRowToRawRecord 정상 변환 | source, sourceId, entityType, data, fetchedAt |
| 2 | sourceId = INCI name 매핑 | 국제 표준명 |
| 3 | INCI name 없으면 빈 문자열 | 폴백 |
| 4 | data에 원본 전체 보존 | Function, Restriction, CAS No 접근 가능 |
| 5 | fetchedAt ISO 8601 | 정규식 |
| 6 | loadCosIngIngredients — 정상 로드 | parseCsvFile mock |
| 7 | INCI name dedup | 동일 INCI name 중복 제거 |
| 8 | 빈 sourceId skip | INCI name 없는 행 |
| 9 | parseCsvFile에 delimiter ";" 전달 | mock 호출 인자 검증 |
| 10 | COSING_CSV_PATH config 경유 확인 | mock config 값 사용 |

---

## 검증 체크리스트

```
□ V-1  의존성 DAG 위반 없음
□ V-2  core/ 수정 없음
□ V-9  기존 코드와 중복 없음 (csv-loader와 병렬, 래퍼 아님)
□ V-10 미사용 export 없음
□ V-12 any 타입 없음
□ V-17 제거 안전성
□ V-18 scripts/ 의존 방향 준수
□ 테스트 전체 통과
□ npx tsc --noEmit scripts/ 에러 0건
```

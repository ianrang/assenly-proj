# P2-56j: CSV 로더 프로바이더 + 공유 CSV 파싱 유틸

## Context

Channel B (CSV/엑셀 임포트)를 처리하는 프로바이더 구현. 구글시트에서 수동 작성한 CSV → `RawRecord[]` 변환.
대상 엔티티: products, ingredients, treatments (+ brands, doctors 등 확장 가능).

**선행 완료**: P2-56c (types.ts ✅), P2-56b (config.ts ✅), P2-56d (kakao-local.ts ✅)

---

## 설계 결정

### D-1. 공유 CSV 파싱 유틸 분리 (P-7)

CSV 파싱을 사용하는 모듈이 4개:
- csv-loader.ts (P2-56j, Channel B)
- cosing-csv.ts (P2-56i, S6 CosIng 28K건)
- review-exporter.ts (P2-56o2, Stage 3 CSV export/import)
- import-review CLI (P2-56q, Stage 3 검수 CSV)

retry.ts(재시도 로직 공유)와 동일 패턴으로, `csv-parser.ts`에 파싱 로직을 집중.
라이브러리 교체/BOM 처리/인코딩 변경 시 1파일만 수정 → P-7 준수.

### D-2. csv-parse 라이브러리 선택

| 기준 | csv-parse 6.2.1 |
|------|-----------------|
| Node.js 전용 | ✅ (브라우저 번들 미포함) |
| RFC 4180 준수 | ✅ (인용 부호, 이스케이프, BOM) |
| 동기 API | ✅ (`csv-parse/sync` — 200건 수준에 적합) |
| CosIng 28K건 | ✅ (동기 API로도 ~14MB, Node.js 힙 내) |
| 구분자 설정 | ✅ (`delimiter: ';'` — EU CSV 대응) |

### D-3. PlaceProvider 미구현

csv-loader는 PlaceProvider를 구현하지 않음:
- PlaceProvider: `search(query) → RawPlace[]` (API 기반 키워드 검색)
- csv-loader: `loadCsv(filePath, entityType) → RawRecord[]` (파일 기반 일괄 로드)
- 호출자가 다름: PlaceProvider → fetch-service (Channel A), csv-loader → import-csv CLI (Channel B)
- 공통 오케스트레이터 없음 → 공통 인터페이스 불필요 (G-4)

### D-4. config.ts 수정 없음

파일 경로는 CLI 인자 → 함수 파라미터로 전달. config에 고정 경로 불필요.
(COSING_CSV_PATH는 S6 전용으로 이미 존재 — csv-loader와 무관)

### D-5. interface.ts / run.ts 수정 없음

구 시드 시스템. P2-56q (CLI 리팩토링)에서 통합 예정.

---

## 파일 목록

### 신규 생성 (4개)

| 파일 | 역할 |
|------|------|
| `scripts/seed/lib/csv-parser.ts` | 공유 CSV 파싱 유틸 |
| `scripts/seed/lib/csv-parser.test.ts` | 파싱 유틸 테스트 |
| `scripts/seed/lib/providers/csv-loader.ts` | Channel B 프로바이더 |
| `scripts/seed/lib/providers/csv-loader.test.ts` | 프로바이더 테스트 |

### 수정 (1개)

| 파일 | 변경 |
|------|------|
| `package.json` | `csv-parse` 정확한 버전 추가 |

### 수정 없음

| 파일 | 이유 |
|------|------|
| config.ts | 파일 경로는 함수 파라미터 |
| types.ts | RawRecord, EntityType 그대로 사용 |
| retry.ts | 로컬 파일 읽기에 재시도 불필요 |
| kakao-local.ts | 독립 모듈 |
| interface.ts, run.ts | 구 시스템, P2-56q에서 리팩토링 |

---

## 코드 구조

### 1. csv-parser.ts

```typescript
// scripts/seed/lib/csv-parser.ts
// 파이프라인 공유 CSV 파싱 유틸 — data-collection.md §7.2
// P-7: CSV 파싱 로직 단일 변경점. 라이브러리 교체 시 이 파일만 수정.
// P-9: scripts/ 내부만. server/ import 금지.

import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/** CSV 파싱 옵션 */
export interface CsvParseOptions {
  /** 구분자 (기본: ',') */
  delimiter?: string;
  /** 파일 인코딩 (기본: 'utf-8') */
  encoding?: BufferEncoding;
  /** 빈 행 건너뛰기 (기본: true) */
  skipEmptyLines?: boolean;
  /** 필드 앞뒤 공백 제거 (기본: true) */
  trim?: boolean;
}

/** CSV 문자열 → Record 배열 파싱 */
export function parseCsvString(
  content: string,
  options?: CsvParseOptions,
): Record<string, string>[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: options?.skipEmptyLines ?? true,
    trim: options?.trim ?? true,
    delimiter: options?.delimiter ?? ",",
    bom: true,
  });
}

/** CSV 파일 → Record 배열 파싱 */
export function parseCsvFile(
  filePath: string,
  options?: CsvParseOptions,
): Record<string, string>[] {
  const content = readFileSync(filePath, {
    encoding: options?.encoding ?? "utf-8",
  });
  return parseCsvString(content, options);
}
```

**설계 포인트**:
- `parseCsvString`: 테스트 + 인메모리 용. I/O 분리로 순수 파싱 로직 테스트 가능
- `parseCsvFile`: 파일 읽기 + parseCsvString 호출. 얇은 래퍼
- `columns: true`: 헤더 행을 키로 사용 → `Record<string, string>[]` 반환
- `bom: true`: BOM 자동 감지 제거 (CosIng EU CSV 대응)
- 기본값: skipEmptyLines=true, trim=true (구글시트 export 특성)
- 동기 API: 200건~28K건 범위에서 async 불필요. 파일 읽기도 동기 (CLI 환경)

### 2. csv-loader.ts

```typescript
// scripts/seed/lib/providers/csv-loader.ts
// Channel B CSV 로더 — data-collection.md §1.2 Channel B
// P-9: scripts/ 내부만. server/ import 금지.

import { parseCsvFile, type CsvParseOptions } from "../csv-parser";
import type { RawRecord, EntityType } from "../types";

/** sourceId로 사용할 컬럼명 (기본: 'id') */
const DEFAULT_ID_COLUMN = "id";

/** CSV 파일 → RawRecord[] 변환 */
export function loadCsvAsRawRecords(
  filePath: string,
  entityType: EntityType,
  options?: CsvParseOptions & { idColumn?: string },
): RawRecord[] {
  const rows = parseCsvFile(filePath, options);
  const idColumn = options?.idColumn ?? DEFAULT_ID_COLUMN;
  const fetchedAt = new Date().toISOString();

  return rows.map((row, index) => ({
    source: "csv",
    sourceId: String(row[idColumn] ?? `csv-${index}`),
    entityType,
    data: row,
    fetchedAt,
  }));
}
```

**설계 포인트**:
- 함수 export (PlaceProvider 미구현 — D-3)
- `idColumn` 옵션: CSV마다 ID 컬럼명이 다를 수 있음 (유연성)
- `csv-${index}` 폴백: ID 컬럼 없는 CSV도 처리 (견고성)
- `fetchedAt` 1회 생성: 동일 배치 내 일관된 타임스탬프
- `data: row`: 원본 CSV 행 전체 보존 (Stage 2~4에서 활용)

---

## 의존 방향 검증

```
csv-parse (외부)
    ↑
csv-parser.ts ← 내부 의존 없음 (node:fs + csv-parse만)
    ↑
csv-loader.ts → types.ts (type import만)
```

역방향·순환 없음. core/, features/, client/, shared/ 영향 없음.

---

## 규칙 준수 매트릭스

| 규칙 | 적용 |
|------|------|
| P-7 | csv-parser.ts = CSV 파싱 단일 변경점 |
| P-8 | 단방향: csv-loader → csv-parser → 외부. 순환 없음 |
| P-9 | scripts/ → shared/ 허용. server/ import 없음 |
| P-10 | 두 파일 삭제해도 core/, features/ 빌드 에러 없음 |
| G-3 | csv-parser가 csv-parse 옵션을 가공 (패스스루 아님) |
| G-4 | 사용처 없는 인터페이스/코드 없음 |
| G-8 | any 없음 — Record<string, string>, Record<string, unknown> |
| G-9 | 최소 export: parseCsvFile, parseCsvString, CsvParseOptions, loadCsvAsRawRecords |
| G-10 | DEFAULT_ID_COLUMN 상수 명명 |
| L-14 | 파이프라인 전용 유틸은 scripts/seed/lib/에 위치 |
| N-2 | kebab-case: csv-parser.ts, csv-loader.ts |
| N-3 | 테스트: csv-parser.test.ts, csv-loader.test.ts |
| Q-8 | process.env 미사용 (파일 경로는 함수 파라미터) |
| Q-9 | csv-parse 정확한 버전 고정 |

---

## 테스트 계획

### csv-parser.test.ts

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | 기본 CSV 파싱 | 헤더 → 키, 행 → Record<string, string>[] |
| 2 | 빈 행 건너뛰기 | skipEmptyLines 기본 true 동작 |
| 3 | 세미콜론 구분자 | delimiter: ';' 동작 (CosIng 대응) |
| 4 | 인용 부호 처리 | "field with, comma" 정상 파싱 |
| 5 | 공백 trim | 필드 앞뒤 공백 제거 |
| 6 | 빈 CSV (헤더만) | 빈 배열 반환 |
| 7 | BOM 처리 | UTF-8 BOM 있는 CSV 정상 파싱 |

### csv-loader.test.ts

| # | 테스트 | 검증 |
|---|--------|------|
| 1 | 정상 CSV → RawRecord[] | source='csv', entityType, data, fetchedAt |
| 2 | sourceId 매핑 | id 컬럼 → sourceId |
| 3 | idColumn 커스텀 | 다른 ID 컬럼명 지정 |
| 4 | id 없는 CSV | csv-${index} 폴백 |
| 5 | 빈 CSV | 빈 배열 반환 |

---

## 검증 체크리스트

```
□ V-1  의존성 DAG 위반 없음 (csv-loader → csv-parser → 외부)
□ V-2  core/ 수정 없음
□ V-9  기존 코드와 중복 없음 (CSV 파싱 코드 0건 확인)
□ V-10 미사용 export 없음
□ V-12 any 타입 없음
□ V-17 제거 안전성: 두 파일 삭제해도 빌드 에러 없음
□ V-18 scripts/ 의존 방향 준수
□ 테스트 전체 통과
□ npx tsc --noEmit 에러 0건
```

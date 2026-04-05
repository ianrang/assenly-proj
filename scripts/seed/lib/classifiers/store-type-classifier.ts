// ============================================================
// Store Type Classifier — data-collection.md §5.2
// 카카오 RawRecord.data → store_type 자동 분류.
// MVP: 정규식 다중 매핑. 추후 LLM 분류기로 교체 가능 (인터페이스).
// P-9: scripts/ 내부 import만. server/ import 금지.
// P-10: 삭제 시 enrich-service.ts만 영향 (scripts/ 내부).
// ============================================================

// ── 인터페이스 (G-11: LLM 확장점) ─────────────────────────

/** store_type 분류기 인터페이스 — LLM 구현으로 교체 가능 */
export interface StoreTypeClassifier {
  classify(data: Record<string, unknown>): string;
}

// ── 정규식 분류 규칙 (G-10: 매직 문자열 상수화) ──────────

/** 분류 규칙: 하나의 type에 여러 정규식 패턴 매핑 */
interface ClassifierRule {
  type: string;
  patterns: RegExp[];
}

/** 정규식 분류 규칙 목록 — 순서 중요 (첫 매칭 우선) */
const CLASSIFIER_RULES: ClassifierRule[] = [
  {
    type: "olive_young",
    patterns: [/올리브영/i, /olive\s*young/i],
  },
  {
    type: "daiso",
    patterns: [/다이소/i, /daiso/i],
  },
  {
    type: "chicor",
    patterns: [/시코르/i, /chicor/i],
  },
  {
    type: "department_store",
    patterns: [
      /신세계백화점/i, /롯데백화점/i, /현대백화점/i,
      /NC백화점/i, /행복한.*백화점/i,
      /갤러리아/i, /더현대/i,
      /롯데월드몰/i, /아이파크몰/i,
      /department\s*store/i,
    ],
  },
  {
    type: "brand_store",
    patterns: [
      /이니스프리/i, /innisfree/i,
      /라네즈/i, /laneige/i,
      /에뛰드/i, /etude/i,
      /미샤/i, /missha/i,
      /토니모리/i, /tony\s*moly/i,
      /더페이스샵/i, /the\s*face\s*shop/i,
      /스타일난다/i, /stylenanda/i,
      /3ce/i,
      /설화수/i, /sulwhasoo/i,
      /헤라/i, /hera\b/i,
      /탬버린즈/i, /tamburins/i,
      /논픽션/i, /nonfiction/i,
      /닥터자르트/i, /dr\.?\s*jart/i,
      /아모레/i, /amore/i,
      /아리따움/i, /aritaum/i,
      /눙크/i, /nunc/i,
      /네이처리퍼블릭/i, /nature\s*republic/i,
      /홀리카홀리카/i, /홀리카/i, /holika/i,
      /바닐라코/i, /banila\s*co/i,
      /클리오/i, /clio\b/i,
      /페리페라/i, /peripera/i,
      /스킨푸드/i, /skinfood/i,
      /더샘/i, /the\s*saem/i,
      /르\s*라보/i, /le\s*labo/i,
      /이솝/i, /aesop/i,
      /메디큐브/i, /medicube/i,
      /오프뷰티/i,
      /뷰티플레이/i,
      /플래그십/i, /flagship/i,
      // P2-65: 누락 브랜드 17개 추가
      /AHC/i,
      /러쉬/i, /\blush\b/i,
      /바비브라운/i, /bobbi\s*brown/i,
      /투쿨포스쿨/i, /too\s*cool/i,
      /코리아나/i, /coreana/i,
      /에이지.*투웨니스/i, /age\s*20/i,
      /SW19/i,
      /오휘/i, /\bo\s*hui\b/i,
      /올마스크스토리/i,
      /헤메코/i, /hemecco/i,
      /네이처컬렉션/i, /nature\s*collection/i,
      /디오키드스킨/i, /orchid\s*skin/i,
      /엘로엘/i, /eloel/i,
      /닥터에스테/i, /dr\.?\s*esthe/i,
      /프리티스킨/i, /prettyskin/i,
      /엔프라니/i, /enprani/i,
      /태평양/i,
      /맥코스메틱/i, /\bmac\s*cosmetic/i,
      /더바디샵/i, /body\s*shop/i,
      /비디비치/i, /vdivici/i,
      /아워글래스/i, /hourglass/i,
    ],
  },
  {
    type: "pharmacy",
    patterns: [/약국/i, /pharmacy/i, /drugstore/i],
  },
  // 미매칭 → "other" (classify 메서드 폴백)
];

/** 기본 폴백 store_type */
const FALLBACK_TYPE = "other";

// ── 데이터 추출 헬퍼 (내부 전용) ──────────────────────────

/** data.name.ko 또는 data.name 문자열 추출 */
function extractName(data: Record<string, unknown>): string {
  const name = data.name;
  if (typeof name === "string") return name;
  if (name && typeof name === "object") {
    return String((name as Record<string, unknown>).ko ?? "");
  }
  return "";
}

/** data.raw.category_name 추출 (카카오 원본 카테고리) */
function extractCategory(data: Record<string, unknown>): string {
  const raw = data.raw as Record<string, unknown> | undefined;
  return String(raw?.category_name ?? "");
}

// ── MVP 구현: 정규식 분류기 ─────────────────────────────

/** 정규식 기반 store_type 분류기 (MVP) */
export class RegexStoreTypeClassifier implements StoreTypeClassifier {
  classify(data: Record<string, unknown>): string {
    const text = `${extractName(data)} ${extractCategory(data)}`;

    for (const rule of CLASSIFIER_RULES) {
      if (rule.patterns.some((p) => p.test(text))) {
        return rule.type;
      }
    }

    return FALLBACK_TYPE;
  }
}

/** 기본 분류기 인스턴스 */
export const defaultStoreTypeClassifier: StoreTypeClassifier =
  new RegexStoreTypeClassifier();

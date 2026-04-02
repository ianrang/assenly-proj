// ============================================================
// Stage 2 Enrich Service — data-collection.md §7.0, §7.1
// RawRecord[] → 엔티티별 번역+분류(confidence)+생성 → EnrichedRecord[]
// 건별 try-catch 에러 격리 (§7.0). deterministic UUID 생성 (P2-56p D-2).
// P-9: scripts/ 내부 + shared/constants import만. server/ import 금지.
// P-10: 삭제 시 빌드 에러 0건.
// ============================================================

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  SKIN_TYPES,
  SKIN_CONCERNS,
} from "@/shared/constants/beauty";

import type {
  EntityType,
  RawRecord,
  EnrichedRecord,
  EnrichmentMetadata,
  PipelineError,
  PipelineResult,
} from "./types";

import { generateEntityId } from "./id-generator";
import {
  translateFields,
  ALL_TARGET_LANGS,
} from "./enrichment/translator";
import type { TranslateResult } from "./enrichment/translator";
import {
  classifyFields,
  type FieldSpec,
} from "./enrichment/classifier";
import {
  generateDescriptions,
  type GenerationFieldSpec,
} from "./enrichment/description-generator";
import { defaultStoreTypeClassifier } from "./store-type-classifier";

// ── 타입 ────────────────────────────────────────────────────

/** Stage 2 보강 옵션 */
export interface EnrichOptions {
  /** 특정 entityType만 보강 */
  entityTypes?: EntityType[];
  /** 번역 대상 언어 오버라이드 (기본: ALL_TARGET_LANGS) */
  targetLangs?: readonly string[];
  /** 번역 스킵 */
  skipTranslation?: boolean;
  /** 분류 스킵 */
  skipClassification?: boolean;
  /** 생성 스킵 */
  skipGeneration?: boolean;
  /** 결과 JSON 로그 경로 */
  logDir?: string;
}

// ── 엔티티별 보강 설정 (D-1, G-10) ─────────────────────────

interface EnrichmentConfig {
  /** data에서 ko 텍스트 추출: { 출력필드: data키경로 } */
  translateKeys: Record<string, string>;
  classifySpecs: FieldSpec[];
  generateSpecs: GenerationFieldSpec[];
}

const PRODUCT_CLASSIFY_SPECS: FieldSpec[] = [
  {
    fieldName: "skin_types",
    allowedValues: SKIN_TYPES,
    promptHint: "Skin types this product is suitable for. Consider category, ingredients, and usage.",
  },
  {
    fieldName: "concerns",
    allowedValues: SKIN_CONCERNS,
    promptHint: "Skin concerns this product addresses. Consider ingredients and intended effects.",
  },
];

const TREATMENT_CLASSIFY_SPECS: FieldSpec[] = [
  {
    fieldName: "suitable_skin_types",
    allowedValues: SKIN_TYPES,
    promptHint: "Skin types suitable for this treatment. Consider the procedure type and effects.",
  },
  {
    fieldName: "target_concerns",
    allowedValues: SKIN_CONCERNS,
    promptHint: "Skin concerns this treatment targets. Consider the procedure type and outcomes.",
  },
];

/** 성분 기능 예시값 — strict:false이므로 AI 가이드용 (L-14: 로컬 전용) */
const INGREDIENT_FUNCTIONS = [
  "moisturizing", "hydration", "moisture retention",
  "anti-aging", "anti-wrinkle", "wrinkle reduction", "collagen-boosting",
  "brightening", "dark spot reduction", "tone-evening",
  "exfoliation", "pore cleansing", "pore minimizing",
  "soothing", "anti-inflammatory", "healing",
  "barrier repair", "barrier strengthening", "skin strengthening",
  "antioxidant", "UV-protection",
  "acne-fighting", "oil-control",
  "plumping", "skin smoothing", "cell turnover",
  "repair", "cell energy", "tyrosinase inhibition",
] as const;

const INGREDIENT_CLASSIFY_SPECS: FieldSpec[] = [
  {
    fieldName: "function",
    allowedValues: INGREDIENT_FUNCTIONS,
    promptHint: "Cosmetic functions of this ingredient. Convert CosIng terms (e.g., SKIN CONDITIONING) to specific beauty-friendly terms. Use _cosing.function as reference. Return 2-4 values.",
    strict: false,
  },
  {
    fieldName: "caution_skin_types",
    allowedValues: SKIN_TYPES,
    promptHint: "Skin types that should be CAUTIOUS with this ingredient. Consider irritation and sensitivity risks.",
  },
];

const ENRICHMENT_CONFIG: Record<EntityType, EnrichmentConfig> = {
  product: {
    translateKeys: { name: "name_ko", description: "description_ko" },
    classifySpecs: PRODUCT_CLASSIFY_SPECS,
    generateSpecs: [
      { fieldName: "description", promptHint: "Product features, key benefits, and recommended usage in 2-3 sentences.", maxLength: 300 },
      { fieldName: "review_summary", promptHint: "Concise AI-generated review summary highlighting pros and cons. Include disclaimer.", maxLength: 200 },
    ],
  },
  store: {
    translateKeys: { name: "name.ko" },
    classifySpecs: [],
    generateSpecs: [
      { fieldName: "description", promptHint: "This store's key features, product selection, and shopping experience for tourists. Write naturally in BOTH Korean and English — Korean must be native-quality, not translated. 2-3 sentences.", maxLength: 300 },
    ],
  },
  clinic: {
    translateKeys: { name: "name.ko" },
    classifySpecs: [],
    generateSpecs: [
      { fieldName: "description", promptHint: "This clinic's specialties, services, and patient experience for foreign visitors. Write naturally in BOTH Korean and English — Korean must be native-quality, not translated. 2-3 sentences.", maxLength: 300 },
    ],
  },
  treatment: {
    translateKeys: { name: "name_ko", description: "description_ko" },
    classifySpecs: TREATMENT_CLASSIFY_SPECS,
    generateSpecs: [
      { fieldName: "description", promptHint: "Treatment process, expected results, and recovery in 2-3 sentences.", maxLength: 300 },
    ],
  },
  brand: {
    translateKeys: { name: "name_ko" },
    classifySpecs: [],
    generateSpecs: [],
  },
  ingredient: {
    translateKeys: { name: "INGR_KOR_NAME" },
    classifySpecs: INGREDIENT_CLASSIFY_SPECS,
    generateSpecs: [],
  },
  doctor: {
    translateKeys: { name: "name_ko" },
    classifySpecs: [],
    generateSpecs: [],
  },
};

// ── 소스→DB 필드 매핑 (F-1: S3 필드명 → DB 필드명 변환) ──

type FieldExtractor = (data: Record<string, unknown>) => unknown;

// ── 한국 주소 → district 매핑 (서울 25개 구 → 관광 지역명) ──

const DISTRICT_MAP: Record<string, string> = {
  "강남구": "gangnam",
  "서초구": "seocho",
  "중구": "myeongdong",
  "종로구": "jongno",
  "마포구": "hongdae",
  "용산구": "itaewon",
  "송파구": "jamsil",
  "성동구": "seongsu",
  "영등포구": "yeouido",
  "동대문구": "dongdaemun",
  "강동구": "gangdong",
  "강서구": "gangseo",
  "강북구": "gangbuk",
  "관악구": "gwanak",
  "광진구": "gwangjin",
  "구로구": "guro",
  "금천구": "geumcheon",
  "노원구": "nowon",
  "도봉구": "dobong",
  "동작구": "dongjak",
  "서대문구": "seodaemun",
  "성북구": "seongbuk",
  "양천구": "yangcheon",
  "은평구": "eunpyeong",
  "중랑구": "jungnang",
};

/** 한국어 주소에서 구 이름 추출 → 영문 district 반환 */
function extractDistrictFromAddress(
  data: Record<string, unknown>,
): string | null {
  const address = data.address as Record<string, string> | undefined;
  const koAddr = address?.ko ?? "";
  const match = koAddr.match(/([가-힣]+구)(?:\s|$)/);
  if (!match) return null;
  return DISTRICT_MAP[match[1]] ?? null;
}

const FIELD_MAPPINGS: Partial<Record<EntityType, Record<string, FieldExtractor>>> = {
  ingredient: {
    inci_name: (data) => {
      const cosing = data._cosing as Record<string, unknown> | undefined;
      return data.INGR_ENG_NAME ?? cosing?.inciName ?? null;
    },
  },
  store: {
    store_type: (data) => defaultStoreTypeClassifier.classify(data),
    district: (data) => extractDistrictFromAddress(data),
    english_support: (data) => data.english_support ?? "none",
  },
};

function applyFieldMapping(
  data: Record<string, unknown>,
  entityType: EntityType,
): void {
  const mappings = FIELD_MAPPINGS[entityType];
  if (!mappings) return;
  for (const [targetField, extractor] of Object.entries(mappings)) {
    data[targetField] = extractor(data);
  }
}

// ── 상수 ────────────────────────────────────────────────────

/** 생성 후 재번역 대상 언어 (en 제외 — 이미 생성됨) */
const RETRANSLATE_LANGS = ["ja", "zh", "es", "fr"] as const;

const DEFAULT_LOG_DIR = join(
  typeof __dirname !== "undefined"
    ? __dirname
    : new URL(".", import.meta.url).pathname,
  "../../../docs/data-logs",
);

// ── 공개 API ────────────────────────────────────────────────

/** Stage 2: RawRecord[] → 엔티티별 보강 → EnrichedRecord[] */
export async function enrichRecords(
  records: RawRecord[],
  options?: EnrichOptions,
): Promise<{ records: EnrichedRecord[]; result: PipelineResult }> {
  const filterTypes = options?.entityTypes;
  const logDir = options?.logDir ?? DEFAULT_LOG_DIR;
  const startedAt = new Date().toISOString();
  const enriched: EnrichedRecord[] = [];
  const errors: PipelineError[] = [];

  for (const record of records) {
    if (filterTypes && !filterTypes.includes(record.entityType)) continue;

    try {
      const result = await enrichRecord(record, options);
      enriched.push(result);
    } catch (err) {
      errors.push({
        stage: "enrich",
        recordId: record.sourceId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const pipelineResult: PipelineResult = {
    stage: "enrich",
    startedAt,
    completedAt: new Date().toISOString(),
    total: records.length,
    succeeded: enriched.length,
    failed: errors.length,
    errors,
  };

  writeEnrichLog(pipelineResult, logDir);

  return { records: enriched, result: pipelineResult };
}

// ── 단일 레코드 보강 ───────────────────────────────────────

async function enrichRecord(
  record: RawRecord,
  options?: EnrichOptions,
): Promise<EnrichedRecord> {
  const config = ENRICHMENT_CONFIG[record.entityType];
  const data: Record<string, unknown> = { ...record.data as Record<string, unknown> };
  const targetLangs = options?.targetLangs ?? ALL_TARGET_LANGS;

  // 1. deterministic UUID (D-2)
  data.id = generateEntityId(record.entityType, record.source, record.sourceId);

  // 1.5 소스 필드 → DB 필드 매핑 (S3 INGR_ENG_NAME → inci_name 등)
  applyFieldMapping(data, record.entityType);

  const translatedFields: string[] = [];
  const classifiedFields: string[] = [];
  const confidence: Record<string, number> = {};

  // 2. 번역 (ko → 6언어)
  if (!options?.skipTranslation && Object.keys(config.translateKeys).length > 0) {
    const fields = extractTranslateFields(data, config.translateKeys);
    if (Object.keys(fields).length > 0) {
      const translateResult = await translateFields(fields, targetLangs);
      applyTranslation(data, translateResult);
      translatedFields.push(...translateResult.translatedFields);
    }
  }

  // 3. 분류 (confidence 포함)
  if (!options?.skipClassification && config.classifySpecs.length > 0) {
    const inputData = buildClassifyInput(data, record.entityType);
    const classifyResult = await classifyFields(inputData, config.classifySpecs);
    applyClassification(data, classifyResult, confidence);
    classifiedFields.push(...classifyResult.classifiedFields);
  }

  // 4. 생성 (ko+en)
  if (!options?.skipGeneration && config.generateSpecs.length > 0) {
    const inputData = buildClassifyInput(data, record.entityType);
    const generateResult = await generateDescriptions(inputData, config.generateSpecs);
    applyGeneration(data, generateResult);

    // 5. 생성된 en → 4언어 재번역 (D-3)
    if (!options?.skipTranslation && needsRetranslation(targetLangs)) {
      await retranslateGenerated(data, generateResult.generatedFields);
    }
  }

  return {
    source: record.source,
    sourceId: record.sourceId,
    entityType: record.entityType,
    data,
    enrichments: { translatedFields, classifiedFields, confidence },
    enrichedAt: new Date().toISOString(),
  };
}

// ── 내부 헬퍼 ──────────────────────────────────────────────

/** data에서 번역 대상 ko 텍스트 추출 */
function extractTranslateFields(
  data: Record<string, unknown>,
  translateKeys: Record<string, string>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [outputField, dataKey] of Object.entries(translateKeys)) {
    const value = resolveDataValue(data, dataKey);
    if (typeof value === "string" && value.trim()) {
      fields[outputField] = value;
    }
  }
  return fields;
}

/** 중첩 키(name.ko) 또는 flat 키(INGR_KOR_NAME) 값 추출 */
function resolveDataValue(
  data: Record<string, unknown>,
  key: string,
): unknown {
  if (key.includes(".")) {
    const [first, ...rest] = key.split(".");
    const nested = data[first];
    if (nested && typeof nested === "object") {
      return (nested as Record<string, unknown>)[rest.join(".")];
    }
    return undefined;
  }
  return data[key];
}

/** 번역 결과를 data에 병합 (LocalizedText 형식) */
function applyTranslation(
  data: Record<string, unknown>,
  result: TranslateResult,
): void {
  for (const [fieldName, localizedText] of Object.entries(result.translated)) {
    data[fieldName] = localizedText;
  }
}

/** 분류 결과를 data에 병합 + confidence 기록 */
function applyClassification(
  data: Record<string, unknown>,
  result: { classified: Record<string, { values: string[]; confidence: number }> },
  confidence: Record<string, number>,
): void {
  for (const [fieldName, classification] of Object.entries(result.classified)) {
    data[fieldName] = classification.values;
    confidence[fieldName] = classification.confidence;
  }
}

/** 생성 결과를 data에 병합 (ko+en → LocalizedText 부분) */
function applyGeneration(
  data: Record<string, unknown>,
  result: { generated: Record<string, { ko: string; en: string }> },
): void {
  for (const [fieldName, text] of Object.entries(result.generated)) {
    data[fieldName] = { ko: text.ko, en: text.en };
  }
}

/** 재번역 필요 여부: targetLangs에 en 외 언어가 있는지 */
function needsRetranslation(targetLangs: readonly string[]): boolean {
  return RETRANSLATE_LANGS.some((lang) => targetLangs.includes(lang));
}

/** 생성된 en 텍스트를 ja/zh/es/fr로 재번역 → data 병합 */
async function retranslateGenerated(
  data: Record<string, unknown>,
  generatedFields: string[],
): Promise<void> {
  const enFields: Record<string, string> = {};
  for (const fieldName of generatedFields) {
    const current = data[fieldName] as { ko?: string; en?: string } | undefined;
    if (current?.en) {
      enFields[fieldName] = current.en;
    }
  }

  if (Object.keys(enFields).length === 0) return;

  const reTranslated = await translateFields(enFields, RETRANSLATE_LANGS);

  for (const [fieldName, localizedText] of Object.entries(reTranslated.translated)) {
    const current = data[fieldName] as Record<string, string> | undefined;
    if (current) {
      // ko+en 유지, ja/zh/es/fr 추가
      data[fieldName] = { ...current, ...localizedText };
    }
  }
}

/** 분류/생성 입력 데이터 구성 */
function buildClassifyInput(
  data: Record<string, unknown>,
  entityType: EntityType,
): Record<string, string | string[] | number | null | undefined> {
  const input: Record<string, string | string[] | number | null | undefined> = {};

  // 공통 필드
  const name = data.name;
  if (name && typeof name === "object") {
    const nameObj = name as Record<string, string>;
    input.name_ko = nameObj.ko;
    input.name_en = nameObj.en;
  } else if (typeof name === "string") {
    input.name = name;
  }

  // 엔티티별 추가 필드
  if (entityType === "product" || entityType === "treatment") {
    input.category = data.category as string | undefined;
    input.subcategory = data.subcategory as string | undefined;
  }

  if (entityType === "product") {
    input.brand_id = data.brand_id as string | undefined;
    input.key_ingredients = data.key_ingredients as string[] | undefined;
  }

  if (entityType === "ingredient") {
    input.INGR_ENG_NAME = data.INGR_ENG_NAME as string | undefined;
    input._cosing = data._cosing ? JSON.stringify(data._cosing) : undefined;
    input._restricted = data._restricted ? JSON.stringify(data._restricted) : undefined;
  }

  return input;
}

// ── 로그 ────────────────────────────────────────────────────

function writeEnrichLog(result: PipelineResult, logDir: string): void {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = join(logDir, `enrich-${timestamp}.json`);
    writeFileSync(logPath, JSON.stringify(result, null, 2));
  } catch {
    // Q-15: 로그 실패는 보강 결과에 영향 없음
  }
}

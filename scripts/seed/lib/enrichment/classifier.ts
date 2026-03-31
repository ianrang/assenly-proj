// ============================================================
// Stage 2 AI 분류 모듈 — data-pipeline.md §3.2.2
// 뷰티 속성(skin_types, concerns 등) AI 분류 + confidence 점수.
// 분류 실패 시 빈 결과 반환 (values: [], confidence: 0).
// P-9: scripts/ 내부 + shared/ type import만. server/ import 금지.
// shared/constants 직접 import 안 함 — 허용값은 파라미터로 수신.
// ============================================================

import { generateText } from "ai";
import { getPipelineModel } from "./ai-client";

// ── 타입 (L-14: enrichment/ 전용) ───────────────────────────

/** 분류할 필드 명세 */
export interface FieldSpec {
  /** DB 필드명: "skin_types", "concerns" 등 */
  fieldName: string;
  /** 허용값 배열: SKIN_TYPES, SKIN_CONCERNS 등 */
  allowedValues: readonly string[];
  /** 분류 지시 문맥: "이 제품에 적합한 피부 타입" vs "이 성분에 주의해야 할 피부 타입" */
  promptHint: string;
}

/** 개별 필드 분류 결과 */
interface FieldClassification {
  values: string[];
  confidence: number;
}

/** classifyFields 반환 타입 */
export interface ClassifyResult {
  /** fieldName → 분류 결과 매핑 */
  classified: Record<string, FieldClassification>;
  /** 분류된 필드명 목록 (EnrichmentMetadata.classifiedFields용) */
  classifiedFields: string[];
}

/** classifyFields 입력 데이터 타입 */
type ClassifyInputData = Record<
  string,
  string | string[] | number | null | undefined
>;

// ── 프롬프트 구성 ───────────────────────────────────────────

import { serializeInputData } from "./prompt-utils";

/** 분류 프롬프트 생성 */
function buildClassificationPrompt(
  inputData: ClassifyInputData,
  fieldSpecs: readonly FieldSpec[],
): string {
  const serializedData = serializeInputData(inputData);

  const fieldInstructions = fieldSpecs
    .map(
      (spec, i) =>
        `${i + 1}. "${spec.fieldName}" — ${spec.promptHint}\n   Allowed values: ${spec.allowedValues.join(", ")}`,
    )
    .join("\n\n");

  return `You are a K-beauty product and cosmetics classification expert.

Given the following information:
${serializedData}

Classify into the following categories:

${fieldInstructions}

Rules:
- Select ONLY from the allowed values listed above for each field
- Return multiple values where applicable (as arrays)
- Provide a confidence score (0.0 to 1.0) for each classification
- Higher confidence = more certain about the classification
- Return ONLY valid JSON, no markdown fences, no explanation

Return JSON in this exact format:
{
  "<fieldName>": {
    "values": ["value1", "value2"],
    "confidence": 0.85
  }
}`;
}

// ── 응답 파싱 ───────────────────────────────────────────────

/** confidence 값을 0.0~1.0 범위로 클램핑 */
function clampConfidence(value: unknown): number {
  const num = typeof value === "number" ? value : 0;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

/**
 * AI 응답 텍스트를 파싱하여 분류 결과로 변환.
 * 허용값 외 값은 필터링. 파싱 실패 시 null 반환.
 */
function parseClassificationResponse(
  text: string,
  fieldSpecs: readonly FieldSpec[],
): Record<string, FieldClassification> | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: Record<string, { values?: unknown; confidence?: unknown }> =
      JSON.parse(jsonMatch[0]);

    const result: Record<string, FieldClassification> = {};
    const allowedSets = new Map(
      fieldSpecs.map((s) => [s.fieldName, new Set(s.allowedValues)]),
    );

    for (const spec of fieldSpecs) {
      const fieldData = parsed[spec.fieldName];
      if (!fieldData || typeof fieldData !== "object") {
        result[spec.fieldName] = { values: [], confidence: 0 };
        continue;
      }

      const rawValues = Array.isArray(fieldData.values)
        ? fieldData.values
        : [];
      const allowedSet = allowedSets.get(spec.fieldName)!;

      const filteredValues = rawValues.filter(
        (v): v is string => typeof v === "string" && allowedSet.has(v),
      );

      result[spec.fieldName] = {
        values: filteredValues,
        confidence: clampConfidence(fieldData.confidence),
      };
    }

    return result;
  } catch {
    return null;
  }
}

// ── 폴백 헬퍼 ───────────────────────────────────────────────

/** 빈 분류 결과 생성 (AI 실패 시) */
function buildEmptyResult(
  fieldSpecs: readonly FieldSpec[],
): ClassifyResult {
  const classified: Record<string, FieldClassification> = {};
  for (const spec of fieldSpecs) {
    classified[spec.fieldName] = { values: [], confidence: 0 };
  }
  return {
    classified,
    classifiedFields: [],
  };
}

// ── 메인 함수 ───────────────────────────────────────────────

/**
 * 입력 데이터를 기반으로 지정된 필드를 AI로 분류.
 *
 * @param inputData - 분류에 사용할 엔티티 정보 (name, category, brand 등)
 * @param fieldSpecs - 분류할 필드 명세 배열 (필드명 + 허용값 + 분류 지시)
 * @returns 분류 결과 + 분류된 필드명 목록
 *
 * @example
 * const result = await classifyFields(
 *   { name: "이니스프리 그린티 세럼", category: "skincare", brand: "Innisfree" },
 *   [
 *     { fieldName: "skin_types", allowedValues: ["dry","oily","combination","sensitive","normal"], promptHint: "Skin types this product is suitable for" },
 *     { fieldName: "concerns", allowedValues: ["acne","wrinkles",...], promptHint: "Skin concerns this product addresses" },
 *   ],
 * );
 */
export async function classifyFields(
  inputData: ClassifyInputData,
  fieldSpecs: readonly FieldSpec[],
): Promise<ClassifyResult> {
  if (fieldSpecs.length === 0) {
    return { classified: {}, classifiedFields: [] };
  }

  try {
    const model = await getPipelineModel();
    const prompt = buildClassificationPrompt(inputData, fieldSpecs);

    const result = await generateText({
      model,
      prompt,
    });

    const parsed = parseClassificationResponse(result.text, fieldSpecs);

    if (!parsed) {
      return buildEmptyResult(fieldSpecs);
    }

    const classifiedFields = fieldSpecs
      .filter((s) => parsed[s.fieldName]?.values.length > 0)
      .map((s) => s.fieldName);

    return { classified: parsed, classifiedFields };
  } catch {
    return buildEmptyResult(fieldSpecs);
  }
}

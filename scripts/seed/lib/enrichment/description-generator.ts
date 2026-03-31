// ============================================================
// Stage 2 AI 설명 생성 모듈 — data-pipeline.md §3.2.2
// description, review_summary 등 자유 텍스트를 AI로 생성.
// ko + en 동시 생성. 추가 언어는 enrich-service에서 translator 재호출.
// 생성 실패 시 빈 결과 반환 (ko: "", en: "").
// P-9: scripts/ 내부 import만. server/ import 금지.
// ============================================================

import { generateText } from "ai";
import { getPipelineModel } from "./ai-client";

// ── 타입 (L-14: enrichment/ 전용) ───────────────────────────

/** 생성할 필드 명세 */
export interface GenerationFieldSpec {
  /** DB 필드명: "description", "review_summary" 등 */
  fieldName: string;
  /** 생성 지시 문맥: "이 제품의 특징과 효능을 설명" 등 */
  promptHint: string;
  /** 출력 길이 가이드 (문자 수 기준, 선택) */
  maxLength?: number;
}

/** 생성된 텍스트 (ko + en) */
interface GeneratedText {
  ko: string;
  en: string;
}

/** generateDescriptions 반환 타입 */
export interface GenerateResult {
  /** fieldName → 생성된 ko+en 텍스트 매핑 */
  generated: Record<string, GeneratedText>;
  /** 생성된 필드명 목록 (EnrichmentMetadata용) */
  generatedFields: string[];
}

/** 입력 데이터 타입 */
type GenerateInputData = Record<
  string,
  string | string[] | number | null | undefined
>;

// ── 프롬프트 구성 ───────────────────────────────────────────

import { serializeInputData } from "./prompt-utils";

/** 생성 프롬프트 구성 */
function buildGenerationPrompt(
  inputData: GenerateInputData,
  fieldSpecs: readonly GenerationFieldSpec[],
): string {
  const serializedData = serializeInputData(inputData);

  const fieldInstructions = fieldSpecs
    .map((spec, i) => {
      let instruction = `${i + 1}. "${spec.fieldName}" — ${spec.promptHint}`;
      if (spec.maxLength) {
        instruction += `\n   Maximum length: approximately ${spec.maxLength} characters per language`;
      }
      return instruction;
    })
    .join("\n\n");

  return `You are a K-beauty product and cosmetics content writer.

Given the following information:
${serializedData}

Generate content for the following fields, in both Korean (ko) and English (en):

${fieldInstructions}

Rules:
- Write naturally and informatively for each language
- Korean text should sound natural to Korean readers, not a translation
- English text should sound natural to English readers, not a translation
- Focus on key features, benefits, and unique selling points
- Return ONLY valid JSON, no markdown fences, no explanation

Return JSON in this exact format:
{
  "<fieldName>": {
    "ko": "<Korean text>",
    "en": "<English text>"
  }
}`;
}

// ── 응답 파싱 ───────────────────────────────────────────────

/**
 * AI 응답 텍스트를 파싱하여 생성 결과로 변환.
 * 파싱 실패 시 null 반환.
 */
function parseGenerationResponse(
  text: string,
  fieldSpecs: readonly GenerationFieldSpec[],
): Record<string, GeneratedText> | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: Record<string, { ko?: unknown; en?: unknown }> =
      JSON.parse(jsonMatch[0]);

    const result: Record<string, GeneratedText> = {};

    for (const spec of fieldSpecs) {
      const fieldData = parsed[spec.fieldName];
      if (!fieldData || typeof fieldData !== "object") {
        result[spec.fieldName] = { ko: "", en: "" };
        continue;
      }

      result[spec.fieldName] = {
        ko:
          typeof fieldData.ko === "string" && fieldData.ko.trim()
            ? fieldData.ko.trim()
            : "",
        en:
          typeof fieldData.en === "string" && fieldData.en.trim()
            ? fieldData.en.trim()
            : "",
      };
    }

    return result;
  } catch {
    return null;
  }
}

// ── 폴백 헬퍼 ───────────────────────────────────────────────

/** 빈 생성 결과 (AI 실패 시) */
function buildEmptyResult(
  fieldSpecs: readonly GenerationFieldSpec[],
): GenerateResult {
  const generated: Record<string, GeneratedText> = {};
  for (const spec of fieldSpecs) {
    generated[spec.fieldName] = { ko: "", en: "" };
  }
  return { generated, generatedFields: [] };
}

// ── 메인 함수 ───────────────────────────────────────────────

/**
 * 입력 데이터를 기반으로 지정된 필드의 텍스트를 AI로 생성.
 *
 * @param inputData - 생성에 사용할 엔티티 정보 (name, category, brand 등)
 * @param fieldSpecs - 생성할 필드 명세 배열 (필드명 + 생성 지시)
 * @returns 생성된 ko+en 텍스트 + 생성된 필드명 목록
 *
 * @example
 * const result = await generateDescriptions(
 *   { name: "이니스프리 그린티 세럼", category: "skincare", brand: "Innisfree" },
 *   [
 *     { fieldName: "description", promptHint: "Product features and benefits" },
 *     { fieldName: "review_summary", promptHint: "AI-generated review summary", maxLength: 200 },
 *   ],
 * );
 */
export async function generateDescriptions(
  inputData: GenerateInputData,
  fieldSpecs: readonly GenerationFieldSpec[],
): Promise<GenerateResult> {
  if (fieldSpecs.length === 0) {
    return { generated: {}, generatedFields: [] };
  }

  try {
    const model = await getPipelineModel();
    const prompt = buildGenerationPrompt(inputData, fieldSpecs);

    const result = await generateText({
      model,
      prompt,
    });

    const parsed = parseGenerationResponse(result.text, fieldSpecs);

    if (!parsed) {
      return buildEmptyResult(fieldSpecs);
    }

    const generatedFields = fieldSpecs
      .filter(
        (s) => parsed[s.fieldName]?.ko !== "" || parsed[s.fieldName]?.en !== "",
      )
      .map((s) => s.fieldName);

    return { generated: parsed, generatedFields };
  } catch {
    return buildEmptyResult(fieldSpecs);
  }
}

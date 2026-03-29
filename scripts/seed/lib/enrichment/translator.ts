// ============================================================
// Stage 2 AI 번역 모듈 — data-pipeline.md §3.2.2
// ko→en 필수 + ja/zh/es/fr 선택. 엔티티 단위 번역.
// 번역 실패 시 ko 원문으로 폴백 (data-pipeline.md §3.4.1).
// P-9: scripts/ 내부 + shared/ type import만. server/ import 금지.
// ============================================================

import { generateText } from "ai";
import type { LocalizedText } from "@/shared/types";
import { getPipelineModel } from "./ai-client";

// ── 상수 (G-10) ─────────────────────────────────────────────

/** 기본 번역 대상: 영어만 (필수) */
export const DEFAULT_TARGET_LANGS = ["en"] as const;

/** 전체 번역 대상: 5개 언어 (일괄 실행) */
export const ALL_TARGET_LANGS = ["en", "ja", "zh", "es", "fr"] as const;

// ── 타입 (L-14: enrichment/ 전용) ───────────────────────────

/** translateFields 반환 타입 */
export interface TranslateResult {
  /** 필드명 → LocalizedText 매핑 */
  translated: Record<string, LocalizedText>;
  /** 번역된 필드명 목록 (EnrichmentMetadata.translatedFields용) */
  translatedFields: string[];
}

// ── 프롬프트 구성 ───────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ja: "Japanese",
  zh: "Chinese (Simplified)",
  es: "Spanish",
  fr: "French",
};

/** 번역 프롬프트 생성 */
function buildTranslationPrompt(
  fields: Record<string, string>,
  targetLangs: readonly string[],
): string {
  const fieldEntries = Object.entries(fields)
    .filter(([, v]) => v?.trim())
    .map(([key, value]) => `"${key}": "${value}"`)
    .join(",\n  ");

  const langList = targetLangs
    .map((lang) => `"${lang}" (${LANG_NAMES[lang] ?? lang})`)
    .join(", ");

  return `You are a professional translator specializing in Korean beauty (K-beauty) products and cosmetics.

Translate the following Korean text fields into these languages: ${langList}.

Input fields (Korean):
{
  ${fieldEntries}
}

Rules:
- Preserve brand names, product line names, and ingredient names in their commonly known form
- For product names, keep the brand name untranslated if it's a proper noun
- Translate naturally for each target language, not word-by-word
- Return ONLY valid JSON, no markdown fences, no explanation

Return JSON in this exact format:
{
  "<fieldName>": {
    "<langCode>": "<translated text>",
    ...
  },
  ...
}

Example for a single field "name" translated to "en":
{
  "name": {
    "en": "Innisfree Green Tea Seed Serum"
  }
}`;
}

// ── 응답 파싱 ───────────────────────────────────────────────

/**
 * AI 응답 텍스트를 파싱하여 LocalizedText 맵으로 변환.
 * 파싱 실패 시 null 반환 → 호출자가 폴백 처리.
 */
function parseTranslationResponse(
  text: string,
  originalFields: Record<string, string>,
  targetLangs: readonly string[],
): Record<string, LocalizedText> | null {
  try {
    // JSON 블록 추출 (마크다운 코드 펜스 제거)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: Record<string, Record<string, string>> = JSON.parse(
      jsonMatch[0],
    );

    const result: Record<string, LocalizedText> = {};

    for (const [fieldName, originalValue] of Object.entries(originalFields)) {
      if (!originalValue?.trim()) continue;

      const translations = parsed[fieldName];
      if (!translations || typeof translations !== "object") {
        // 이 필드의 번역이 없으면 폴백
        result[fieldName] = buildFallback(originalValue, targetLangs);
        continue;
      }

      const localized: LocalizedText = { en: "", ko: originalValue };

      for (const lang of targetLangs) {
        const translated = translations[lang];
        if (typeof translated === "string" && translated.trim()) {
          (localized as Record<string, string>)[lang] = translated.trim();
        } else {
          // 개별 언어 번역 누락 시 ko 폴백
          (localized as Record<string, string>)[lang] = originalValue;
        }
      }

      // en 필수 보장 (LocalizedText 타입)
      if (!localized.en) {
        localized.en = originalValue;
      }

      result[fieldName] = localized;
    }

    return result;
  } catch {
    return null;
  }
}

// ── 폴백 헬퍼 ───────────────────────────────────────────────

/** 번역 실패 시 ko 원문을 모든 언어에 복사 */
function buildFallback(
  koreanText: string,
  targetLangs: readonly string[],
): LocalizedText {
  const localized: LocalizedText = { en: koreanText, ko: koreanText };
  for (const lang of targetLangs) {
    (localized as Record<string, string>)[lang] = koreanText;
  }
  return localized;
}

/** 전체 필드에 대한 폴백 결과 생성 */
function buildFullFallback(
  fields: Record<string, string>,
  targetLangs: readonly string[],
): TranslateResult {
  const translated: Record<string, LocalizedText> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value?.trim()) {
      translated[key] = buildFallback(value, targetLangs);
    }
  }
  return { translated, translatedFields: Object.keys(translated) };
}

// ── 메인 함수 ───────────────────────────────────────────────

/**
 * 한국어 텍스트 필드를 지정된 언어로 번역.
 *
 * @param fields - 필드명 → 한국어 텍스트 매핑 (예: { name: "이니스프리 그린티", description: "수분 세럼" })
 * @param targetLangs - 번역 대상 언어 코드 (기본: ["en"])
 * @returns 번역 결과 + 번역된 필드명 목록
 *
 * @example
 * const result = await translateFields(
 *   { name: "이니스프리 그린티 세럼", description: "수분 공급 세럼" },
 *   ALL_TARGET_LANGS,
 * );
 * // result.translated.name = { ko: "이니스프리...", en: "Innisfree...", ja: "イニスフリー...", ... }
 */
export async function translateFields(
  fields: Record<string, string>,
  targetLangs?: readonly string[],
): Promise<TranslateResult> {
  const langs = targetLangs ?? DEFAULT_TARGET_LANGS;

  // 번역할 필드가 없으면 빈 결과
  const validFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value?.trim()) {
      validFields[key] = value.trim();
    }
  }

  if (Object.keys(validFields).length === 0) {
    return { translated: {}, translatedFields: [] };
  }

  try {
    const model = await getPipelineModel();
    const prompt = buildTranslationPrompt(validFields, langs);

    const result = await generateText({
      model,
      prompt,
    });

    const parsed = parseTranslationResponse(result.text, validFields, langs);

    if (!parsed) {
      // JSON 파싱 실패 → 전체 폴백
      return buildFullFallback(validFields, langs);
    }

    return { translated: parsed, translatedFields: Object.keys(parsed) };
  } catch {
    // AI 호출 실패 → ko 폴백 (data-pipeline.md §3.4.1)
    return buildFullFallback(validFields, langs);
  }
}

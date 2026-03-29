// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock (vi.hoisted — vi.mock factory보다 먼저 실행) ──

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: {
    AI_PROVIDER: "anthropic",
    AI_MODEL: undefined,
  } as Record<string, unknown>,
}));

vi.mock("../../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

// ── AI SDK mock ──────────────────────────────────────────────

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

// ── @ai-sdk provider mocks ──────────────────────────────────

const { mockAnthropicFn, mockGoogleFn } = vi.hoisted(() => ({
  mockAnthropicFn: vi.fn().mockReturnValue("anthropic-model-instance"),
  mockGoogleFn: vi.fn().mockReturnValue("google-model-instance"),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: mockAnthropicFn,
}));

vi.mock("@ai-sdk/google", () => ({
  google: mockGoogleFn,
}));

import {
  translateFields,
  DEFAULT_TARGET_LANGS,
  ALL_TARGET_LANGS,
  type TranslateResult,
} from "./translator";
import { getPipelineModel } from "./ai-client";

// ── Fixture ──────────────────────────────────────────────────

/** 정상 AI 응답 — 단일 필드, en만 */
function createSingleFieldEnResponse() {
  return {
    text: JSON.stringify({
      name: { en: "Innisfree Green Tea Seed Serum" },
    }),
    usage: { inputTokens: 50, outputTokens: 30 },
  };
}

/** 정상 AI 응답 — 복수 필드, en만 */
function createMultiFieldEnResponse() {
  return {
    text: JSON.stringify({
      name: { en: "Innisfree Green Tea Seed Serum" },
      description: { en: "Hydrating serum with green tea extract" },
    }),
    usage: { inputTokens: 80, outputTokens: 60 },
  };
}

/** 정상 AI 응답 — 전체 6언어 */
function createFullLangResponse() {
  return {
    text: JSON.stringify({
      name: {
        en: "Innisfree Green Tea Seed Serum",
        ja: "イニスフリー グリーンティー シードセラム",
        zh: "悦诗风吟绿茶籽精华",
        es: "Innisfree Sérum de Semilla de Té Verde",
        fr: "Innisfree Sérum de Graines de Thé Vert",
      },
    }),
    usage: { inputTokens: 50, outputTokens: 100 },
  };
}

// ── getPipelineModel 테스트 ──────────────────────────────────

describe("getPipelineModel", () => {
  beforeEach(() => {
    mockPipelineEnv.AI_PROVIDER = "anthropic";
    mockPipelineEnv.AI_MODEL = undefined;
    mockAnthropicFn.mockClear();
    mockGoogleFn.mockClear();
  });

  it("anthropic 프로바이더 — 기본 모델", async () => {
    mockPipelineEnv.AI_PROVIDER = "anthropic";

    await getPipelineModel();

    expect(mockAnthropicFn).toHaveBeenCalledWith(
      "claude-sonnet-4-5-20250929",
    );
    expect(mockGoogleFn).not.toHaveBeenCalled();
  });

  it("google 프로바이더 — 기본 모델", async () => {
    mockPipelineEnv.AI_PROVIDER = "google";

    await getPipelineModel();

    expect(mockGoogleFn).toHaveBeenCalledWith("gemini-2.0-flash");
    expect(mockAnthropicFn).not.toHaveBeenCalled();
  });

  it("커스텀 모델명 오버라이드", async () => {
    mockPipelineEnv.AI_PROVIDER = "anthropic";
    mockPipelineEnv.AI_MODEL = "claude-haiku-custom";

    await getPipelineModel();

    expect(mockAnthropicFn).toHaveBeenCalledWith("claude-haiku-custom");
  });

  it("미지원 프로바이더 → throw", async () => {
    mockPipelineEnv.AI_PROVIDER = "openai";

    await expect(getPipelineModel()).rejects.toThrow(
      "Unsupported AI provider: openai",
    );
  });
});

// ── translateFields 테스트 ───────────────────────────────────

describe("translateFields", () => {
  beforeEach(() => {
    mockPipelineEnv.AI_PROVIDER = "anthropic";
    mockPipelineEnv.AI_MODEL = undefined;
    mockGenerateText.mockReset();
    mockAnthropicFn.mockClear();
  });

  it("정상 번역 — ko→en 단일 필드", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldEnResponse());

    const result = await translateFields({
      name: "이니스프리 그린티 씨드 세럼",
    });

    expect(result.translated.name).toBeDefined();
    expect(result.translated.name.en).toBe(
      "Innisfree Green Tea Seed Serum",
    );
    expect(result.translated.name.ko).toBe(
      "이니스프리 그린티 씨드 세럼",
    );
    expect(result.translatedFields).toEqual(["name"]);
  });

  it("정상 번역 — ko→en 복수 필드 (name + description)", async () => {
    mockGenerateText.mockResolvedValueOnce(createMultiFieldEnResponse());

    const result = await translateFields({
      name: "이니스프리 그린티 씨드 세럼",
      description: "수분 공급 세럼",
    });

    expect(result.translated.name.en).toBe(
      "Innisfree Green Tea Seed Serum",
    );
    expect(result.translated.description.en).toBe(
      "Hydrating serum with green tea extract",
    );
    expect(result.translatedFields).toHaveLength(2);
    expect(result.translatedFields).toContain("name");
    expect(result.translatedFields).toContain("description");
  });

  it("정상 번역 — 전체 6언어 (ALL_TARGET_LANGS)", async () => {
    mockGenerateText.mockResolvedValueOnce(createFullLangResponse());

    const result = await translateFields(
      { name: "이니스프리 그린티 씨드 세럼" },
      ALL_TARGET_LANGS,
    );

    expect(result.translated.name.en).toBe(
      "Innisfree Green Tea Seed Serum",
    );
    expect(result.translated.name.ja).toBe(
      "イニスフリー グリーンティー シードセラム",
    );
    expect(result.translated.name.zh).toBe("悦诗风吟绿茶籽精华");
    expect(result.translated.name.es).toBe(
      "Innisfree Sérum de Semilla de Té Verde",
    );
    expect(result.translated.name.fr).toBe(
      "Innisfree Sérum de Graines de Thé Vert",
    );
    expect(result.translated.name.ko).toBe(
      "이니스프리 그린티 씨드 세럼",
    );
  });

  it("빈 필드 → 빈 결과", async () => {
    const result = await translateFields({});

    expect(result.translated).toEqual({});
    expect(result.translatedFields).toEqual([]);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("모든 값이 빈 문자열 → 빈 결과", async () => {
    const result = await translateFields({
      name: "",
      description: "   ",
    });

    expect(result.translated).toEqual({});
    expect(result.translatedFields).toEqual([]);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("AI 호출 실패 → ko 폴백", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await translateFields({
      name: "코스알엑스 세럼",
    });

    expect(result.translated.name.en).toBe("코스알엑스 세럼");
    expect(result.translated.name.ko).toBe("코스알엑스 세럼");
    expect(result.translatedFields).toEqual(["name"]);
  });

  it("AI 응답 JSON 파싱 실패 → ko 폴백", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Sorry, I cannot translate this.",
      usage: { inputTokens: 50, outputTokens: 10 },
    });

    const result = await translateFields({
      name: "라네즈 워터뱅크",
    });

    expect(result.translated.name.en).toBe("라네즈 워터뱅크");
    expect(result.translated.name.ko).toBe("라네즈 워터뱅크");
  });

  it("기본 targetLangs = [\"en\"]", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldEnResponse());

    await translateFields({ name: "테스트 제품" });

    // generateText 호출 시 프롬프트에 "en" (English)만 포함되는지 확인
    const calledPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(calledPrompt).toContain('"en" (English)');
    expect(calledPrompt).not.toContain('"ja"');
    expect(calledPrompt).not.toContain('"zh"');
  });

  it("부분 필드만 값 있음 — 빈 값 필드는 skip", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldEnResponse());

    const result = await translateFields({
      name: "이니스프리 그린티 씨드 세럼",
      description: "",
    });

    // name만 번역, description은 건너뜀
    expect(result.translated.name).toBeDefined();
    expect(result.translated.description).toBeUndefined();
    expect(result.translatedFields).toEqual(["name"]);
  });

  it("AI 응답에 일부 필드 누락 → 해당 필드만 폴백", async () => {
    // name만 반환, description 누락
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        name: { en: "Green Tea Serum" },
        // description 누락
      }),
      usage: { inputTokens: 80, outputTokens: 40 },
    });

    const result = await translateFields({
      name: "그린티 세럼",
      description: "수분 세럼 설명",
    });

    expect(result.translated.name.en).toBe("Green Tea Serum");
    // description은 폴백
    expect(result.translated.description.en).toBe("수분 세럼 설명");
    expect(result.translated.description.ko).toBe("수분 세럼 설명");
  });

  it("AI 응답에 일부 언어 누락 → 해당 언어만 ko 폴백", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        name: {
          en: "Green Tea Serum",
          ja: "グリーンティーセラム",
          // zh, es, fr 누락
        },
      }),
      usage: { inputTokens: 50, outputTokens: 60 },
    });

    const result = await translateFields(
      { name: "그린티 세럼" },
      ALL_TARGET_LANGS,
    );

    expect(result.translated.name.en).toBe("Green Tea Serum");
    expect(result.translated.name.ja).toBe("グリーンティーセラム");
    // 누락 언어는 ko 폴백
    expect(result.translated.name.zh).toBe("그린티 세럼");
    expect(result.translated.name.es).toBe("그린티 세럼");
    expect(result.translated.name.fr).toBe("그린티 세럼");
  });

  it("AI 응답에 en 값이 빈 문자열 → ko 폴백", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ name: { en: "" } }),
      usage: { inputTokens: 50, outputTokens: 10 },
    });

    const result = await translateFields({ name: "세럼" });

    // en이 빈 문자열이면 ko 원문으로 폴백 (translator.ts:131)
    expect(result.translated.name.en).toBe("세럼");
    expect(result.translated.name.ko).toBe("세럼");
  });

  it("AI 응답에 마크다운 코드 펜스 포함 → 정상 파싱", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '```json\n{"name": {"en": "Serum"}}\n```',
      usage: { inputTokens: 50, outputTokens: 30 },
    });

    const result = await translateFields({ name: "세럼" });

    expect(result.translated.name.en).toBe("Serum");
  });

  it("상수 export 검증 — DEFAULT_TARGET_LANGS", () => {
    expect(DEFAULT_TARGET_LANGS).toEqual(["en"]);
  });

  it("상수 export 검증 — ALL_TARGET_LANGS", () => {
    expect(ALL_TARGET_LANGS).toEqual(["en", "ja", "zh", "es", "fr"]);
  });
});

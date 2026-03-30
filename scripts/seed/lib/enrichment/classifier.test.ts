// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Config mock ─────────────────────────────────────────────

const { mockPipelineEnv } = vi.hoisted(() => ({
  mockPipelineEnv: {
    AI_PROVIDER: "anthropic",
    AI_MODEL: undefined,
  } as Record<string, unknown>,
}));

vi.mock("../../config", () => ({
  pipelineEnv: mockPipelineEnv,
}));

// ── AI SDK mock ─────────────────────────────────────────────

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

// ── @ai-sdk provider mocks ─────────────────────────────────

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn().mockReturnValue("anthropic-model-instance"),
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn().mockReturnValue("google-model-instance"),
}));

import {
  classifyFields,
  type FieldSpec,
  type ClassifyResult,
} from "./classifier";

// ── Fixture ─────────────────────────────────────────────────

const SKIN_TYPES = ["dry", "oily", "combination", "sensitive", "normal"];
const SKIN_CONCERNS = [
  "acne",
  "wrinkles",
  "dark_spots",
  "redness",
  "dryness",
  "pores",
  "dullness",
  "dark_circles",
  "uneven_tone",
  "sun_damage",
  "eczema",
];

const SPEC_SKIN_TYPES: FieldSpec = {
  fieldName: "skin_types",
  allowedValues: SKIN_TYPES,
  promptHint: "Skin types this product is suitable for",
};

const SPEC_CONCERNS: FieldSpec = {
  fieldName: "concerns",
  allowedValues: SKIN_CONCERNS,
  promptHint: "Skin concerns this product addresses",
};

const SAMPLE_INPUT = {
  name: "이니스프리 그린티 씨드 세럼",
  category: "skincare",
  brand: "Innisfree",
};

/** 정상 AI 응답 — 단일 필드 */
function createSingleFieldResponse() {
  return {
    text: JSON.stringify({
      skin_types: {
        values: ["dry", "combination", "normal"],
        confidence: 0.85,
      },
    }),
    usage: { inputTokens: 100, outputTokens: 60 },
  };
}

/** 정상 AI 응답 — 복수 필드 */
function createMultiFieldResponse() {
  return {
    text: JSON.stringify({
      skin_types: {
        values: ["dry", "combination"],
        confidence: 0.9,
      },
      concerns: {
        values: ["dryness", "dullness"],
        confidence: 0.75,
      },
    }),
    usage: { inputTokens: 150, outputTokens: 80 },
  };
}

// ── classifyFields 테스트 ───────────────────────────────────

describe("classifyFields", () => {
  beforeEach(() => {
    mockPipelineEnv.AI_PROVIDER = "anthropic";
    mockPipelineEnv.AI_MODEL = undefined;
    mockGenerateText.mockReset();
  });

  it("정상 분류 — 단일 필드 (skin_types)", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.values).toEqual([
      "dry",
      "combination",
      "normal",
    ]);
    expect(result.classified.skin_types.confidence).toBe(0.85);
    expect(result.classifiedFields).toEqual(["skin_types"]);
  });

  it("정상 분류 — 복수 필드 (skin_types + concerns)", async () => {
    mockGenerateText.mockResolvedValueOnce(createMultiFieldResponse());

    const result = await classifyFields(SAMPLE_INPUT, [
      SPEC_SKIN_TYPES,
      SPEC_CONCERNS,
    ]);

    expect(result.classified.skin_types.values).toEqual([
      "dry",
      "combination",
    ]);
    expect(result.classified.concerns.values).toEqual([
      "dryness",
      "dullness",
    ]);
    expect(result.classifiedFields).toHaveLength(2);
    expect(result.classifiedFields).toContain("skin_types");
    expect(result.classifiedFields).toContain("concerns");
  });

  it("허용값 외 값 필터링 — 유효값만 유지", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: {
          values: ["dry", "oily_dry", "super_sensitive", "normal"],
          confidence: 0.7,
        },
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    // oily_dry, super_sensitive는 허용값 아님 → 필터링
    expect(result.classified.skin_types.values).toEqual(["dry", "normal"]);
    expect(result.classified.skin_types.confidence).toBe(0.7);
  });

  it("빈 fieldSpecs → 빈 결과, AI 호출 없음", async () => {
    const result = await classifyFields(SAMPLE_INPUT, []);

    expect(result.classified).toEqual({});
    expect(result.classifiedFields).toEqual([]);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("AI 호출 실패 → 빈 결과", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API rate limit"));

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.values).toEqual([]);
    expect(result.classified.skin_types.confidence).toBe(0);
    expect(result.classifiedFields).toEqual([]);
  });

  it("AI 응답에 브레이스 없음 → 빈 결과 (jsonMatch null)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "I cannot classify this product.",
      usage: { inputTokens: 100, outputTokens: 10 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.values).toEqual([]);
    expect(result.classified.skin_types.confidence).toBe(0);
    expect(result.classifiedFields).toEqual([]);
  });

  it("AI 응답에 유효하지 않은 JSON → 빈 결과 (JSON.parse catch)", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "{skin_types: not valid json}",
      usage: { inputTokens: 100, outputTokens: 10 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.values).toEqual([]);
    expect(result.classifiedFields).toEqual([]);
  });

  it("confidence 범위 클램핑 — 1.0 초과 → 1.0", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: { values: ["dry"], confidence: 1.5 },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.confidence).toBe(1.0);
  });

  it("confidence 범위 클램핑 — 음수 → 0.0", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: { values: ["oily"], confidence: -0.3 },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.confidence).toBe(0.0);
  });

  it("confidence 비숫자 → 0", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: { values: ["oily"], confidence: "high" },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.confidence).toBe(0);
  });

  it("AI 응답에 일부 필드 누락 → 해당 필드만 빈 결과", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: { values: ["dry"], confidence: 0.8 },
        // concerns 필드 누락
      }),
      usage: { inputTokens: 150, outputTokens: 50 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [
      SPEC_SKIN_TYPES,
      SPEC_CONCERNS,
    ]);

    expect(result.classified.skin_types.values).toEqual(["dry"]);
    expect(result.classified.concerns.values).toEqual([]);
    expect(result.classified.concerns.confidence).toBe(0);
    // concerns는 빈 결과이므로 classifiedFields에 미포함
    expect(result.classifiedFields).toEqual(["skin_types"]);
  });

  it("AI 응답에 마크다운 코드 펜스 포함 → 정상 파싱", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '```json\n{"skin_types": {"values": ["oily"], "confidence": 0.9}}\n```',
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.values).toEqual(["oily"]);
    expect(result.classified.skin_types.confidence).toBe(0.9);
  });

  it("promptHint가 프롬프트에 포함되는지 검증", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    await classifyFields(SAMPLE_INPUT, [
      {
        fieldName: "caution_skin_types",
        allowedValues: SKIN_TYPES,
        promptHint:
          "Skin types that should be CAUTIOUS about this ingredient",
      },
    ]);

    const calledPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    expect(calledPrompt).toContain(
      "Skin types that should be CAUTIOUS about this ingredient",
    );
    expect(calledPrompt).toContain('"caution_skin_types"');
  });

  it("inputData 직렬화 — 문자열/배열/숫자/null 처리", async () => {
    mockGenerateText.mockResolvedValueOnce(createSingleFieldResponse());

    await classifyFields(
      {
        name: "테스트 세럼",
        ingredients: ["niacinamide", "hyaluronic acid"],
        price: 25000,
        description: null,
        notes: undefined,
      },
      [SPEC_SKIN_TYPES],
    );

    const calledPrompt = mockGenerateText.mock.calls[0][0].prompt as string;
    // 문자열
    expect(calledPrompt).toContain("- name: 테스트 세럼");
    // 배열 → join
    expect(calledPrompt).toContain(
      "- ingredients: niacinamide, hyaluronic acid",
    );
    // 숫자 → String()
    expect(calledPrompt).toContain("- price: 25000");
    // null/undefined → 필터링
    expect(calledPrompt).not.toContain("description");
    expect(calledPrompt).not.toContain("notes");
  });

  it("values가 배열이 아닌 경우 → 빈 배열 처리", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: { values: "dry", confidence: 0.8 },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    // values가 문자열이면 Array.isArray 실패 → 빈 배열
    expect(result.classified.skin_types.values).toEqual([]);
  });

  it("모든 값이 허용값 외 → values 빈 배열, classifiedFields 미포함", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        skin_types: {
          values: ["super_oily", "mega_dry"],
          confidence: 0.9,
        },
      }),
      usage: { inputTokens: 100, outputTokens: 40 },
    });

    const result = await classifyFields(SAMPLE_INPUT, [SPEC_SKIN_TYPES]);

    expect(result.classified.skin_types.values).toEqual([]);
    // 유효값 0개 → classifiedFields에 미포함
    expect(result.classifiedFields).toEqual([]);
  });
});

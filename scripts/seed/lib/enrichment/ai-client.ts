// ============================================================
// Pipeline AI Model Factory — data-pipeline.md §3.2.2
// server/core/config.ts의 getModel()은 envSchema.parse 부작용으로
// 파이프라인 CLI에서 import 불가 (ADMIN_JWT_SECRET 등 15개 미보유).
// 따라서 pipelineEnv 기반 독립 팩토리. P-7: 프로바이더 변경 = 이 파일 + .env만.
// P-9: scripts/ 내부 import만. server/ import 금지.
// ============================================================

import { pipelineEnv } from "../../config";

// ── 타입 (L-14: 모듈 내부 전용) ─────────────────────────────

type AIProvider = "anthropic" | "google";

// ── 상수 (G-10) ─────────────────────────────────────────────

/** 프로바이더별 기본 모델명 — server/core/config.ts:97-100과 동일 값 유지 */
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-5-20250929",
  google: "gemini-2.0-flash",
};

// ── 팩토리 함수 ─────────────────────────────────────────────

/**
 * 파이프라인 전용 LLM 모델 인스턴스 반환.
 * pipelineEnv.AI_PROVIDER + AI_MODEL 기반.
 * Fallback 없음 (파이프라인은 배치 처리, 실패 시 건별 폴백).
 */
export async function getPipelineModel() {
  const provider = pipelineEnv.AI_PROVIDER;
  const modelName = pipelineEnv.AI_MODEL ?? DEFAULT_MODELS[provider];

  switch (provider) {
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelName);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(modelName);
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

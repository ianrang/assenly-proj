// ============================================================
// AI 프롬프트 공통 유틸 — G-2: classifier + description-generator 공유
// P-9: scripts/ 내부만. server/ import 금지.
// ============================================================

/** AI 프롬프트 입력 데이터 타입 */
export type PromptInputData = Record<
  string,
  string | string[] | number | null | undefined
>;

/** 입력 데이터를 프롬프트용 문자열로 직렬화 */
export function serializeInputData(inputData: PromptInputData): string {
  return Object.entries(inputData)
    .filter(([, v]) => v != null)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `- ${key}: ${value.join(", ")}`;
      }
      return `- ${key}: ${value}`;
    })
    .join("\n");
}

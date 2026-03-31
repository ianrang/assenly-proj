import type { LocalizedText } from "../types/domain";

/** LocalizedText에서 locale에 해당하는 텍스트를 반환. 없으면 en 폴백. */
export function localized(text: LocalizedText | null | undefined, locale: string): string {
  if (!text) return "";
  return text[locale as keyof LocalizedText] ?? text.en ?? "";
}

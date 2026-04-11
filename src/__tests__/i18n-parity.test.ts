import { describe, it, expect } from 'vitest';
import enMessages from '../../messages/en.json';
import koMessages from '../../messages/ko.json';

/** 재귀적으로 JSON 객체의 키 구조를 추출 */
function extractKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...extractKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe('i18n message parity', () => {
  it('ko.json과 en.json의 키 구조가 동일하다', () => {
    const enKeys = extractKeys(enMessages as Record<string, unknown>);
    const koKeys = extractKeys(koMessages as Record<string, unknown>);

    const missingInKo = enKeys.filter((k) => !koKeys.includes(k));
    const extraInKo = koKeys.filter((k) => !enKeys.includes(k));

    expect(missingInKo).toEqual([]);
    expect(extraInKo).toEqual([]);
  });
});

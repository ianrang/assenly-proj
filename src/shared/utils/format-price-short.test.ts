import { describe, it, expect } from 'vitest';
import { formatPriceShort } from './format-price-short';

describe('formatPriceShort', () => {
  it('39841 → "~₩40k" (천 단위 반올림)', () => {
    expect(formatPriceShort(39_841)).toBe('~₩40k');
  });

  it('200000 → "~₩200k"', () => {
    expect(formatPriceShort(200_000)).toBe('~₩200k');
  });

  it('25000 → "~₩25k" (정확한 천 단위)', () => {
    expect(formatPriceShort(25_000)).toBe('~₩25k');
  });

  it('1500000 → "~₩1.5M" (백만 단위)', () => {
    expect(formatPriceShort(1_500_000)).toBe('~₩1.5M');
  });

  it('1000000 → "~₩1M" (정확한 백만)', () => {
    expect(formatPriceShort(1_000_000)).toBe('~₩1M');
  });

  it('999 → "₩999" (1000 미만은 반올림 없이 그대로)', () => {
    expect(formatPriceShort(999)).toBe('₩999');
  });

  it('500 → "₩500"', () => {
    expect(formatPriceShort(500)).toBe('₩500');
  });

  it('0 → "₩0"', () => {
    expect(formatPriceShort(0)).toBe('₩0');
  });

  it('null → null', () => {
    expect(formatPriceShort(null)).toBeNull();
  });

  it('음수 → null', () => {
    expect(formatPriceShort(-100)).toBeNull();
  });

  it('48552 → "~₩49k" (반올림)', () => {
    expect(formatPriceShort(48_552)).toBe('~₩49k');
  });
});

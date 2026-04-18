import { describe, it, expect } from 'vitest';
import { computeTier } from './compute-tier';

const PRODUCT_THRESHOLDS = { low: 25_000, high: 50_000 };
const TREATMENT_THRESHOLDS = { low: 50_000, high: 200_000 };

describe('computeTier', () => {
  describe('product 도메인 (thresholds: 25k/50k)', () => {
    it('price=20000 → "$"', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 20_000)).toBe('$');
    });

    it('price=35000 → "$$"', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 35_000)).toBe('$$');
    });

    it('price=60000 → "$$$"', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 60_000)).toBe('$$$');
    });
  });

  describe('treatment 도메인 (thresholds: 50k/200k)', () => {
    it('price=40000 → "$"', () => {
      expect(computeTier(TREATMENT_THRESHOLDS, 40_000)).toBe('$');
    });

    it('price=100000 → "$$"', () => {
      expect(computeTier(TREATMENT_THRESHOLDS, 100_000)).toBe('$$');
    });

    it('price=300000 → "$$$"', () => {
      expect(computeTier(TREATMENT_THRESHOLDS, 300_000)).toBe('$$$');
    });
  });

  describe('경계값', () => {
    it('price=25000 → "$$" (low 이상)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 25_000)).toBe('$$');
    });

    it('price=50000 → "$$" (high 이하)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 50_000)).toBe('$$');
    });

    it('price=50001 → "$$$" (high 초과)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 50_001)).toBe('$$$');
    });

    it('price=24999 → "$" (low 미만)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 24_999)).toBe('$');
    });
  });

  describe('range fallback (price_min)', () => {
    it('price=null, rangeMin=20000 → "$" (price_min 사용)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, null, 20_000)).toBe('$');
    });

    it('price=null, rangeMin=50000 → "$$"', () => {
      expect(computeTier(TREATMENT_THRESHOLDS, null, 50_000)).toBe('$$');
    });

    it('price 우선: price=20000, rangeMin=40000 → "$" (price가 우선)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 20_000, 40_000)).toBe('$');
    });
  });

  describe('null 반환', () => {
    it('price=null, rangeMin=null → null', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, null, null)).toBeNull();
    });

    it('price=null, rangeMin=undefined → null', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, null)).toBeNull();
    });
  });

  describe('엣지 케이스', () => {
    it('price=0 → "$" (0은 유효한 최저가)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, 0)).toBe('$');
    });

    it('price 음수 → null (방어)', () => {
      expect(computeTier(PRODUCT_THRESHOLDS, -100)).toBeNull();
    });
  });
});

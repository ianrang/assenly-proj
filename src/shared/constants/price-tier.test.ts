import { describe, it, expect } from 'vitest';
import {
  PRICE_TIER_CONFIG,
  type PriceDomain,
  type TierLevel,
  type DomainTierConfig,
} from './price-tier';

describe('PRICE_TIER_CONFIG', () => {
  it('product 도메인이 존재한다', () => {
    expect(PRICE_TIER_CONFIG.product).toBeDefined();
  });

  it('treatment 도메인이 존재한다', () => {
    expect(PRICE_TIER_CONFIG.treatment).toBeDefined();
  });

  it('product 임계값이 옵션 B 확정값과 일치한다', () => {
    const { thresholds } = PRICE_TIER_CONFIG.product;
    expect(thresholds.low).toBe(25_000);
    expect(thresholds.high).toBe(50_000);
  });

  it('treatment 임계값이 옵션 B 확정값과 일치한다', () => {
    const { thresholds } = PRICE_TIER_CONFIG.treatment;
    expect(thresholds.low).toBe(50_000);
    expect(thresholds.high).toBe(200_000);
  });

  it.each<PriceDomain>(['product', 'treatment'])(
    '%s 도메인에 thresholds, labels, tooltipRange가 존재한다',
    (domain) => {
      const config: DomainTierConfig = PRICE_TIER_CONFIG[domain];
      expect(config.thresholds).toHaveProperty('low');
      expect(config.thresholds).toHaveProperty('high');
      expect(config.thresholds.low).toBeLessThan(config.thresholds.high);

      expect(config.labels).toHaveProperty('$');
      expect(config.labels).toHaveProperty('$$');
      expect(config.labels).toHaveProperty('$$$');

      expect(typeof config.tooltipRange).toBe('string');
      expect(config.tooltipRange.length).toBeGreaterThan(0);
    },
  );

  it('labels 값은 비어있지 않은 문자열이다', () => {
    for (const domain of ['product', 'treatment'] as PriceDomain[]) {
      const { labels } = PRICE_TIER_CONFIG[domain];
      for (const tier of ['$', '$$', '$$$'] as TierLevel[]) {
        expect(typeof labels[tier]).toBe('string');
        expect(labels[tier].length).toBeGreaterThan(0);
      }
    }
  });
});

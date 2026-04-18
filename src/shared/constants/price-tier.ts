// ============================================================
// 가격 티어 설정 — NEW-35 단일 변경점 (P-7, S-5, G-10)
// 모든 임계값·라벨은 이 파일에서만 정의. 다른 곳에서 하드코딩 금지.
// 정본: docs/audit/price-coverage-20260417.md (옵션 B 확정)
// ============================================================

import type { TierLevel, PriceDomain } from '../types/domain';

export type { TierLevel, PriceDomain };

/** 도메인별 티어 설정 */
export interface DomainTierConfig {
  /** $ < low, low ≤ $$ ≤ high, $$$ > high */
  thresholds: { low: number; high: number };
  /** 티어별 표시 라벨 (영어) */
  labels: Record<TierLevel, string>;
  /** 툴팁에 표시할 범위 텍스트 */
  tooltipRange: string;
}

/**
 * 도메인별 가격 티어 설정.
 * 임계값 근거: 04-17 감사 리포트 quantile (옵션 B 라운딩 친화)
 * - products: p25=25,392→25k, p75=48,552→50k
 * - treatments (price_min 기준): p25=50,000, p75=200,000 (정확 일치)
 */
export const PRICE_TIER_CONFIG: Record<PriceDomain, DomainTierConfig> = {
  product: {
    thresholds: { low: 25_000, high: 50_000 },
    labels: {
      '$': 'Budget',
      '$$': 'Mid-range',
      '$$$': 'Premium',
    },
    tooltipRange: '₩25,000–₩50,000',
  },
  treatment: {
    thresholds: { low: 50_000, high: 200_000 },
    labels: {
      '$': 'Budget',
      '$$': 'Mid-range',
      '$$$': 'Premium',
    },
    tooltipRange: '₩50,000–₩200,000',
  },
} as const;

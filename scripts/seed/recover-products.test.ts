import { describe, it, expect } from 'vitest';
import { recoverBrand, isCorruptedProduct, buildRecoveredRecord } from './recover-products';

describe('recover-products 순수 함수', () => {
  describe('isCorruptedProduct', () => {
    it('enriched와 validated의 brand가 다르면 오염 판정', () => {
      const enriched = { brand: 'Sulwhasoo', name_en: 'Sulwhasoo Cream' };
      const validated = { brand: 'Kamill', name_en: 'Sulwhasoo Cream' };
      expect(isCorruptedProduct(enriched, validated)).toBe(true);
    });

    it('brand가 같으면 정상 판정', () => {
      const enriched = { brand: 'Innisfree', name_en: 'Innisfree Cream' };
      const validated = { brand: 'Innisfree', name_en: 'Innisfree Cream' };
      expect(isCorruptedProduct(enriched, validated)).toBe(false);
    });
  });

  describe('recoverBrand', () => {
    it('enriched에서 brand와 brand_id를 복원한다', () => {
      const enriched = { brand: 'Sulwhasoo', brand_id: 'uuid-123' };
      const result = recoverBrand(enriched);
      expect(result).toEqual({ brand: 'Sulwhasoo', brand_id: 'uuid-123' });
    });
  });

  describe('buildRecoveredRecord', () => {
    it('오염 제품의 brand 복원 + images/links/price 초기화', () => {
      const validated = {
        entityType: 'product',
        data: {
          id: 'abc',
          brand: 'Kamill',
          brand_id: 'wrong-id',
          name: { en: 'Sulwhasoo Cream', ko: '설화수 크림' },
          images: ['https://wrong.com/img.jpg'],
          purchase_links: [{ platform: 'OY', url: 'https://wrong.com' }],
          price: 99999,
          price_min: null,
          price_max: null,
        },
        isApproved: true,
      };
      const enriched = { brand: 'Sulwhasoo', brand_id: 'correct-id' };

      const result = buildRecoveredRecord(validated, enriched);

      expect(result.data.brand).toBe('Sulwhasoo');
      expect(result.data.brand_id).toBe('correct-id');
      expect(result.data.images).toEqual([]);
      expect(result.data.purchase_links).toBeNull();
      expect(result.data.price).toBeNull();
    });

    it('정상 제품은 기존 데이터 보존', () => {
      const validated = {
        entityType: 'product',
        data: {
          id: 'abc',
          brand: 'Innisfree',
          brand_id: 'inn-id',
          name: { en: 'Innisfree Cream', ko: '이니스프리 크림' },
          images: ['https://cdn.oliveyoung.com/img.jpg'],
          purchase_links: [{ platform: 'OY', url: 'https://global.oliveyoung.com/detail' }],
          price: 25000,
          price_min: null,
          price_max: null,
        },
        isApproved: true,
      };
      const enriched = { brand: 'Innisfree', brand_id: 'inn-id' };

      const result = buildRecoveredRecord(validated, enriched);

      expect(result.data.brand).toBe('Innisfree');
      expect(result.data.images).toEqual(['https://cdn.oliveyoung.com/img.jpg']);
      expect(result.data.purchase_links).toHaveLength(1);
      expect(result.data.price).toBe(25000);
    });
  });
});

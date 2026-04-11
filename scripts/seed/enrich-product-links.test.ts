import { describe, it, expect } from 'vitest';
import { isValidImageUrl, buildSearchUrl, resolveProductUrl } from './enrich-product-links';

describe('enrich-product-links 순수 함수', () => {
  describe('isValidImageUrl', () => {
    it('https:// URL은 유효하다', () => {
      expect(isValidImageUrl('https://image.oliveyoung.co.kr/product/123.jpg')).toBe(true);
    });

    it('http:// URL은 유효하지 않다', () => {
      expect(isValidImageUrl('http://image.example.com/pic.jpg')).toBe(false);
    });

    it('빈 문자열은 유효하지 않다', () => {
      expect(isValidImageUrl('')).toBe(false);
    });

    it('null/undefined는 유효하지 않다', () => {
      expect(isValidImageUrl(null)).toBe(false);
      expect(isValidImageUrl(undefined)).toBe(false);
    });

    it('공백만 있는 문자열은 유효하지 않다', () => {
      expect(isValidImageUrl('   ')).toBe(false);
    });
  });

  describe('buildSearchUrl', () => {
    it('영문 제품명으로 검색 URL을 생성한다', () => {
      const url = buildSearchUrl('Innisfree Green Tea Seed Cream');
      expect(url).toBe('https://global.oliveyoung.com/search?query=Innisfree%20Green%20Tea%20Seed%20Cream');
    });

    it('특수 문자가 포함된 제품명을 인코딩한다', () => {
      const url = buildSearchUrl('COSRX AHA/BHA Toner');
      expect(url).toContain('COSRX%20AHA%2FBHA%20Toner');
    });
  });

  describe('resolveProductUrl', () => {
    it('상대 URL을 절대 URL로 변환한다', () => {
      expect(resolveProductUrl('/product/detail?id=123')).toBe(
        'https://global.oliveyoung.com/product/detail?id=123'
      );
    });

    it('절대 URL은 그대로 반환한다', () => {
      expect(resolveProductUrl('https://global.oliveyoung.com/product/123')).toBe(
        'https://global.oliveyoung.com/product/123'
      );
    });

    it('null은 null을 반환한다', () => {
      expect(resolveProductUrl(null)).toBeNull();
    });
  });
});

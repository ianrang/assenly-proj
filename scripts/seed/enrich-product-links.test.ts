import { describe, it, expect } from 'vitest';
import { isValidImageUrl, buildSearchUrl, resolveProductUrl, brandMatches, parseKrwPrice } from './enrich-product-links';

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
      expect(url).toBe('https://global.oliveyoung.com/display/search?query=Innisfree%20Green%20Tea%20Seed%20Cream');
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

  describe('brandMatches', () => {
    it('정확히 일치하면 true', () => {
      expect(brandMatches('Innisfree', 'Innisfree')).toBe(true);
    });

    it('대소문자 무관 일치', () => {
      expect(brandMatches('COSRX', 'cosrx')).toBe(true);
    });

    it('완전히 다른 브랜드면 false', () => {
      expect(brandMatches('Sulwhasoo', 'Kamill')).toBe(false);
    });

    it('부분 포함 (페이지 브랜드가 DB 브랜드를 포함)', () => {
      expect(brandMatches('Dr.Jart+', 'Dr. Jart+')).toBe(true);
    });

    it('특수문자 무시 비교', () => {
      expect(brandMatches("dear, Klairs", "dear Klairs")).toBe(true);
    });
  });

  describe('parseKrwPrice', () => {
    it('₩ 기호 + 쉼표 구분 숫자 파싱', () => {
      expect(parseKrwPrice('₩25,000')).toBe(25000);
    });

    it('원 텍스트 파싱', () => {
      expect(parseKrwPrice('25,000원')).toBe(25000);
    });

    it('KRW 접두사', () => {
      expect(parseKrwPrice('KRW 12,500')).toBe(12500);
    });

    it('숫자만 있으면 그대로 반환', () => {
      expect(parseKrwPrice('35000')).toBe(35000);
    });

    it('파싱 불가 시 null', () => {
      expect(parseKrwPrice('Free')).toBeNull();
      expect(parseKrwPrice('')).toBeNull();
    });
  });
});

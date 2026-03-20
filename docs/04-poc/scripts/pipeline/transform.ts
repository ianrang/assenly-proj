/**
 * 변환 레이어: RawPlace → StoreRow / ClinicRow
 *
 * 프로바이더 독립적. 외부 데이터를 DB 스키마에 맞게 변환.
 */
import type { RawPlace, StoreRow, ClinicRow } from './types.js';

/** 카테고리 기반 엔티티 타입 판별 */
export function classifyPlace(raw: RawPlace): 'store' | 'clinic' | 'unknown' {
  const cat = (raw.category ?? '').toLowerCase();
  const name = raw.name.toLowerCase();

  // 클리닉/병원 키워드
  if (/clinic|피부과|의원|병원|클리닉|dermatolog|aesthetic|laser/i.test(cat + ' ' + name)) {
    return 'clinic';
  }

  // 매장 키워드
  if (/store|shop|올리브영|시코르|뷰티|beauty|cosmetic|화장품|drugstore/i.test(cat + ' ' + name)) {
    return 'store';
  }

  return 'unknown';
}

/** 주소에서 서울 구 추출 */
function extractDistrict(address: string): string | undefined {
  const match = address.match(/(강남|서초|송파|마포|용산|종로|중구|성동|광진|동대문|성북|강북|도봉|노원|은평|서대문|홍대|이태원|명동|압구정|청담|신사|잠실|건대|혜화|연남|합정|상수)/);
  return match ? match[1] : undefined;
}

/** 외부 링크 생성 */
function buildExternalLinks(raw: RawPlace): Array<{ type: string; url: string; label: string }> {
  const links: Array<{ type: string; url: string; label: string }> = [];

  if (raw.placeUrl) {
    if (raw.source === 'kakao') {
      links.push({ type: 'kakao_map', url: raw.placeUrl, label: 'Kakao Map' });
    } else if (raw.source === 'naver') {
      links.push({ type: 'naver_map', url: raw.placeUrl, label: 'Naver' });
    } else if (raw.source === 'google') {
      links.push({ type: 'google_map', url: raw.placeUrl, label: 'Google Maps' });
    }
  }

  if (raw.website) {
    links.push({ type: 'website', url: raw.website, label: 'Website' });
  }

  return links;
}

/** PostGIS POINT 형식 생성 */
function toPointWKT(lat: number, lng: number): string {
  return `POINT(${lng} ${lat})`;
}

/** RawPlace → StoreRow */
export function toStoreRow(raw: RawPlace): StoreRow {
  return {
    name: { ko: raw.name, en: raw.nameEn ?? raw.name },
    country: 'KR',
    city: 'seoul',
    district: raw.address ? extractDistrict(raw.address) : undefined,
    location: raw.lat && raw.lng ? toPointWKT(raw.lat, raw.lng) : undefined,
    address: raw.address ? { ko: raw.address, en: raw.address } : undefined,
    english_support: 'none',
    store_type: raw.category ?? undefined,
    external_links: buildExternalLinks(raw),
    rating: raw.rating,
    status: 'active',
  };
}

/** RawPlace → ClinicRow */
export function toClinicRow(raw: RawPlace): ClinicRow {
  return {
    name: { ko: raw.name, en: raw.nameEn ?? raw.name },
    country: 'KR',
    city: 'seoul',
    district: raw.address ? extractDistrict(raw.address) : undefined,
    location: raw.lat && raw.lng ? toPointWKT(raw.lat, raw.lng) : undefined,
    address: raw.address ? { ko: raw.address, en: raw.address } : undefined,
    english_support: 'none',
    clinic_type: raw.category ?? undefined,
    external_links: buildExternalLinks(raw),
    rating: raw.rating,
    status: 'active',
  };
}

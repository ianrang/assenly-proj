/**
 * Mock 프로바이더 — API 키 없이 파이프라인 로직 검증용
 *
 * 카카오 API 응답 형식과 동일한 구조의 샘플 데이터 반환.
 * 실제 프로바이더 키가 없을 때 자동 폴백으로 사용.
 */
import type { PlaceProvider, RawPlace } from '../types.js';

const MOCK_STORES: RawPlace[] = [
  {
    source: 'mock',
    sourceId: 'mock-store-001',
    name: '올리브영 강남타운점',
    nameEn: 'Olive Young Gangnam Town',
    category: '화장품 > 뷰티샵',
    address: '서울 강남구 강남대로 422',
    lat: 37.5013,
    lng: 127.0262,
    phone: '02-555-1234',
    placeUrl: 'https://map.kakao.com/mock/oliveyoung-gangnam',
    website: 'https://oliveyoung.co.kr',
  },
  {
    source: 'mock',
    sourceId: 'mock-store-002',
    name: '시코르 강남점',
    nameEn: 'CHICOR Gangnam',
    category: '화장품 > 뷰티샵',
    address: '서울 강남구 테헤란로 151',
    lat: 37.5045,
    lng: 127.0490,
    phone: '02-555-5678',
    placeUrl: 'https://map.kakao.com/mock/chicor-gangnam',
    rating: 4.3,
  },
  {
    source: 'mock',
    sourceId: 'mock-store-003',
    name: '아리따움 신사점',
    nameEn: 'Aritaum Sinsa',
    category: '화장품 > 뷰티샵',
    address: '서울 강남구 압구정로 12길 18',
    lat: 37.5225,
    lng: 127.0230,
    rating: 4.1,
  },
];

const MOCK_CLINICS: RawPlace[] = [
  {
    source: 'mock',
    sourceId: 'mock-clinic-001',
    name: '강남글로우피부과',
    nameEn: 'Gangnam Glow Dermatology',
    category: '의료 > 피부과',
    address: '서울 강남구 논현로 838',
    lat: 37.5110,
    lng: 127.0340,
    phone: '02-333-1234',
    website: 'https://gangnamglow.com',
    placeUrl: 'https://map.kakao.com/mock/gangnam-glow',
    rating: 4.5,
  },
  {
    source: 'mock',
    sourceId: 'mock-clinic-002',
    name: '서울스킨랩 압구정점',
    nameEn: 'Seoul Skin Lab Apgujeong',
    category: '의료 > 피부과 > 미용',
    address: '서울 강남구 압구정로 340',
    lat: 37.5270,
    lng: 127.0350,
    phone: '02-333-5678',
    placeUrl: 'https://map.kakao.com/mock/seoul-skin-lab',
    rating: 4.3,
  },
];

export const mockProvider: PlaceProvider = {
  name: 'mock',

  isAvailable() {
    return true; // 항상 사용 가능
  },

  async search(query: string): Promise<RawPlace[]> {
    // 쿼리 키워드로 매장/클리닉 필터
    const q = query.toLowerCase();
    if (/피부과|클리닉|clinic|derma/i.test(q)) {
      return MOCK_CLINICS;
    }
    if (/올리브영|시코르|뷰티|beauty|store|shop/i.test(q)) {
      return MOCK_STORES;
    }
    // 전체 반환
    return [...MOCK_STORES, ...MOCK_CLINICS];
  },
};

/**
 * 데이터 파이프라인 공통 타입
 *
 * 모든 프로바이더는 이 인터페이스를 구현.
 * 외부 소스 → RawPlace → StoreRow/ClinicRow → Supabase INSERT
 */

/** 프로바이더가 반환하는 원시 장소 데이터 */
export interface RawPlace {
  source: string;          // 'kakao' | 'naver' | 'google' | 'mock'
  sourceId: string;        // 외부 소스의 고유 ID
  name: string;            // 한국어 이름
  nameEn?: string;         // 영어 이름 (있으면)
  category?: string;       // 원본 카테고리
  address?: string;        // 도로명 또는 지번 주소
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  operatingHours?: string; // 원본 영업시간 텍스트
  rating?: number;
  placeUrl?: string;       // 외부 링크 (카카오맵, 네이버맵 등)
  raw?: Record<string, unknown>; // 원본 데이터 전체 (디버깅용)
}

/** DB stores 테이블 행 */
export interface StoreRow {
  name: Record<string, string>;     // { ko, en }
  description?: Record<string, string>;
  country: string;
  city: string;
  district?: string;
  location?: string;                // GEOGRAPHY POINT (PostGIS format)
  address?: Record<string, string>;
  operating_hours?: Record<string, unknown>;
  english_support: string;
  store_type?: string;
  external_links?: Array<{ type: string; url: string; label: string }>;
  rating?: number;
  status: string;
}

/** DB clinics 테이블 행 */
export interface ClinicRow {
  name: Record<string, string>;
  description?: Record<string, string>;
  country: string;
  city: string;
  district?: string;
  location?: string;
  address?: Record<string, string>;
  operating_hours?: Record<string, unknown>;
  english_support: string;
  clinic_type?: string;
  external_links?: Array<{ type: string; url: string; label: string }>;
  rating?: number;
  status: string;
}

/** 프로바이더 인터페이스 */
export interface PlaceProvider {
  name: string;
  isAvailable(): boolean;  // API 키 존재 여부
  search(query: string, options?: { lat?: number; lng?: number; radius?: number }): Promise<RawPlace[]>;
}

/** 파이프라인 결과 */
export interface PipelineResult {
  provider: string;
  fetched: number;
  transformed: number;
  loaded: number;
  errors: string[];
}

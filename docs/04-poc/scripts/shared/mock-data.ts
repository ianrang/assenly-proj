/**
 * PoC Mock 데이터 — PRD §3.5 / §4-B 기반
 *
 * 프로덕션에서는 Supabase DB + RAG 검색으로 대체
 */

export const MOCK_PRODUCTS = [
  {
    id: 'prod-001',
    name: { en: 'COSRX Advanced Snail 96 Mucin Power Essence', ko: 'COSRX 어드밴스드 스네일 96 뮤신 파워 에센스' },
    brand: 'COSRX',
    price: 18000,
    category: 'essence',
    skin_types: ['dry', 'combination', 'normal'],
    concerns: ['dryness', 'dullness', 'wrinkles'],
    key_ingredients: ['Snail Secretion Filtrate (96%)'],
    english_label: true,
    tourist_popular: true,
    rating: 4.7,
    review_count: 2340,
    is_highlighted: false,
  },
  {
    id: 'prod-002',
    name: { en: 'Beauty of Joseon Glow Serum', ko: '조선미녀 광채 세럼' },
    brand: 'Beauty of Joseon',
    price: 12000,
    category: 'serum',
    skin_types: ['oily', 'combination'],
    concerns: ['dullness', 'dark_spots', 'pores'],
    key_ingredients: ['Propolis Extract', 'Niacinamide'],
    english_label: true,
    tourist_popular: true,
    rating: 4.8,
    review_count: 1890,
    is_highlighted: true,
    highlight_badge: { en: 'Essenly Pick', ko: '에센리 픽' },
  },
  {
    id: 'prod-003',
    name: { en: 'Torriden DIVE-IN Low Molecular Hyaluronic Acid Serum', ko: '토리든 다이브인 저분자 히알루론산 세럼' },
    brand: 'Torriden',
    price: 16000,
    category: 'serum',
    skin_types: ['dry', 'sensitive', 'normal'],
    concerns: ['dryness', 'redness', 'sensitivity'],
    key_ingredients: ['5 types Hyaluronic Acid'],
    english_label: true,
    tourist_popular: true,
    rating: 4.6,
    review_count: 1560,
    is_highlighted: false,
  },
];

// 추가 제품 (P0-20: 10건 필요)
export const MOCK_PRODUCTS_EXTRA = [
  {
    id: 'prod-004',
    name: { en: 'Beauty of Joseon Relief Sun Rice + Probiotics SPF50+', ko: '조선미녀 맑은쌀 선크림' },
    brand: 'Beauty of Joseon',
    price: 11000,
    category: 'sunscreen',
    skin_types: ['sensitive', 'dry', 'normal'],
    concerns: ['sun_damage', 'redness'],
    key_ingredients: ['Rice Extract', 'Probiotics'],
    english_label: true,
    tourist_popular: true,
    rating: 4.9,
    review_count: 3200,
    is_highlighted: false,
  },
  {
    id: 'prod-005',
    name: { en: 'COSRX Low pH Good Morning Gel Cleanser', ko: 'COSRX 로우 pH 굿모닝 젤 클렌저' },
    brand: 'COSRX',
    price: 9000,
    category: 'cleanser',
    skin_types: ['oily', 'combination', 'sensitive'],
    concerns: ['acne', 'pores'],
    key_ingredients: ['Tea Tree Oil', 'BHA'],
    english_label: true,
    tourist_popular: true,
    rating: 4.5,
    review_count: 1800,
    is_highlighted: false,
  },
];

// 모든 제품 통합
export const ALL_PRODUCTS = [...MOCK_PRODUCTS, ...MOCK_PRODUCTS_EXTRA];

export const MOCK_TREATMENTS = [
  {
    id: 'treat-001',
    name: { en: 'Hydrafacial', ko: '하이드라페이셜' },
    clinic_name: { en: 'Gangnam Glow Clinic', ko: '강남 글로우 클리닉' },
    category: 'facial',
    target_concerns: ['dryness', 'pores', 'dullness'],
    suitable_skin_types: ['dry', 'oily', 'combination', 'normal'],
    price_range: { min: 80000, max: 150000, currency: 'KRW' },
    duration_minutes: 60,
    downtime_days: 0,
    english_support: 'fluent',
    rating: 4.5,
    is_highlighted: false,
  },
  {
    id: 'treat-002',
    name: { en: 'Laser Toning (Pico)', ko: '레이저 토닝 (피코)' },
    clinic_name: { en: 'Seoul Skin Lab', ko: '서울 스킨 랩' },
    category: 'laser',
    target_concerns: ['dark_spots', 'dullness', 'pores'],
    suitable_skin_types: ['oily', 'combination', 'normal'],
    price_range: { min: 100000, max: 200000, currency: 'KRW' },
    duration_minutes: 30,
    downtime_days: 1,
    english_support: 'basic',
    rating: 4.3,
    is_highlighted: true,
    highlight_badge: { en: 'Popular with Tourists', ko: '관광객 인기' },
  },
];

// 추가 시술
export const MOCK_TREATMENTS_EXTRA = [
  {
    id: 'treat-003',
    name: { en: 'Chemical Peel (AHA/BHA)', ko: '케미컬 필링 (AHA/BHA)' },
    clinic_name: { en: 'Myeongdong Derm Clinic', ko: '명동 피부과' },
    category: 'peel',
    target_concerns: ['acne', 'dark_spots', 'uneven_tone'],
    suitable_skin_types: ['oily', 'combination'],
    price_range: { min: 50000, max: 80000, currency: 'KRW' },
    duration_minutes: 30,
    downtime_days: 2,
    english_support: 'fluent',
    rating: 4.2,
    is_highlighted: false,
  },
  {
    id: 'treat-004',
    name: { en: 'Botox (Forehead)', ko: '보톡스 (이마)' },
    clinic_name: { en: 'Apgujeong Beauty Clinic', ko: '압구정 뷰티 클리닉' },
    category: 'injection',
    target_concerns: ['wrinkles'],
    suitable_skin_types: ['dry', 'oily', 'combination', 'sensitive', 'normal'],
    price_range: { min: 150000, max: 300000, currency: 'KRW' },
    duration_minutes: 15,
    downtime_days: 0,
    english_support: 'fluent',
    rating: 4.6,
    is_highlighted: false,
  },
  {
    id: 'treat-005',
    name: { en: 'LED Light Therapy', ko: 'LED 광치료' },
    clinic_name: { en: 'Gangnam Glow Clinic', ko: '강남 글로우 클리닉' },
    category: 'light_therapy',
    target_concerns: ['acne', 'redness', 'dullness'],
    suitable_skin_types: ['sensitive', 'oily', 'normal'],
    price_range: { min: 30000, max: 60000, currency: 'KRW' },
    duration_minutes: 20,
    downtime_days: 0,
    english_support: 'fluent',
    rating: 4.4,
    is_highlighted: false,
  },
];

// 모든 시술 통합
export const ALL_TREATMENTS = [...MOCK_TREATMENTS, ...MOCK_TREATMENTS_EXTRA];

// 전체 엔티티 (10건)
export const ALL_ENTITIES = [...ALL_PRODUCTS, ...ALL_TREATMENTS];

export const MOCK_LINKS: Record<string, { links: Array<{ type: string; url: string; label: string }> }> = {
  'prod-001': {
    links: [
      { type: 'olive_young', url: 'https://oliveyoung.co.kr/product/cosrx-snail', label: 'Olive Young' },
      { type: 'coupang', url: 'https://coupang.com/cosrx-snail', label: 'Coupang' },
    ],
  },
  'prod-002': {
    links: [
      { type: 'olive_young', url: 'https://oliveyoung.co.kr/product/boj-glow', label: 'Olive Young' },
    ],
  },
  'treat-001': {
    links: [
      { type: 'naver_booking', url: 'https://booking.naver.com/gangnam-glow', label: 'Naver Booking' },
      { type: 'naver_map', url: 'https://map.naver.com/gangnam-glow', label: 'Naver Map' },
      { type: 'website', url: 'https://gangnamglow.com', label: 'Website' },
    ],
  },
  'treat-002': {
    links: [
      { type: 'naver_map', url: 'https://map.naver.com/seoul-skin-lab', label: 'Naver Map' },
      { type: 'website', url: 'https://seoulsinlab.com', label: 'Website' },
    ],
  },
};

// ============================================================
// Beauty Domain Constants — PRD 열거값 전수 반영
// ============================================================

import type {
  SkinType,
  HairType,
  HairConcern,
  SkinConcern,
  BudgetLevel,
  TravelStyle,
  InterestActivity,
  AgeRange,
  SupportedLanguage,
} from "../types/domain";

export const SKIN_TYPES: SkinType[] = [
  "dry",
  "oily",
  "combination",
  "sensitive",
  "normal",
] as const;

export const HAIR_TYPES: HairType[] = [
  "straight",
  "wavy",
  "curly",
  "coily",
] as const;

export const HAIR_CONCERNS: HairConcern[] = [
  "damage",
  "thinning",
  "oily_scalp",
  "dryness",
  "dandruff",
  "color_treated",
] as const;

export const SKIN_CONCERNS: SkinConcern[] = [
  "acne",
  "wrinkles",
  "dark_spots",
  "redness",
  "dryness",
  "pores",
  "dullness",
  "dark_circles",
  "uneven_tone",
  "sun_damage",
  "eczema",
] as const;

export const BUDGET_LEVELS: BudgetLevel[] = [
  "budget",
  "moderate",
  "premium",
  "luxury",
] as const;

export const TRAVEL_STYLES: TravelStyle[] = [
  "efficient",
  "relaxed",
  "adventurous",
  "instagram",
  "local_experience",
  "luxury",
  "budget",
] as const;

export const INTEREST_ACTIVITIES: InterestActivity[] = [
  "shopping",
  "clinic",
  "salon",
  "dining",
  "cultural",
] as const;

export const AGE_RANGES: AgeRange[] = [
  "18-24",
  "25-29",
  "30-34",
  "35-39",
  "40-49",
  "50+",
] as const;

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  "en",
  "ja",
  "zh",
  "es",
  "fr",
  "ko",
] as const;

/** Onboarding UI: max 3 skin concerns selectable */
export const MAX_ONBOARDING_SKIN_CONCERNS = 3;

/** PRD §4-A JC-1: 온보딩 UI에 표시하는 7개 피부 고민 (나머지 4개는 대화 추출) */
export const ONBOARDING_SKIN_CONCERNS: SkinConcern[] = [
  "acne",
  "wrinkles",
  "dark_spots",
  "redness",
  "dryness",
  "pores",
  "dullness",
] as const;

/** PRD §4-A JC-5: 온보딩 UI에 표시하는 5개 여행 스타일 (luxury/budget은 JC-4와 중복, 대화 추출) */
export const ONBOARDING_TRAVEL_STYLES: TravelStyle[] = [
  "efficient",
  "relaxed",
  "adventurous",
  "instagram",
  "local_experience",
] as const;

/** 온보딩 국가 목록 (주요 K-뷰티 관광 출발국) */
export const ONBOARDING_COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "JP", label: "Japan" },
  { value: "CN", label: "China" },
  { value: "TW", label: "Taiwan" },
  { value: "TH", label: "Thailand" },
  { value: "VN", label: "Vietnam" },
  { value: "SG", label: "Singapore" },
  { value: "MY", label: "Malaysia" },
  { value: "ID", label: "Indonesia" },
  { value: "PH", label: "Philippines" },
  { value: "IN", label: "India" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "ES", label: "Spain" },
  { value: "IT", label: "Italy" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "AU", label: "Australia" },
  { value: "CA", label: "Canada" },
  { value: "BR", label: "Brazil" },
  { value: "MX", label: "Mexico" },
  { value: "RU", label: "Russia" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "AE", label: "UAE" },
  { value: "KR", label: "South Korea" },
  { value: "OTHER", label: "Other" },
] as const;

/** DB: max 5 skin concerns storable */
export const MAX_STORED_SKIN_CONCERNS = 5;

/** Consent items (PRD §4-C) */
export const CONSENT_ITEMS = [
  { key: "location_tracking", label: "Location tracking", required: false },
  { key: "behavior_logging", label: "Behavior logging", required: false },
  { key: "data_retention", label: "Long-term data storage", required: false },
  { key: "marketing", label: "Marketing communications", required: false },
] as const;

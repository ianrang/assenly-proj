// ============================================================
// Domain Entity Types — PRD §4 전체 엔티티
// ============================================================

/** JSONB 다국어 텍스트 (6개 언어) */
export type LocalizedText = {
  en: string;
  ko?: string;
  ja?: string;
  zh?: string;
  es?: string;
  fr?: string;
};

// --- Enums ---

export type SkinType = "dry" | "oily" | "combination" | "sensitive" | "normal";

export type HairType = "straight" | "wavy" | "curly" | "coily";

export type HairConcern =
  | "damage"
  | "thinning"
  | "oily_scalp"
  | "dryness"
  | "dandruff"
  | "color_treated";

export type SkinConcern =
  | "acne"
  | "wrinkles"
  | "dark_spots"
  | "redness"
  | "dryness"
  | "pores"
  | "dullness"
  | "dark_circles"
  | "uneven_tone"
  | "sun_damage"
  | "eczema";

export type BudgetLevel = "budget" | "moderate" | "premium" | "luxury";

export type TravelStyle =
  | "efficient"
  | "relaxed"
  | "adventurous"
  | "instagram"
  | "local_experience"
  | "luxury"
  | "budget";

export type InterestActivity =
  | "shopping"
  | "clinic"
  | "salon"
  | "dining"
  | "cultural";

export type SupportedLanguage = "en" | "ja" | "zh" | "es" | "fr" | "ko";

export type AgeRange =
  | "18-24"
  | "25-29"
  | "30-34"
  | "35-39"
  | "40-49"
  | "50+";

// --- Price metadata (products/treatments 공용) ---

export type PriceSource =
  | "manual"
  | "real"
  | "estimated-pipeline"
  | "estimated-ai"
  | "category-default";

export type PriceCurrency = "KRW" | "USD" | "JPY" | "CNY" | "EUR";

export type TierLevel = "$" | "$$" | "$$$";

export type PriceDomain = "product" | "treatment";

// --- External Links ---

export type LinkType =
  | "naver_map"
  | "kakao_map"
  | "map"
  | "website"
  | "instagram"
  | "purchase"
  | "booking"
  | "naver_booking"
  | "coupang"
  | "amazon"
  | "other";

export interface ExternalLink {
  type: LinkType;
  url: string;
  label?: string;
}

export interface PurchaseLink {
  platform: string;
  url: string;
  affiliate_code?: string;
}

// --- DOM-1: Shopping ---

export interface Product {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  brand_id: string | null;
  category: string | null;
  subcategory: string | null;
  skin_types: SkinType[];
  hair_types: HairType[];
  concerns: SkinConcern[];
  key_ingredients: string[] | null; // JSONB
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  price_currency: PriceCurrency;
  price_source: PriceSource | null;
  range_source: PriceSource | null;
  price_updated_at: string | null;
  price_source_url: string | null;
  volume: string | null;
  purchase_links: PurchaseLink[] | null;
  english_label: boolean;
  tourist_popular: boolean;
  is_highlighted: boolean;
  highlight_badge: LocalizedText | null;
  rating: number | null;
  review_count: number;
  review_summary: LocalizedText | null;
  images: string[];
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  country: string;
  city: string;
  district: string | null;
  location: { lat: number; lng: number } | null;
  address: LocalizedText | null;
  operating_hours: Record<string, string> | null;
  english_support: string;
  store_type: string | null;
  tourist_services: string[];
  payment_methods: string[];
  nearby_landmarks: string[];
  external_links: ExternalLink[];
  is_highlighted: boolean;
  highlight_badge: LocalizedText | null;
  rating: number | null;
  review_count: number;
  images: string[];
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Brand {
  id: string;
  name: LocalizedText;
  origin: string | null;
  tier: string | null;
  is_essenly: boolean;
  specialties: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: LocalizedText;
  inci_name: string | null;
  function: string[];
  caution_skin_types: SkinType[];
  common_in: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

// --- DOM-2: Treatment/Clinic ---

export interface Clinic {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  country: string;
  city: string;
  district: string | null;
  location: { lat: number; lng: number } | null;
  address: LocalizedText | null;
  operating_hours: Record<string, string> | null;
  english_support: string;
  clinic_type: string | null;
  license_verified: boolean;
  consultation_type: string[];
  foreigner_friendly: ForeignerSupport | null;
  booking_url: string | null;
  external_links: ExternalLink[];
  is_highlighted: boolean;
  highlight_badge: LocalizedText | null;
  rating: number | null;
  review_count: number;
  images: string[];
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ForeignerSupport {
  consultation_languages: string[];
  interpreter_available: boolean;
  english_consent_form: boolean;
  international_cards: boolean;
  pickup_service: boolean;
}

export interface Treatment {
  id: string;
  name: LocalizedText;
  description: LocalizedText | null;
  category: string | null;
  subcategory: string | null;
  target_concerns: SkinConcern[];
  suitable_skin_types: SkinType[];
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  price_currency: PriceCurrency;
  price_source: PriceSource | null;
  range_source: PriceSource | null;
  price_updated_at: string | null;
  price_source_url: string | null;
  duration_minutes: number | null;
  downtime_days: number | null;
  session_count: string | null;
  precautions: LocalizedText | null;
  aftercare: LocalizedText | null;
  is_highlighted: boolean;
  highlight_badge: LocalizedText | null;
  rating: number | null;
  review_count: number;
  images: string[];
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

// --- Domain Configuration ---

export interface DomainConfig {
  id: string;
  label: string;
  tabLabel: string;
  enabled: boolean;
  cardType: string;
}


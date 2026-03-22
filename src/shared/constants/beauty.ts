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

/** DB: max 5 skin concerns storable */
export const MAX_STORED_SKIN_CONCERNS = 5;

/** Consent items (PRD §4-C) */
export const CONSENT_ITEMS = [
  { key: "location_tracking", label: "Location tracking", required: false },
  { key: "behavior_logging", label: "Behavior logging", required: false },
  { key: "data_retention", label: "Long-term data storage", required: false },
  { key: "marketing", label: "Marketing communications", required: false },
] as const;

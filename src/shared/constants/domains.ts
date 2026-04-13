// ============================================================
// Domain Configuration — 5 service domains
// ============================================================

import type { DomainConfig } from "../types/domain";

export const DOMAINS: DomainConfig[] = [
  { id: "shopping", label: "Shopping", tabLabel: "Shops", enabled: true, cardType: "ProductCard" },
  { id: "clinic", label: "Treatment/Clinic", tabLabel: "Clinic", enabled: true, cardType: "TreatmentCard" },
  { id: "salon", label: "Salon", tabLabel: "Salon", enabled: false, cardType: "SalonCard" },
  { id: "dining", label: "Dining", tabLabel: "Eats", enabled: false, cardType: "DiningCard" },
  { id: "cultural", label: "Experience", tabLabel: "Exp", enabled: false, cardType: "ExperienceCard" },
] as const;

export const MVP_DOMAINS = DOMAINS.filter((d) => d.enabled);

/** Store types (DOM-1) */
export const STORE_TYPES = [
  "olive_young",
  "chicor",
  "daiso",
  "department_store",
  "brand_store",
  "pharmacy",
  "other",
] as const;

/** Clinic types (DOM-2) */
export const CLINIC_TYPES = [
  "dermatology",
  "plastic_surgery",
  "aesthetic",
  "med_spa",
] as const;

/** Treatment categories (DOM-2) */
export const TREATMENT_CATEGORIES = [
  "skin",
  "laser",
  "injection",
  "facial",
  "body",
  "hair",
] as const;

/** Product categories (DOM-1) */
export const PRODUCT_CATEGORIES = [
  "skincare",
  "makeup",
  "haircare",
  "bodycare",
  "tools",
] as const;

/** English support levels */
export const ENGLISH_SUPPORT_LEVELS = [
  "none",
  "basic",
  "good",
  "fluent",
] as const;

/** Entity status — shared across all domain entities (schema.dbml entity_status enum) */
export const ENTITY_STATUSES = [
  "active",
  "inactive",
  "temporarily_closed",
] as const;

/** Ingredient relation types (product_ingredients.type CHECK) */
export const INGREDIENT_RELATION_TYPES = ["key", "avoid"] as const;

/** Price source enum — products/treatments price_source + range_source CHECK (schema.dbml 정본) */
export const PRICE_SOURCES = [
  "manual",
  "real",
  "estimated-pipeline",
  "estimated-ai",
  "category-default",
] as const;

/** Price currency whitelist — products/treatments price_currency CHECK */
export const PRICE_CURRENCIES = ["KRW", "USD", "JPY", "CNY", "EUR"] as const;

/** Link types for external links (domain.ts LinkType 전수 반영) */
export const LINK_TYPES = [
  "naver_map",
  "kakao_map",
  "map",
  "website",
  "instagram",
  "purchase",
  "booking",
  "naver_booking",
  "coupang",
  "amazon",
  "other",
] as const;

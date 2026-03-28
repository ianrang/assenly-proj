import { z } from "zod";

import {
  ENTITY_STATUSES,
  ENGLISH_SUPPORT_LEVELS,
  LINK_TYPES,
} from "@/shared/constants";

// ============================================================
// Localized Text — JSONB multilingual fields
// ============================================================

/** Required localized text: ko + en mandatory, others optional */
export const localizedTextRequired = z.object({
  en: z.string().min(1),
  ko: z.string().min(1),
  ja: z.string().optional(),
  zh: z.string().optional(),
  es: z.string().optional(),
  fr: z.string().optional(),
});

/** Optional localized text: all fields optional, nullable */
export const localizedTextOptional = localizedTextRequired
  .partial()
  .nullable()
  .optional();

// ============================================================
// Common Enums
// ============================================================

/** Entity status — active/inactive/temporarily_closed */
export const statusEnum = z.enum(ENTITY_STATUSES);

/** English support level — none/basic/good/fluent */
export const englishSupportEnum = z.enum(ENGLISH_SUPPORT_LEVELS);

// ============================================================
// Common JSONB Structures
// ============================================================

/** ExternalLink — {type, url, label?} */
export const externalLinkSchema = z.object({
  type: z.enum(LINK_TYPES),
  url: z.string().url(),
  label: z.string().optional(),
});

/** PurchaseLink — {platform, url, affiliate_code?} */
export const purchaseLinkSchema = z.object({
  platform: z.string().min(1),
  url: z.string().url(),
  affiliate_code: z.string().optional(),
});

/** ForeignerSupport — clinic foreigner-friendly info */
export const foreignerSupportSchema = z.object({
  consultation_languages: z.array(z.string()),
  interpreter_available: z.boolean(),
  english_consent_form: z.boolean(),
  international_cards: z.boolean(),
  pickup_service: z.boolean(),
});

// ============================================================
// Common Numeric Validators
// ============================================================

/** Rating: 0.0 ~ 5.0, nullable */
export const ratingSchema = z.number().min(0).max(5).nullable().optional();

/** Review count: non-negative integer, default 0 */
export const reviewCountSchema = z
  .number()
  .int()
  .min(0)
  .default(0);

// ============================================================
// Pagination (admin list APIs)
// ============================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

import { z } from "zod";

import {
  TREATMENT_CATEGORIES,
  SKIN_TYPES,
  SKIN_CONCERNS,
  PRICE_SOURCES,
  PRICE_CURRENCIES,
} from "@/shared/constants";

import {
  localizedTextRequired,
  localizedTextOptional,
  statusEnum,
  ratingSchema,
  reviewCountSchema,
} from "./common";

// ============================================================
// Treatment — create / update schemas
// ============================================================

/** Base object shape — refine 전 원본. update에서 .partial() 재사용 */
const treatmentFields = z.object({
  name: localizedTextRequired,
  description: localizedTextOptional,
  category: z.enum(TREATMENT_CATEGORIES).nullable().optional(),
  subcategory: z.string().nullable().optional(),
  target_concerns: z.array(z.enum(SKIN_CONCERNS)).default([]),
  suitable_skin_types: z.array(z.enum(SKIN_TYPES)).default([]),
  price: z.number().int().min(0).nullable().optional(),
  price_min: z.number().int().min(0).nullable().optional(),
  price_max: z.number().int().min(0).nullable().optional(),
  price_currency: z.enum(PRICE_CURRENCIES).default("KRW"),
  price_source: z.enum(PRICE_SOURCES).nullable().optional(),
  range_source: z.enum(PRICE_SOURCES).nullable().optional(),
  price_updated_at: z.string().datetime().nullable().optional(),
  price_source_url: z.string().url().nullable().optional(),
  duration_minutes: z.number().int().min(1).nullable().optional(),
  downtime_days: z.number().int().min(0).nullable().optional(),
  session_count: z.string().nullable().optional(),
  precautions: localizedTextOptional,
  aftercare: localizedTextOptional,
  is_highlighted: z.boolean().default(false),
  highlight_badge: localizedTextOptional,
  rating: ratingSchema,
  review_count: reviewCountSchema,
  images: z.array(z.string().url()).default([]),
  tags: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

/** price_min <= price_max cross-field validation */
function refinePriceRange<T extends { price_min?: number | null; price_max?: number | null }>(
  data: T,
): boolean {
  if (data.price_min != null && data.price_max != null) {
    return data.price_min <= data.price_max;
  }
  return true;
}

const priceRangeRefinement = {
  message: "price_min must be <= price_max",
  path: ["price_min"],
};

export const treatmentCreateSchema = treatmentFields.refine(
  refinePriceRange,
  priceRangeRefinement,
);

export const treatmentUpdateSchema = treatmentFields
  .partial()
  .refine(refinePriceRange, priceRangeRefinement);

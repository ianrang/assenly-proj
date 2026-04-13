import { z } from "zod";

import {
  PRODUCT_CATEGORIES,
  SKIN_TYPES,
  HAIR_TYPES,
  SKIN_CONCERNS,
  PRICE_SOURCES,
  PRICE_CURRENCIES,
} from "@/shared/constants";

import {
  localizedTextRequired,
  localizedTextOptional,
  statusEnum,
  purchaseLinkSchema,
  ratingSchema,
  reviewCountSchema,
} from "./common";

// ============================================================
// Product — create / update schemas
// ============================================================

/** Base fields — refine 전 원본. update에서 .partial() 재사용 */
const productFields = z.object({
  name: localizedTextRequired,
  description: localizedTextOptional,
  brand_id: z.string().uuid().nullable().optional(),
  category: z.enum(PRODUCT_CATEGORIES).nullable().optional(),
  subcategory: z.string().nullable().optional(),
  skin_types: z.array(z.enum(SKIN_TYPES)).default([]),
  hair_types: z.array(z.enum(HAIR_TYPES)).default([]),
  concerns: z.array(z.enum(SKIN_CONCERNS)).default([]),
  key_ingredients: z.array(z.string()).nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  price_min: z.number().int().min(0).nullable().optional(),
  price_max: z.number().int().min(0).nullable().optional(),
  price_currency: z.enum(PRICE_CURRENCIES).default("KRW"),
  price_source: z.enum(PRICE_SOURCES).nullable().optional(),
  range_source: z.enum(PRICE_SOURCES).nullable().optional(),
  price_updated_at: z.string().datetime().nullable().optional(),
  price_source_url: z.string().url().nullable().optional(),
  volume: z.string().nullable().optional(),
  purchase_links: z.array(purchaseLinkSchema).nullable().optional(),
  english_label: z.boolean().default(false),
  tourist_popular: z.boolean().default(false),
  is_highlighted: z.boolean().default(false),
  highlight_badge: localizedTextOptional,
  rating: ratingSchema,
  review_count: reviewCountSchema,
  review_summary: localizedTextOptional,
  images: z.array(z.string().url()).default([]),
  tags: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

/** price_min <= price_max cross-field validation (DB CHECK 대응) */
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

export const productCreateSchema = productFields.refine(
  refinePriceRange,
  priceRangeRefinement,
);

export const productUpdateSchema = productFields
  .partial()
  .refine(refinePriceRange, priceRangeRefinement);

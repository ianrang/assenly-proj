import { z } from "zod";

import {
  PRODUCT_CATEGORIES,
  SKIN_TYPES,
  HAIR_TYPES,
  SKIN_CONCERNS,
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

export const productCreateSchema = z.object({
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

export const productUpdateSchema = productCreateSchema.partial();

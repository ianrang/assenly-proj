import { z } from "zod";

import { STORE_TYPES } from "@/shared/constants";

import {
  localizedTextRequired,
  localizedTextOptional,
  statusEnum,
  englishSupportEnum,
  externalLinkSchema,
  ratingSchema,
  reviewCountSchema,
} from "./common";

// ============================================================
// Store — create / update schemas
// ============================================================

export const storeCreateSchema = z.object({
  name: localizedTextRequired,
  description: localizedTextOptional,
  country: z.string().default("KR"),
  city: z.string().default("seoul"),
  district: z.string().nullable().optional(),
  location: z
    .object({ lat: z.number(), lng: z.number() })
    .nullable()
    .optional(),
  address: localizedTextOptional,
  operating_hours: z.record(z.string(), z.unknown()).nullable().optional(),
  english_support: englishSupportEnum.default("none"),
  store_type: z.enum(STORE_TYPES).nullable().optional(),
  tourist_services: z.array(z.string()).default([]),
  payment_methods: z.array(z.string()).default([]),
  nearby_landmarks: z.array(z.string()).default([]),
  external_links: z.array(externalLinkSchema).nullable().optional(),
  is_highlighted: z.boolean().default(false),
  highlight_badge: localizedTextOptional,
  rating: ratingSchema,
  review_count: reviewCountSchema,
  images: z.array(z.string().url()).default([]),
  tags: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

export const storeUpdateSchema = storeCreateSchema.partial();

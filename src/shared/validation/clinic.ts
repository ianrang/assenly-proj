import { z } from "zod";

import { CLINIC_TYPES } from "@/shared/constants";

import {
  localizedTextRequired,
  localizedTextOptional,
  statusEnum,
  englishSupportEnum,
  externalLinkSchema,
  foreignerSupportSchema,
  ratingSchema,
  reviewCountSchema,
} from "./common";

// ============================================================
// Clinic — create / update schemas
// ============================================================

export const clinicCreateSchema = z.object({
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
  clinic_type: z.enum(CLINIC_TYPES).nullable().optional(),
  license_verified: z.boolean().default(false),
  consultation_type: z.array(z.string()).default([]),
  foreigner_friendly: foreignerSupportSchema.nullable().optional(),
  booking_url: z.string().url().nullable().optional(),
  external_links: z.array(externalLinkSchema).nullable().optional(),
  is_highlighted: z.boolean().default(false),
  highlight_badge: localizedTextOptional,
  rating: ratingSchema,
  review_count: reviewCountSchema,
  images: z.array(z.string().url()).default([]),
  tags: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

export const clinicUpdateSchema = clinicCreateSchema.partial();

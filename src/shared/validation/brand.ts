import { z } from "zod";

import {
  localizedTextRequired,
  statusEnum,
} from "./common";

// ============================================================
// Brand — create / update schemas
// ============================================================

export const brandCreateSchema = z.object({
  name: localizedTextRequired,
  origin: z.string().nullable().optional(),
  tier: z.string().nullable().optional(),
  is_essenly: z.boolean().default(false),
  specialties: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

export const brandUpdateSchema = brandCreateSchema.partial();

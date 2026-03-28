import { z } from "zod";

import { SKIN_TYPES } from "@/shared/constants";

import {
  localizedTextRequired,
  statusEnum,
} from "./common";

// ============================================================
// Ingredient — create / update schemas
// ============================================================

export const ingredientCreateSchema = z.object({
  name: localizedTextRequired,
  inci_name: z.string().nullable().optional(),
  function: z.array(z.string()).default([]),
  caution_skin_types: z.array(z.enum(SKIN_TYPES)).default([]),
  common_in: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

export const ingredientUpdateSchema = ingredientCreateSchema.partial();

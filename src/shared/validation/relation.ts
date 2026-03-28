import { z } from "zod";

import { INGREDIENT_RELATION_TYPES } from "@/shared/constants";

// ============================================================
// Junction table relation schemas
// ============================================================

/** product_stores: (product_id, store_id) */
export const productStoreRelationSchema = z.object({
  product_id: z.string().uuid(),
  store_id: z.string().uuid(),
});

/** product_ingredients: (product_id, ingredient_id, type) */
export const productIngredientRelationSchema = z.object({
  product_id: z.string().uuid(),
  ingredient_id: z.string().uuid(),
  type: z.enum(INGREDIENT_RELATION_TYPES),
});

/** clinic_treatments: (clinic_id, treatment_id) */
export const clinicTreatmentRelationSchema = z.object({
  clinic_id: z.string().uuid(),
  treatment_id: z.string().uuid(),
});

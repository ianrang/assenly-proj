import { z } from "zod";

import {
  localizedTextRequired,
  statusEnum,
} from "./common";

// ============================================================
// Doctor — create / update schemas
// ============================================================

export const doctorCreateSchema = z.object({
  clinic_id: z.string().uuid(),
  name: localizedTextRequired,
  specialties: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  status: statusEnum.default("active"),
});

export const doctorUpdateSchema = doctorCreateSchema.partial();

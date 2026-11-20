import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
export const optionSchema = z.object({ id: slug, name: text });

const licenseAttributionSchema = z.object({
  author: text.optional(),
  licenseName: text,
  licenseUrl: z.url(),
});
export const exerciseImageSchema = licenseAttributionSchema.extend({
  url: z.url(),
  thumbnailUrl: z.url(),
});

const exerciseMetadataSchema = z.object({
  slug,
  name: text,
  category: optionSchema,
  primaryMuscles: z.array(optionSchema),
  secondaryMuscles: z.array(optionSchema),
  equipment: z.array(optionSchema),
});

export const exerciseSummarySchema = exerciseMetadataSchema.extend({
  thumbnail: exerciseImageSchema.optional(),
});

export const exerciseSchema = exerciseMetadataSchema.extend({
  description: z.string(),
  descriptionAttribution: licenseAttributionSchema.optional(),
  images: z.array(exerciseImageSchema),
  sourceUrl: z.url(),
});

export const taxonomySchema = z.object({
  categories: z.array(optionSchema),
  muscles: z.array(optionSchema),
  equipment: z.array(optionSchema),
  exerciseCount: z.int().nonnegative(),
  categoryCounts: z.record(slug, z.int().nonnegative()),
});

export const exerciseListSchema = z.object({
  items: z.array(exerciseSummarySchema),
  page: z.int().positive(),
  limit: z.int().positive(),
  total: z.int().nonnegative(),
});

const positiveInt = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().positive());
export const browseQuerySchema = z.strictObject({
  category: slug.optional(),
  equipment: slug.optional(),
  muscle: slug.optional(),
  q: z.string().trim().max(80).optional(),
  page: positiveInt.optional().transform((value) => value ?? 1),
  limit: positiveInt
    .pipe(z.number().max(50))
    .optional()
    .transform((value) => value ?? 24),
});

export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseImage = z.infer<typeof exerciseImageSchema>;
export type ExerciseList = z.infer<typeof exerciseListSchema>;
export type Taxonomy = z.infer<typeof taxonomySchema>;

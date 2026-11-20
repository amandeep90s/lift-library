import { z } from "zod";
import type { Exercise, Taxonomy } from "@gym/contracts";

const apiRoot = new URL("https://wger.de/api/v2/");
const pageLimit = 250;
const pageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    count: z.int().nonnegative(),
    next: z.url().nullable(),
    results: z.array(itemSchema),
  });
const id = z.int().positive();
const exerciseRowSchema = z.object({
  id,
  category: id,
  muscles: z.array(id),
  muscles_secondary: z.array(id),
  equipment: z.array(id),
});
const translationRowSchema = z.object({
  exercise: id,
  name: z.string().trim().min(1),
});
const exerciseInfoTranslationSchema = z.object({
  language: id,
  description_source: z.string().optional().nullable(),
  license: id.optional(),
  license_author: z.string().optional().nullable(),
});
const exerciseInfoSchema = z.object({ translations: z.array(exerciseInfoTranslationSchema) });
const imageRowSchema = z.object({
  exercise: id,
  image: z.url(),
  thumbnails: z.object({ medium: z.url().optional() }).nullable().optional(),
  is_main: z.boolean(),
  license: id,
  license_author: z.string().optional().nullable(),
});
const categoryRowSchema = z.object({ id, name: z.string().trim().min(1) });
const equipmentRowSchema = z.object({ id, name: z.string().trim().min(1) });
const muscleRowSchema = z.object({
  id,
  name: z.string().trim().min(1),
  name_en: z.string().optional().nullable(),
});
const licenseRowSchema = z.object({
  id,
  full_name: z.string().trim().min(1),
  short_name: z.string().trim().min(1),
  url: z.url(),
});

type WgerImage = z.infer<typeof imageRowSchema>;
type WgerLicense = z.infer<typeof licenseRowSchema>;

type WgerCatalogData = {
  exercises: Exercise[];
  taxonomy: Taxonomy;
  licenses: Map<number, WgerLicense>;
};

export class WgerUpstreamError extends Error {}

function option(prefix: string, value: { id: number; name: string }) {
  return { id: `${prefix}-${value.id}`, name: value.name };
}

function indexById<T extends { id: number }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function isWgerMediaUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "wger.de";
}

export class WgerCatalog {
  private cached: { expiresAt: number; data: WgerCatalogData } | undefined;
  private pending: Promise<WgerCatalogData> | undefined;
  private readonly fetcher: typeof fetch;
  private readonly descriptions = new Map<
    number,
    Promise<{
      description: string;
      descriptionAttribution?: Exercise["descriptionAttribution"];
    }>
  >();

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  async get(): Promise<WgerCatalogData> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.data;
    if (!this.pending) {
      this.pending = this.load()
        .then((data) => {
          this.descriptions.clear();
          this.cached = { data, expiresAt: Date.now() + 60 * 60 * 1000 };
          return data;
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    return this.pending;
  }

  async getExercise(slug: string): Promise<Exercise | undefined> {
    const data = await this.get();
    const exercise = data.exercises.find((item) => item.slug === slug);
    if (!exercise) return undefined;
    const exerciseId = Number(slug.slice("wger-".length));
    let details = this.descriptions.get(exerciseId);
    if (!details) {
      details = this.loadDescription(exerciseId, data.licenses).catch((error: unknown) => {
        this.descriptions.delete(exerciseId);
        throw error;
      });
      this.descriptions.set(exerciseId, details);
    }
    return { ...exercise, ...(await details) };
  }

  private async getAll<T extends z.ZodType>(
    endpoint: string,
    itemSchema: T,
    query: Record<string, string> = {},
  ): Promise<z.infer<T>[]> {
    const items: z.infer<T>[] = [];
    const first = new URL(`${endpoint}/`, apiRoot);
    first.searchParams.set("limit", String(pageLimit));
    for (const [key, value] of Object.entries(query)) first.searchParams.set(key, value);

    let url: URL | undefined = first;
    const visited = new Set<string>();
    while (url) {
      if (visited.has(url.href))
        throw new WgerUpstreamError(`wger repeated a pagination URL for ${endpoint}.`);
      visited.add(url.href);
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        if (error instanceof Error)
          throw new WgerUpstreamError(`wger ${endpoint} request failed: ${error.message}`);
        throw error;
      }
      if (!response.ok)
        throw new WgerUpstreamError(
          `wger ${endpoint} request failed with status ${response.status}.`,
        );
      const page = pageSchema(itemSchema).parse(await response.json());
      items.push(...page.results);
      if (!page.next) {
        url = undefined;
        continue;
      }
      const next = new URL(page.next);
      if (next.origin !== apiRoot.origin || next.pathname !== `${apiRoot.pathname}${endpoint}/`) {
        throw new WgerUpstreamError(`wger returned an unexpected pagination URL for ${endpoint}.`);
      }
      url = next;
    }
    return items;
  }

  private async loadDescription(
    exerciseId: number,
    licenses: Map<number, WgerLicense>,
  ): Promise<{ description: string; descriptionAttribution?: Exercise["descriptionAttribution"] }> {
    const url = new URL(`exerciseinfo/${exerciseId}/?language=2`, apiRoot);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof Error)
        throw new WgerUpstreamError(`wger exercise info request failed: ${error.message}`);
      throw error;
    }
    if (!response.ok)
      throw new WgerUpstreamError(
        `wger exercise info request failed with status ${response.status}.`,
      );
    const info = exerciseInfoSchema.parse(await response.json());
    const translation = info.translations.find(({ language }) => language === 2);
    const license =
      translation?.license === undefined ? undefined : licenses.get(translation.license);
    const author = translation?.license_author?.trim() || undefined;
    const descriptionAttribution =
      license && (author || license.short_name.toLowerCase() === "cc0")
        ? {
            ...(author ? { author } : {}),
            licenseName: license.short_name,
            licenseUrl: license.url,
          }
        : undefined;
    return {
      description: descriptionAttribution ? (translation?.description_source ?? "") : "",
      ...(descriptionAttribution ? { descriptionAttribution } : {}),
    };
  }

  private async load(): Promise<WgerCatalogData> {
    const [exercises, translations, images, categories, equipment, muscles, licenses] =
      await Promise.all([
        this.getAll("exercise", exerciseRowSchema, { language: "2" }),
        this.getAll("exercise-translation", translationRowSchema, { language: "2" }),
        this.getAll("exerciseimage", imageRowSchema),
        this.getAll("exercisecategory", categoryRowSchema),
        this.getAll("equipment", equipmentRowSchema),
        this.getAll("muscle", muscleRowSchema),
        this.getAll("license", licenseRowSchema),
      ]);

    const translationsByExercise = indexById(
      translations.map((translation) => ({
        id: translation.exercise,
        ...translation,
      })),
    );
    const imagesByExercise = new Map<number, WgerImage[]>();
    for (const image of images) {
      const list = imagesByExercise.get(image.exercise) ?? [];
      list.push(image);
      imagesByExercise.set(image.exercise, list);
    }
    const categoryById = indexById(categories);
    const equipmentById = indexById(equipment);
    const muscleById = indexById(
      muscles.map((item) => ({
        ...item,
        name: item.name_en?.trim() || item.name,
      })),
    );
    const licenseById = indexById(licenses);

    const mapOptions = <T extends { id: number; name: string }>(
      ids: number[],
      prefix: string,
      source: Map<number, T>,
    ) =>
      ids.map((itemId) => {
        const value = source.get(itemId);
        if (!value)
          throw new WgerUpstreamError(`wger returned an unknown ${prefix} ID: ${itemId}.`);
        return option(prefix, value);
      });

    const mapImages = (exerciseId: number) =>
      (imagesByExercise.get(exerciseId) ?? [])
        .sort((a, b) => Number(b.is_main) - Number(a.is_main))
        .flatMap((image) => {
          const license = licenseById.get(image.license);
          const author = image.license_author?.trim() || undefined;
          if (!license || (!author && license.short_name.toLowerCase() !== "cc0")) return [];
          const thumbnailUrl = image.thumbnails?.medium ?? image.image;
          if (!isWgerMediaUrl(image.image) || !isWgerMediaUrl(thumbnailUrl)) return [];
          return [
            {
              url: image.image,
              thumbnailUrl,
              ...(author ? { author } : {}),
              licenseName: license.short_name,
              licenseUrl: license.url,
            },
          ];
        });

    const normalized: Exercise[] = [];
    for (const exercise of exercises) {
      const translation = translationsByExercise.get(exercise.id);
      if (!translation) continue;
      const category = categoryById.get(exercise.category);
      if (!category)
        throw new WgerUpstreamError(`wger returned an unknown category ID: ${exercise.category}.`);
      const exerciseImages = mapImages(exercise.id);
      normalized.push({
        slug: `wger-${exercise.id}`,
        name: translation.name,
        category: option("category", category),
        primaryMuscles: mapOptions(exercise.muscles, "muscle", muscleById),
        secondaryMuscles: mapOptions(exercise.muscles_secondary, "muscle", muscleById),
        equipment: mapOptions(exercise.equipment, "equipment", equipmentById),
        description: "",
        images: exerciseImages,
        sourceUrl: new URL(`exerciseinfo/${exercise.id}/`, apiRoot).href,
      });
    }

    normalized.sort(
      (a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug, "en"),
    );
    const categoryCounts = Object.fromEntries(
      categories.map(({ id: categoryId }) => [
        `category-${categoryId}`,
        normalized.filter(({ category }) => category.id === `category-${categoryId}`).length,
      ]),
    );
    return {
      exercises: normalized,
      licenses: licenseById,
      taxonomy: {
        categories: categories
          .map((item) => option("category", item))
          .sort((a, b) => a.name.localeCompare(b.name, "en")),
        muscles: muscles
          .map((item) =>
            option("muscle", {
              id: item.id,
              name: item.name_en?.trim() || item.name,
            }),
          )
          .sort((a, b) => a.name.localeCompare(b.name, "en")),
        equipment: equipment
          .map((item) => option("equipment", item))
          .sort((a, b) => a.name.localeCompare(b.name, "en")),
        exerciseCount: normalized.length,
        categoryCounts,
      },
    };
  }
}

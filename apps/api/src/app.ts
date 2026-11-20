import express from "express";
import type { ErrorRequestHandler } from "express";
import {
  browseQuerySchema,
  exerciseListSchema,
  exerciseSchema,
  exerciseSummarySchema,
  taxonomySchema,
} from "@gym/contracts";
import { WgerCatalog, WgerUpstreamError } from "./wger.ts";

export function createApp(webDirectory?: string, catalog = new WgerCatalog()) {
  const app = express();
  app.disable("x-powered-by");
  const api = express.Router();

  api.use((_req, res, next) => {
    res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    next();
  });
  api.get("/taxonomy", async (_req, res) => {
    const { taxonomy } = await catalog.get();
    res.json(taxonomySchema.parse(taxonomy));
  });
  api.get("/equipment", async (_req, res) => {
    const { taxonomy } = await catalog.get();
    res.json(taxonomy.equipment);
  });
  api.get("/exercises", async (req, res) => {
    const query = browseQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid exercise filters." });
      return;
    }
    const { category, equipment, muscle, q, page, limit } = query.data;
    const { exercises, taxonomy } = await catalog.get();
    const categoryIds = new Set(taxonomy.categories.map(({ id }) => id));
    const equipmentIds = new Set(taxonomy.equipment.map(({ id }) => id));
    const muscleIds = new Set(taxonomy.muscles.map(({ id }) => id));
    if (
      (category && !categoryIds.has(category)) ||
      (equipment && !equipmentIds.has(equipment)) ||
      (muscle && !muscleIds.has(muscle))
    ) {
      res.status(400).json({ error: "Unknown category, muscle, or equipment." });
      return;
    }

    const search = q?.toLocaleLowerCase("en");
    const matches = exercises.filter(
      (exercise) =>
        (!category || exercise.category.id === category) &&
        (!equipment || exercise.equipment.some(({ id }) => id === equipment)) &&
        (!muscle ||
          [...exercise.primaryMuscles, ...exercise.secondaryMuscles].some(
            ({ id }) => id === muscle,
          )) &&
        (!search || exercise.name.toLocaleLowerCase("en").includes(search)),
    );
    const offset = (page - 1) * limit;
    const items = matches
      .slice(offset, offset + limit)
      .map((exercise) =>
        exerciseSummarySchema.parse({ ...exercise, thumbnail: exercise.images[0] }),
      );
    res.json(exerciseListSchema.parse({ items, page, limit, total: matches.length }));
  });
  api.get("/exercises/:slug", async (req, res) => {
    const exercise = await catalog.getExercise(req.params.slug);
    if (!exercise) {
      res.status(404).json({ error: "Exercise not found." });
      return;
    }
    res.json(exerciseSchema.parse(exercise));
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", source: "wger" });
  });
  app.use("/api/v1", api);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found." });
  });
  if (webDirectory) {
    app.use(express.static(webDirectory));
    app.get(["/exercises", "/exercises/:slug"], (_req, res) => {
      res.sendFile("index.html", { root: webDirectory });
    });
  }

  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error instanceof URIError) {
      res.status(400).json({ error: "Invalid URL." });
      return;
    }
    console.error(error);
    if (error instanceof WgerUpstreamError) {
      res.status(502).json({ error: "Could not load the wger exercise catalog." });
      return;
    }
    res.status(500).json({ error: "Internal server error." });
  };
  app.use(handleError);
  return app;
}

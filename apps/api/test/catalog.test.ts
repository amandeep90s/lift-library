import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { exerciseListSchema, exerciseSchema, taxonomySchema } from "@gym/contracts";
import { createApp } from "../src/app.ts";
import { WgerCatalog } from "../src/wger.ts";

const datasets: Record<string, unknown[]> = {
  exercise: [
    { id: 42, category: 10, muscles: [6], muscles_secondary: [2], equipment: [3] },
    { id: 43, category: 8, muscles: [1], muscles_secondary: [], equipment: [] },
  ],
  "exercise-translation": [
    { exercise: 42, name: "Dumbbell Bench Press" },
    { exercise: 43, name: "Push Up" },
  ],
  exerciseimage: [
    {
      exercise: 42,
      image: "https://wger.de/media/exercise-images/press.png",
      thumbnails: { medium: "https://wger.de/media/exercise-images/press-small.png" },
      is_main: true,
      license: 1,
      license_author: "Example author",
    },
    {
      exercise: 42,
      image: "https://wger.de/media/exercise-images/press-side.png",
      thumbnails: null,
      is_main: false,
      license: 1,
      license_author: "Example author",
    },
    {
      exercise: 43,
      image: "https://wger.de/media/exercise-images/push-up.png",
      is_main: true,
      license: 999,
      license_author: "",
    },
  ],
  exercisecategory: [
    { id: 10, name: "Chest" },
    { id: 8, name: "Arms" },
  ],
  equipment: [{ id: 3, name: "Dumbbell" }],
  muscle: [
    { id: 6, name: "Pectoralis major", name_en: "Chest" },
    { id: 2, name: "Triceps brachii", name_en: "Triceps" },
    { id: 1, name: "Biceps brachii", name_en: "Biceps" },
  ],
  license: [
    {
      id: 1,
      full_name: "Creative Commons Attribution 4.0",
      short_name: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
    },
  ],
};
const exerciseDetails: Record<number, unknown> = {
  42: {
    translations: [
      {
        language: 2,
        description_source: "1. Lie back on the bench.\n2. Press the weights upward.",
        license: 1,
        license_author: "Example author",
      },
    ],
  },
  43: {
    translations: [{ language: 2, description_source: "Start in a high plank." }],
  },
};

let exercisePageCalls = 0;
const fakeFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (pathParts.at(-2) === "exerciseinfo") {
    const details = exerciseDetails[Number(pathParts.at(-1))];
    return details
      ? new Response(JSON.stringify(details), { headers: { "Content-Type": "application/json" } })
      : new Response(null, { status: 404 });
  }
  const endpoint = pathParts.at(-1) ?? "";
  const results = datasets[endpoint];
  if (!results) return new Response(null, { status: 404 });
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const pageResults = endpoint === "exercise" ? results.slice(offset, offset + 1) : results;
  const next =
    endpoint === "exercise" && offset === 0
      ? "https://wger.de/api/v2/exercise/?language=2&limit=250&offset=1"
      : null;
  if (endpoint === "exercise") exercisePageCalls += 1;
  return new Response(
    JSON.stringify({ count: results.length, next, previous: null, results: pageResults }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
};

const webDirectory = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const server = createApp(webDirectory, new WgerCatalog(fakeFetch)).listen(0, "127.0.0.1");
let origin: string;

before(async () => {
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

async function list(query: string) {
  const response = await fetch(`${origin}/api/v1/exercises?${query}`);
  assert.equal(response.status, 200);
  return exerciseListSchema.parse(await response.json());
}

test("uses wger taxonomy and preserves image licensing and attribution", async () => {
  const response = await fetch(`${origin}/api/v1/taxonomy`);
  assert.equal(response.status, 200);
  const taxonomy = taxonomySchema.parse(await response.json());
  assert.equal(taxonomy.exerciseCount, 2);
  assert.equal(exercisePageCalls, 2);
  assert.equal(taxonomy.categoryCounts["category-10"], 1);
  assert(taxonomy.muscles.some(({ id, name }) => id === "muscle-6" && name === "Chest"));

  const results = await list("category=category-10&muscle=muscle-6&equipment=equipment-3&q=press");
  assert.deepEqual(
    results.items.map(({ slug }) => slug),
    ["wger-42"],
  );
  assert.equal(results.items[0].thumbnail?.author, "Example author");
  assert.equal(results.items[0].thumbnail?.licenseName, "CC BY 4.0");
});

test("paginates filtered results and returns wger exercise details", async () => {
  const first = await list("limit=1&page=1");
  const second = await list("limit=1&page=2");
  assert.deepEqual(
    [...first.items, ...second.items].map(({ slug }) => slug),
    ["wger-42", "wger-43"],
  );

  const response = await fetch(`${origin}/api/v1/exercises/wger-42`);
  assert.equal(response.status, 200);
  const detail = exerciseSchema.parse(await response.json());
  assert.equal(detail.description, "1. Lie back on the bench.\n2. Press the weights upward.");
  assert.equal(detail.descriptionAttribution?.author, "Example author");
  assert.equal(detail.images[0].licenseName, "CC BY 4.0");
  assert.match(detail.sourceUrl, /wger\.de\/api\/v2\/exerciseinfo\/42/);
  assert.equal(
    detail.images[1].thumbnailUrl,
    "https://wger.de/media/exercise-images/press-side.png",
  );
  assert.deepEqual(
    (await fetch(`${origin}/api/v1/exercises/wger-43`).then((result) => result.json())).images,
    [],
  );
});

test("rejects malformed or unknown filters and serves direct exercise routes", async () => {
  for (const query of [
    "limit=51",
    "category=unlisted",
    "page=0",
    "category=category-10&category=category-8",
  ]) {
    const response = await fetch(`${origin}/api/v1/exercises?${query}`);
    assert.equal(response.status, 400, query);
    assert.match((await response.json()).error, /filters|unknown/i);
  }
  const missing = await fetch(`${origin}/api/v1/exercises/wger-999`);
  assert.equal(missing.status, 404);
  const page = await fetch(`${origin}/exercises/wger-42`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="root">/);
});

test("reports an unavailable upstream instead of silently serving a fallback catalog", async () => {
  const unavailableServer = createApp(
    undefined,
    new WgerCatalog(async () => new Response(null, { status: 503 })),
  ).listen(0, "127.0.0.1");
  await once(unavailableServer, "listening");
  const address = unavailableServer.address();
  assert(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/taxonomy`);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /wger exercise catalog/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      unavailableServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

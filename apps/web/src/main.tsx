import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowLeft, ArrowRight, Dumbbell, Moon, Search, Sun } from "lucide-react";
import {
  createBrowserRouter,
  Form,
  isRouteErrorResponse,
  Link,
  Outlet,
  RouterProvider,
  useLoaderData,
  useLocation,
  useNavigation,
  useRouteError,
} from "react-router-dom";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  exerciseListSchema,
  exerciseSchema,
  exerciseImageSchema,
  optionSchema,
  taxonomySchema,
} from "@gym/contracts";
import type { ExerciseImage } from "@gym/contracts";
import "./styles.css";

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, { signal });
  if (!response.ok) throw new Response(null, { status: response.status });
  return response.json();
}

async function loadTaxonomy(signal: AbortSignal) {
  return taxonomySchema.parse(await getJson("/taxonomy", signal));
}

function optionNames(options: { id: string; name: string }[]) {
  return options.map(({ name }) => name).join(", ");
}

function MediaImage({ image, alt }: { image: ExerciseImage; alt: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="media-fallback" role="img" aria-label="Exercise image unavailable">
      <Dumbbell size={28} aria-hidden="true" />
    </div>
  ) : (
    <img
      className="exercise-image"
      src={image.thumbnailUrl}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function ImageCredit({ image }: { image: ExerciseImage }) {
  return (
    <span className="image-credit">
      {image.author ? `${image.author} · ` : ""}
      <a href={image.licenseUrl} target="_blank" rel="noreferrer">
        {image.licenseName}
      </a>
    </span>
  );
}

function ExerciseCard({
  exercise,
  from,
}: {
  exercise: {
    slug: string;
    name: string;
    category: { name: string };
    primaryMuscles: { id: string; name: string }[];
    thumbnail?: ExerciseImage;
  };
  from: string;
}) {
  return (
    <div className="exercise-card">
      <Link
        className="exercise-card-link group"
        to={`/exercises/${exercise.slug}`}
        state={{ from }}
      >
        <div className="exercise-card-media">
          {exercise.thumbnail ? (
            <MediaImage image={exercise.thumbnail} alt={`${exercise.name} exercise`} />
          ) : (
            <div className="media-fallback" aria-hidden="true">
              <Dumbbell size={28} />
            </div>
          )}
          <span className="media-tag">{exercise.category.name}</span>
        </div>
        <div className="exercise-card-copy">
          <strong className="capitalize">{exercise.name}</strong>
          <span>{optionNames(exercise.primaryMuscles) || "Muscles not listed"}</span>
        </div>
      </Link>
      <div className="exercise-card-meta">
        {exercise.thumbnail && <ImageCredit image={exercise.thumbnail} />}
        <ArrowRight className="exercise-card-arrow" size={18} aria-hidden="true" />
      </div>
    </div>
  );
}

function Layout() {
  const navigation = useNavigation();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      window.localStorage.setItem("lift-library-theme", next);
    } catch (error) {
      console.warn("Could not save the theme preference.", error);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <nav className="container p-4" aria-label="Main navigation">
          <Link className="brand" to="/">
            <span className="brand-icon">
              <Dumbbell size={18} aria-hidden="true" />
            </span>
            Lift Library
          </Link>
          <Link className="nav-link" to="/exercises">
            Exercises <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? (
              <Sun size={17} aria-hidden="true" />
            ) : (
              <Moon size={17} aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </nav>
      </header>
      <main
        className="container main p-4"
        id="main-content"
        tabIndex={-1}
        aria-busy={navigation.state !== "idle"}
      >
        <Outlet />
      </main>
      <footer className="container footer p-4">
        <div className="w-full text-center">
          <strong>Lift Library</strong>
          <span>Exercise data and images via </span>
          <a href="https://wger.de/" target="_blank" rel="noreferrer">
            wger
          </a>
        </div>
      </footer>
    </div>
  );
}

async function loadHome({ request }: LoaderFunctionArgs) {
  const [taxonomy, results] = await Promise.all([
    loadTaxonomy(request.signal),
    getJson("/exercises?limit=6", request.signal).then((value) => exerciseListSchema.parse(value)),
  ]);
  return { taxonomy, featured: results.items };
}

function Home() {
  const { taxonomy, featured } = useLoaderData<typeof loadHome>();
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow eyebrow-dark">
            <Activity size={15} aria-hidden="true" /> Wger exercise library
          </p>
          <h1>
            Make every rep <span>count.</span>
          </h1>
          <p>
            Find your next movement with exercise images, clear instructions, and filters for the
            muscles and equipment you have.
          </p>
          <Link className="button button-gold" to="/exercises">
            Explore exercises <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-ring hero-ring-one" />
          <div className="hero-ring hero-ring-two" />
          <Dumbbell size={112} strokeWidth={1.3} />
        </div>
        <div className="hero-stats">
          <strong>
            {taxonomy.exerciseCount.toLocaleString("en")}
            <small> exercises</small>
          </strong>
          <strong>
            {taxonomy.categories.length}
            <small> categories</small>
          </strong>
          <strong>
            {taxonomy.muscles.length}
            <small> target muscles</small>
          </strong>
        </div>
      </section>

      <section className="section-block" aria-labelledby="category-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Browse by focus</p>
            <h2 id="category-title">Choose a category</h2>
          </div>
          <Link className="text-link" to="/exercises">
            View all <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <ul className="category-grid">
          {taxonomy.categories.map((category, index) => (
            <li key={category.id}>
              <Link className="category-card" to={`/exercises?category=${category.id}`}>
                <span className="category-number">{String(index + 1).padStart(2, "0")}</span>
                <strong>{category.name}</strong>
                <span>{taxonomy.categoryCounts[category.id] ?? 0} movements</span>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-block" aria-labelledby="featured-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Start here</p>
            <h2 id="featured-title">Explore the library</h2>
          </div>
          <span className="section-note">A few movements from the library</span>
        </div>
        <ul className="exercise-grid">
          {featured.map((exercise) => (
            <li key={exercise.slug}>
              <ExerciseCard exercise={exercise} from="/" />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

async function loadCatalog({ request }: LoaderFunctionArgs) {
  const { signal } = request;
  const { search } = new URL(request.url);
  const filters = new URLSearchParams(
    [...new URLSearchParams(search)].filter(([, value]) => value !== ""),
  );
  const [taxonomy, results] = await Promise.all([
    loadTaxonomy(signal),
    getJson(`/exercises?${filters}`, signal).then((value) => exerciseListSchema.parse(value)),
  ]);
  return { taxonomy, results, search };
}

function CatalogPage() {
  const { taxonomy, results, search } = useLoaderData<typeof loadCatalog>();
  const filters = new URLSearchParams(search);
  const category = taxonomy.categories.find(({ id }) => id === filters.get("category"));
  const pageCount = Math.max(1, Math.ceil(results.total / results.limit));
  function pageLink(page: number) {
    const next = new URLSearchParams(filters);
    next.set("page", String(page));
    return `/exercises?${next}`;
  }

  return (
    <>
      <section className="catalog-intro">
        <p className="eyebrow">Find your movement</p>
        <h1>{category ? `${category.name} exercises` : "Exercise library"}</h1>
        <p>Search by name, muscle group, or the equipment you have available.</p>
      </section>
      <Form
        className="filters"
        method="get"
        action="/exercises"
        key={search}
        aria-label="Exercise filters"
      >
        <label className="search-field">
          Search exercises
          <span>
            <Search size={17} aria-hidden="true" />
            <input
              name="q"
              type="search"
              defaultValue={filters.get("q") ?? ""}
              maxLength={80}
              placeholder="e.g. squat or press"
            />
          </span>
        </label>
        <label>
          Category
          <select name="category" defaultValue={category?.id ?? ""}>
            <option value="">All categories</option>
            {taxonomy.categories.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target muscle
          <select name="muscle" defaultValue={filters.get("muscle") ?? ""}>
            <option value="">Any muscle</option>
            {taxonomy.muscles.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Equipment
          <select name="equipment" defaultValue={filters.get("equipment") ?? ""}>
            <option value="">Any equipment</option>
            {taxonomy.equipment.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-actions">
          <button className="button" type="submit">
            Apply filters <ArrowRight size={16} aria-hidden="true" />
          </button>
          <Link className="text-link" to="/exercises">
            Clear all
          </Link>
        </div>
      </Form>
      <div className="result-heading">
        <h2 aria-live="polite">
          {results.total.toLocaleString("en")} {results.total === 1 ? "movement" : "movements"}
        </h2>
        <span>Images include their source license and attribution.</span>
      </div>
      {results.items.length ? (
        <ul className="exercise-grid">
          {results.items.map((exercise) => (
            <li key={exercise.slug}>
              <ExerciseCard exercise={exercise} from={`/exercises${search}`} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">
          No exercises match these filters. Try another search or clear the filters.
        </p>
      )}
      {pageCount > 1 || results.page > 1 ? (
        <nav className="pagination" aria-label="Exercise pages">
          {results.page > pageCount ? (
            <Link to={pageLink(pageCount)}>Go to page {pageCount}</Link>
          ) : (
            <>
              {results.page > 1 && <Link to={pageLink(results.page - 1)}>Previous</Link>}
              <span>
                Page {results.page} of {pageCount}
              </span>
              {results.page < pageCount && <Link to={pageLink(results.page + 1)}>Next</Link>}
            </>
          )}
        </nav>
      ) : null}
    </>
  );
}

async function loadExercise({ request, params }: LoaderFunctionArgs) {
  const exercise = exerciseSchema.parse(
    await getJson(`/exercises/${encodeURIComponent(params.slug ?? "")}`, request.signal),
  );
  return { exercise };
}

function ExercisePage() {
  const { exercise } = useLoaderData<typeof loadExercise>();
  const { state } = useLocation();
  const back =
    typeof state?.from === "string" && state.from.startsWith("/") ? state.from : "/exercises";
  const steps = exercise.description
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean);
  return (
    <article className="exercise-detail">
      <Link className="back" to={back}>
        <ArrowLeft size={17} aria-hidden="true" /> Back to library
      </Link>
      <header className="detail-heading">
        <div>
          <p className="eyebrow">{exercise.category.name} · Exercise guide</p>
          <h1>{exercise.name}</h1>
          <p className="detail-muscles">
            Targets {optionNames(exercise.primaryMuscles) || "muscles not listed"}
            {exercise.secondaryMuscles.length > 0 &&
              ` · Also works ${optionNames(exercise.secondaryMuscles)}`}
          </p>
        </div>
        <div className="detail-equipment">
          <span>Equipment</span>
          <strong>{optionNames(exercise.equipment) || "Not specified"}</strong>
        </div>
      </header>
      {exercise.images.length > 0 ? (
        <section className="detail-media" aria-labelledby="media-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Movement reference</p>
              <h2 id="media-title">Exercise images</h2>
            </div>
          </div>
          <div className="image-grid">
            {exercise.images.map((image, index) => (
              <figure className="image-panel" key={`${image.url}-${index}`}>
                <a
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${exercise.name} image ${index + 1}`}
                >
                  <MediaImage image={image} alt={`${exercise.name}, example ${index + 1}`} />
                </a>
                <figcaption>
                  <ImageCredit image={image} />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : (
        <div className="no-image">
          <Dumbbell size={20} aria-hidden="true" /> No licensed images are available for this
          exercise yet.
        </div>
      )}
      <section className="instructions">
        <p className="eyebrow">How it works</p>
        <h2>Movement notes</h2>
        {steps.length > 1 ? (
          <ol>
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
        ) : steps.length === 1 ? (
          <p>{steps[0]}</p>
        ) : (
          <p>No instructions are available for this movement.</p>
        )}
      </section>
      <p className="source-note">
        Exercise data:{" "}
        <a href={exercise.sourceUrl} target="_blank" rel="noreferrer">
          wger API
        </a>
        .
        {exercise.descriptionAttribution && (
          <>
            {" "}
            Instructions by {exercise.descriptionAttribution.author ??
              "wger contributors"} under{" "}
            <a href={exercise.descriptionAttribution.licenseUrl} target="_blank" rel="noreferrer">
              {exercise.descriptionAttribution.licenseName}
            </a>
            .
          </>
        )}{" "}
        Image licenses and contributors are listed with each image.
      </p>
    </article>
  );
}

function ErrorPage() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message =
    status === 404
      ? "Exercise not found"
      : status === 400
        ? "Invalid exercise filters"
        : "The exercise library is unavailable";
  return (
    <section className="error-state">
      <p className="eyebrow">A little pause</p>
      <h1>{message}</h1>
      <p>
        {status === 404
          ? "This exercise may have been removed from the wger catalog."
          : "We couldn’t load the wger exercise catalog. Please try again in a moment."}
      </p>
      <Link className="button" to="/exercises">
        Browse library <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </section>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    hydrateFallbackElement: (
      <main className="container main" role="status">
        Loading Lift Library...
      </main>
    ),
    children: [
      {
        errorElement: <ErrorPage />,
        children: [
          { index: true, loader: loadHome, element: <Home /> },
          { path: "exercises", loader: loadCatalog, element: <CatalogPage /> },
          { path: "exercises/:slug", loader: loadExercise, element: <ExercisePage /> },
        ],
      },
    ],
  },
]);

const root = document.getElementById("root");
if (!root) throw new Error("Missing React root.");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

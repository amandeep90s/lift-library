# Lift Library

A responsive exercise reference built with React, Tailwind CSS, Express, and TypeScript. Browse the wger exercise catalog by category, target muscle, or equipment, and view available exercise images with their license and attribution details.

The interface uses a premium black-and-gold palette with light and dark themes, rounded Nunito typography from Google Fonts, and gradient accents. It follows the system theme on first visit, and the header toggle saves the preference in the browser. The page layout keeps the footer at the viewport bottom when content is short.

## Run locally

Use Node.js 22.18+ or 24 LTS and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` to Express on port 3000.

For production, `npm run build` compiles the shared contracts, web app, and API. `npm start` serves both the web app and API on port 3000 (or `PORT` if set). Run `npm test` to build and verify wger catalog filtering, image attribution, and direct exercise links.

## Data source and licensing

The app loads its exercise catalog from the public [wger REST API](https://wger.de/api/v2/). Public read endpoints do not require an API key. The server caches the normalized English catalog in memory for one hour and requires network access to wger when the cache is empty or expires.

Exercise images are displayed only when the image record includes a recognized license and the required attribution details. Each image links to its license, and exercise instructions are shown only when their translation includes usable license and author metadata. The detail page links back to the wger API record. wger and its contributors retain their respective rights; review the individual records' terms before redistributing any content.

If wger is unavailable, the API reports a catalog error rather than serving an outdated local snapshot.

## Code formatting

Run `npm run format` to format application, package, and script source files with Prettier. Use `npm run format:check` to verify formatting without changing files. Formatting options are defined in `.prettierrc.json`; generated output, dependency files, and dataset snapshots are excluded.

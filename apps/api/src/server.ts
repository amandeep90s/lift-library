import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

const webDirectory = new URL("../../web/dist/", import.meta.url);
const serveWeb = existsSync(new URL("index.html", webDirectory));
const port = Number(process.env.PORT ?? 3000);
const app = createApp(serveWeb ? fileURLToPath(webDirectory) : undefined);
const server = app.listen(port, () => {
  console.log(`Lift Library API listening on port ${port} (wger catalog)`);
});
server.on("error", (error) => {
  throw error;
});

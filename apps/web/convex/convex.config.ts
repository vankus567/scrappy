import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// The app's own router owns the root: the console's proxies live at /api/*, and clean page URLs
// are mapped to their exported index.html before the static catch-all.
const app = defineApp();
app.use(staticHosting);

export default app;

import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { MARKETING_PAGES } from "../client/src/content/marketing";
import { SPA_ROUTES } from "../shared/spa-routes";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true as const,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const sendHtml = (res: express.Response, file: string, status = 200) =>
    res.status(status).sendFile(path.resolve(distPath, file));

  // Canonical URLs are slashless: redirect /about/ → /about rather than the
  // other way round (express.static's `redirect` does the opposite).
  app.get(/^\/(.+)\/$/, (req, res, next) => {
    const target = req.originalUrl.replace(/\/+(\?|$)/, "$1");
    if (!target || target === req.originalUrl) return next();
    res.redirect(301, target);
  });

  // Static assets. `index: false` and `redirect: false` keep express.static
  // from serving or redirecting to directory indexes — the prerendered
  // marketing pages are mapped explicitly below, at their canonical paths.
  app.use(express.static(distPath, { index: false, redirect: false }));

  // Prerendered marketing pages (dist/public/<page>/index.html).
  for (const page of MARKETING_PAGES) {
    const file =
      page.path === "/" ? "index.html" : `${page.path.replace(/^\//, "")}/index.html`;
    app.get(page.path, (_req, res) => sendHtml(res, file));
  }

  // App routes get the plain SPA shell. Serving index.html here would hand
  // /profile, /admin and article pages the prerendered homepage — including
  // its canonical — to any crawler that does not run JavaScript.
  app.get(SPA_ROUTES, (_req, res) => sendHtml(res, "app.html"));

  // Everything else is a genuine 404 rather than a soft one. HTML requests
  // still get the app shell, so the client router renders its NotFound page.
  app.use((req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type("txt").send("Not found");
      return;
    }
    sendHtml(res, "app.html", 404);
  });
}

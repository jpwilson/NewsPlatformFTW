/**
 * Loads the production Express API (api/index.ts) for offline tests.
 *
 * The file is bundled with esbuild exactly as `npm run vercel-build` does
 * (npm packages external) into node_modules/.cache, then imported with
 * SUPABASE_URL pointing at a stub server. dotenv is pointed at an empty file
 * and the working directory is a fresh temp folder, so no real key from any
 * .env file can ever be loaded by a test.
 *
 *   const api = await loadApi({ supabaseUrl: stub.url });
 *   const r = await api.request("PATCH", "/api/v1/content/articles/1", { headers, body });
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function loadApi({ supabaseUrl, env = {} } = {}) {
  const { build } = await import("esbuild");
  const outDir = path.join(ROOT, "node_modules", ".cache", "np-api-test");
  const outfile = path.join(outDir, `index-${process.pid}-${Date.now()}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, "api", "index.ts")],
    platform: "node",
    packages: "external",
    bundle: true,
    format: "esm",
    outfile,
    logLevel: "error",
  });

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "np-api-test-"));
  const emptyEnv = path.join(sandbox, "empty.env");
  fs.writeFileSync(emptyEnv, "");
  process.env.DOTENV_CONFIG_PATH = emptyEnv;
  process.chdir(sandbox);

  for (const k of Object.keys(process.env)) {
    if (/^(VITE_)?SUPABASE_/.test(k)) delete process.env[k];
  }
  Object.assign(process.env, {
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_KEY: "test-service-key",
    SUPABASE_ANON_KEY: "test-anon-key",
    NODE_ENV: "test",
    ...env,
  });
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;

  // Quiet the API's verbose logging unless asked for.
  const quiet = !process.env.NP_TEST_VERBOSE;
  const saved = { log: console.log, error: console.error, warn: console.warn };
  const logs = [];
  if (quiet) {
    console.log = (...a) => logs.push(a.map(String).join(" "));
    console.error = (...a) => logs.push(a.map(String).join(" "));
    console.warn = (...a) => logs.push(a.map(String).join(" "));
  }

  const mod = await import(pathToFileURL(outfile).href);
  fs.rmSync(outfile, { force: true });
  const handler = mod.default;

  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      res.statusCode = 599;
      res.end(String(err));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, url, { headers = {}, body } = {}) {
    const init = { method, headers: { ...headers }, redirect: "manual" };
    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      init.headers["content-type"] ||= "application/json";
    }
    const r = await fetch(base + url, init);
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}
    return { status: r.status, headers: r.headers, text, json };
  }

  return {
    base,
    request,
    logs,
    restoreConsole: () => Object.assign(console, saved),
    close: () => new Promise((r) => server.close(r)),
  };
}

#!/usr/bin/env node
/**
 * Ping IndexNow (Bing, Yandex, Seznam, Naver — and Bing feeds Copilot and
 * DuckDuckGo) with NewsPlatform's public URLs.
 *
 *   node scripts/indexnow.mjs --dry-run     # print the payload, send nothing
 *   node scripts/indexnow.mjs               # actually submit
 *   node scripts/indexnow.mjs --sitemap     # include every URL from the live
 *                                           # /sitemap.xml (articles + channels)
 *
 * The key file must be reachable at https://www.newsplatform.org/<key>.txt —
 * it lives in client/public/ and is copied into dist/public by `vite build`.
 * Override with INDEXNOW_KEY if the key is ever rotated.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const HOST = "www.newsplatform.org";
const SITE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Read the key from the one *.txt file in client/public named like a key. */
function resolveKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;
  const dir = path.join(ROOT, "client", "public");
  const match = fs
    .readdirSync(dir)
    .find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (!match) {
    throw new Error(
      "No IndexNow key file found in client/public (expected <32-hex>.txt). " +
        "Set INDEXNOW_KEY or add one."
    );
  }
  return path.basename(match, ".txt");
}

/** The marketing pages, taken straight from the built sitemap-pages.xml. */
function staticUrls() {
  const file = path.join(ROOT, "dist", "public", "sitemap-pages.xml");
  if (!fs.existsSync(file)) {
    throw new Error(
      `${file} not found — run \`npm run build\` (or \`npm run prerender\`) first.`
    );
  }
  return [...fs.readFileSync(file, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => m[1]
  );
}

async function sitemapUrls() {
  const res = await fetch(`${SITE}/sitemap.xml`, {
    headers: { "user-agent": "newsplatform-indexnow/1.0" },
  });
  if (!res.ok) throw new Error(`GET /sitemap.xml -> ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || args.has("-n");

  const key = resolveKey();
  let urlList = staticUrls();
  if (args.has("--sitemap")) {
    const extra = await sitemapUrls();
    urlList = [...new Set([...urlList, ...extra])];
  }

  // IndexNow accepts up to 10,000 URLs per request.
  const urls = urlList.slice(0, 10000);
  const body = {
    host: HOST,
    key,
    keyLocation: `${SITE}/${key}.txt`,
    urlList: urls,
  };

  console.log(`IndexNow: ${urls.length} URL(s), key ${key}`);
  for (const u of urls.slice(0, 20)) console.log(`  ${u}`);
  if (urls.length > 20) console.log(`  … and ${urls.length - 20} more`);

  if (dryRun) {
    console.log("\n--dry-run: nothing submitted.");
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  console.log(`\n${ENDPOINT} -> ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (text) console.log(text);
  // 200 = accepted, 202 = accepted but key not yet validated.
  if (res.status !== 200 && res.status !== 202) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});

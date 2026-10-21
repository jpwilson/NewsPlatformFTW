/**
 * Build-time prerenderer for NewsPlatform's public marketing pages.
 *
 * Runs after `vite build` (see package.json). For each page defined in
 * client/src/content/marketing.ts it writes a real static HTML file into
 * dist/public containing the page's full text, head tags and JSON-LD — so
 * every crawler, including the AI fetchers that do not run JavaScript, gets
 * the content without any user-agent sniffing. The React app boots on top of
 * the same markup and takes over.
 *
 * Also emits: app.html (the plain SPA shell the catch-all rewrite serves),
 * /llms.txt and /llms-full.txt, /robots.txt and /sitemap-pages.xml.
 *
 *   npx tsx scripts/prerender.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LAST_UPDATED_ISO,
  MARKETING_PAGES,
  ONE_LINER,
  SITE_URL,
  pageJsonLd,
  pageToMarkdown,
  stripTags,
  type MarketingPage,
} from "../client/src/content/marketing";
import { renderShellHtml } from "../client/src/content/shell";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist", "public");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Public pages that stay client-rendered but belong in the sitemap. */
const EXTRA_SITEMAP_PATHS = ["/channels", "/api", "/advertise", "/privacy", "/terms"];

function headTagsFor(page: MarketingPage): string {
  const url = `${SITE_URL}${page.path === "/" ? "/" : page.path}`;
  const image = `${SITE_URL}/logo-stacked.png`;
  // data-rh marks these as react-helmet-async-managed so the app replaces them
  // on mount rather than leaving a second copy behind.
  return [
    `<title data-rh="true">${esc(page.title)}</title>`,
    `<meta data-rh="true" name="description" content="${esc(page.description)}" />`,
    `<link data-rh="true" rel="canonical" href="${url}" />`,
    `<meta data-rh="true" property="og:type" content="website" />`,
    `<meta data-rh="true" property="og:site_name" content="NewsPlatform" />`,
    `<meta data-rh="true" property="og:title" content="${esc(page.title)}" />`,
    `<meta data-rh="true" property="og:description" content="${esc(page.description)}" />`,
    `<meta data-rh="true" property="og:url" content="${url}" />`,
    `<meta data-rh="true" property="og:image" content="${image}" />`,
    `<meta data-rh="true" name="twitter:card" content="summary_large_image" />`,
    `<meta data-rh="true" name="twitter:title" content="${esc(page.title)}" />`,
    `<meta data-rh="true" name="twitter:description" content="${esc(page.description)}" />`,
    `<meta data-rh="true" name="twitter:image" content="${image}" />`,
    `<script data-rh="true" type="application/ld+json">${JSON.stringify(
      pageJsonLd(page)
    )}</script>`,
  ].join("\n    ");
}

/** Strip the template's generic head tags so the per-page ones are the only ones. */
function stripTemplateHead(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/<meta name="description"[^>]*>/, "")
    .replace(/<meta property="og:[^"]*"[^>]*>/g, "")
    .replace(/<meta name="twitter:[^"]*"[^>]*>/g, "")
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
    .replace(/<!-- Social sharing[^>]*-->/g, "")
    .replace(/<!-- Canonical site name[^>]*-->/g, "");
}

function buildPage(template: string, page: MarketingPage): string {
  let html = stripTemplateHead(template);
  html = html.replace("</head>", `  ${headTagsFor(page)}\n  </head>`);
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root">${renderShellHtml(page)}</div>`
  );
  return html;
}

function writeFile(relPath: string, contents: string) {
  const full = path.join(OUT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

function wordCount(html: string): number {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return body.split(/\s+/).filter(Boolean).length;
}

/* ------------------------------------------------------------------ llms */

function buildLlmsTxt(): string {
  const lines: string[] = [];
  lines.push("# NewsPlatform");
  lines.push("");
  lines.push(`> ${ONE_LINER}`);
  lines.push("");
  lines.push(
    "NewsPlatform is a publishing platform, not a news aggregator: every article on the site was written and published to the site by the channel it appears under. Nothing is scraped or syndicated from other news sites, and outlets are not scored for political bias."
  );
  lines.push("");
  lines.push("## Facts");
  lines.push("");
  lines.push("- Site: " + SITE_URL + "/");
  lines.push("- Reading is free and requires no account.");
  lines.push(
    "- Creating an account, creating a channel and publishing articles are free. There are no subscription fees for writers."
  );
  lines.push(
    "- There are no paid reader subscriptions, no paywall and no revenue share for writers."
  );
  lines.push(
    "- The homepage feed is chronological (newest published first), with no algorithmic ranking."
  );
  lines.push(
    "- Articles are filed under Politics, Business, Tech, AI, Science, Sports, Culture, Lifestyle, Education, Environment, Opinion and Law."
  );
  lines.push("- Article URLs look like " + SITE_URL + "/articles/<id>/<slug>.");
  lines.push(
    "- Advertising is sold as clearly labelled sponsorship: a homepage Featured Lead at $99/day and channel sponsorships from $299/month (see /advertise)."
  );
  lines.push("");
  lines.push("## Key pages");
  lines.push("");
  for (const p of MARKETING_PAGES) {
    lines.push(
      `- [${p.h1}](${SITE_URL}${p.path === "/" ? "/" : p.path}): ${stripTags(p.description)}`
    );
  }
  lines.push(`- [Channel directory](${SITE_URL}/channels): every channel on the platform.`);
  lines.push(
    `- [Content API documentation](${SITE_URL}/api): public read-only JSON endpoint for recent articles, plus an authenticated write API.`
  );
  lines.push(`- [Advertise](${SITE_URL}/advertise): sponsorship placements and published rates.`);
  lines.push("");
  lines.push("## Feeds");
  lines.push("");
  lines.push(`- Sitemap: ${SITE_URL}/sitemap.xml`);
  lines.push(`- RSS (whole site): ${SITE_URL}/rss.xml`);
  lines.push(`- RSS (per channel): ${SITE_URL}/channels/<id>/rss.xml`);
  lines.push(`- Full text of these pages: ${SITE_URL}/llms-full.txt`);
  lines.push("");
  lines.push(`Last updated: ${LAST_UPDATED_ISO}`);
  lines.push("");
  return lines.join("\n");
}

function buildLlmsFullTxt(): string {
  const parts = [
    "# NewsPlatform — full text of the public pages",
    "",
    `Source: ${SITE_URL}/ — generated at build time from the site's own content.`,
    `Last updated: ${LAST_UPDATED_ISO}`,
    "",
    "---",
    "",
  ];
  for (const p of MARKETING_PAGES) {
    parts.push(pageToMarkdown(p), "---", "");
  }
  return parts.join("\n");
}

/* --------------------------------------------------------------- sitemap */

/**
 * Static list of the marketing URLs. The live /sitemap.xml is generated by the
 * API (it also contains every article and channel); this file is a build-time
 * fallback and lets scripts/check-seo.mjs verify the page list offline.
 */
function buildPagesSitemap(): string {
  const paths = [...MARKETING_PAGES.map((p) => p.path), ...EXTRA_SITEMAP_PATHS];
  const urls = paths
    .map(
      (p) =>
        `<url><loc>${SITE_URL}${p === "/" ? "/" : p}</loc><lastmod>${LAST_UPDATED_ISO}</lastmod></url>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;
}

/* ------------------------------------------------------------------ main */

function main() {
  const templatePath = path.join(OUT, "index.html");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`${templatePath} not found — run \`vite build\` first.`);
  }
  const template = fs.readFileSync(templatePath, "utf8");

  // The plain SPA shell, served by the vercel.json catch-all for every route
  // that is not a prerendered file (channels, articles, profile, admin…).
  writeFile("app.html", template);

  const report: { url: string; words: number; bytes: number }[] = [];

  for (const page of MARKETING_PAGES) {
    const html = buildPage(template, page);
    const rel = page.path === "/" ? "index.html" : `${page.path.replace(/^\//, "")}/index.html`;
    writeFile(rel, html);
    report.push({ url: page.path, words: wordCount(html), bytes: html.length });
  }

  writeFile("llms.txt", buildLlmsTxt());
  writeFile("llms-full.txt", buildLlmsFullTxt());
  writeFile("sitemap-pages.xml", buildPagesSitemap());

  console.log(`\nPrerendered ${MARKETING_PAGES.length} marketing pages into dist/public:`);
  for (const r of report) {
    console.log(`  ${r.url.padEnd(20)} ${String(r.words).padStart(5)} words  ${r.bytes} bytes`);
  }
  console.log("  + app.html, llms.txt, llms-full.txt, sitemap-pages.xml\n");
}

main();

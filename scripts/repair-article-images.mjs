#!/usr/bin/env node
/**
 * One-off repair for existing articles whose attached images are copies of
 * body images under unrelated URLs (article 814: the cover is
 * api_814_…_0.jpg in storage, the body figure is the Wikimedia original),
 * plus re-hosting of body images that are still hot-linked.
 *
 * DRY RUN BY DEFAULT. It writes production content only with --apply, and
 * running it with --apply is the owner's decision.
 *
 * For each article:
 *   1. download every attached image (public bucket URL) and every external
 *      body image (with the same guards as the Content API);
 *   2. match body images to attached ones by exact SHA-256, then (if the
 *      optional `canvas` package loads) by a 64-bit difference hash with
 *      Hamming distance <= 5 and aspect ratio within 2%;
 *   3. a matched body <img src> is set to the attached image's stored URL,
 *      so the page's exact rule shows the photo once (as the hero, with the
 *      figure's caption);
 *   4. other external body images are re-hosted (content-addressed) and
 *      their src set to the stored copy (skip with --no-rehost).
 * Only `src` attributes in articles.content change. No figure or text is
 * removed, no row is touched, nothing is deleted from storage. Each update
 * is preceded by a backup line (JSONL) so --rollback can undo it. Running it
 * twice changes nothing the second time.
 *
 * Usage (env: SUPABASE_URL, SUPABASE_SERVICE_KEY; no .env file is read)
 *   node scripts/repair-article-images.mjs [--article <id>] [--limit N] [--report out.html]
 *   node scripts/repair-article-images.mjs --apply [--article <id>] [--backup file.jsonl] [--no-rehost]
 *   node scripts/repair-article-images.mjs --rollback file.jsonl [--apply]
 */

import { createHash } from "node:crypto";
import fs from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { sortImages, storagePathFromUrl, toStoredUrl } from "../shared/article-media.js";
import { bodyImageUrls, fetchRemoteImage, rewriteBodySrc, storeImageBuffer } from "../api/_lib/image-ingest.js";

/* ------------------------------------------------------------------ args */

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = has("--apply");
const ONLY = opt("--article");
const LIMIT = opt("--limit") ? parseInt(opt("--limit"), 10) : Infinity;
const REPORT = opt("--report");
const ROLLBACK = opt("--rollback");
const REHOST = !has("--no-rehost");
const BACKUP = opt("--backup") || `repair-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment (no .env file is read).");
  process.exit(2);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
console.log(`Supabase: ${new URL(SUPABASE_URL).host}   mode: ${APPLY ? "APPLY (writes content)" : "dry run (no writes)"}`);

/* ------------------------------------------------------------- rollback */

if (ROLLBACK) {
  const lines = fs.readFileSync(ROLLBACK, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let restored = 0;
  for (const entry of lines.reverse()) {
    const { data } = await sb.from("articles").select("id, content").eq("id", entry.id).maybeSingle();
    if (!data) {
      console.log(`  ${entry.id}: gone, skipped`);
      continue;
    }
    if (data.content !== entry.after) {
      console.log(`  ${entry.id}: edited since the repair, skipped (restore by hand from the backup)`);
      continue;
    }
    if (APPLY) {
      const { error } = await sb.from("articles").update({ content: entry.before }).eq("id", entry.id);
      if (error) {
        console.error(`  ${entry.id}: restore failed: ${error.message}`);
        continue;
      }
    }
    restored++;
    console.log(`  ${entry.id}: ${APPLY ? "restored" : "would restore"}`);
  }
  console.log(`${restored} article(s) ${APPLY ? "restored" : "would be restored"}.`);
  process.exit(0);
}

/* ---------------------------------------------------------- perceptual */

let canvasLib = null;
try {
  canvasLib = await import("canvas");
} catch {
  console.log("canvas not available: matching on SHA-256 only.");
}

/** { dhash: bigint, aspect } or null. 9x8 grayscale, row-wise gradient. */
async function perceptual(buffer) {
  if (!canvasLib) return null;
  try {
    const img = await canvasLib.loadImage(buffer);
    const c = canvasLib.createCanvas(9, 8);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, 9, 8);
    const px = ctx.getImageData(0, 0, 9, 8).data;
    const gray = (x, y) => {
      const i = (y * 9 + x) * 4;
      return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
    };
    let hash = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | (gray(x, y) > gray(x + 1, y) ? 1n : 0n);
    return { dhash: hash, aspect: img.width / img.height };
  } catch {
    return null;
  }
}

const hamming = (a, b) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};
const sha256 = (b) => createHash("sha256").update(b).digest("hex");

async function fetchStored(url) {
  const r = await fetch(toStoredUrl(url, SUPABASE_URL), { redirect: "follow" });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* --------------------------------------------------------------- repair */

async function planArticle(article) {
  const { data: rows } = await sb.from("article_images").select("id, image_url, caption, order").eq("article_id", article.id);
  const attached = sortImages(rows || []);
  const external = [...new Set(bodyImageUrls(article.content || "").filter((u) => !storagePathFromUrl(u)))];
  const result = { id: article.id, title: article.title, matched: [], rehosted: [], failed: [], changed: false };
  if (!external.length) return { result, map: new Map() };

  const known = [];
  for (const row of attached) {
    try {
      const buf = await fetchStored(row.image_url);
      known.push({ row, sha: sha256(buf), p: await perceptual(buf) });
    } catch (err) {
      result.failed.push({ url: row.image_url, reason: `attached: ${err.message}` });
    }
  }

  const map = new Map();
  for (const url of external) {
    let got;
    try {
      got = await fetchRemoteImage(url);
    } catch (err) {
      result.failed.push({ url, reason: err.reason || err.message });
      continue;
    }
    const sha = sha256(got.buffer);
    let match = known.find((k) => k.sha === sha);
    let how = "sha256";
    if (!match) {
      const p = await perceptual(got.buffer);
      if (p) {
        match = known.find((k) => k.p && hamming(k.p.dhash, p.dhash) <= 5 && Math.abs(k.p.aspect - p.aspect) / k.p.aspect <= 0.02);
        how = "dhash";
      }
    }
    if (match) {
      const stored = toStoredUrl(match.row.image_url, SUPABASE_URL);
      map.set(url, stored);
      result.matched.push({ url, row: match.row.id, stored, how });
    } else if (REHOST) {
      const stored = APPLY ? await storeImageBuffer(sb, got.buffer, got.contentType) : "(would re-host)";
      if (APPLY) map.set(url, stored);
      result.rehosted.push({ url, stored });
    }
  }
  return { result, map };
}

async function* articles() {
  if (ONLY) {
    const { data } = await sb.from("articles").select("id, title, content").eq("id", parseInt(ONLY, 10));
    yield* data || [];
    return;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("articles").select("id, title, content").order("id", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    if (!data || !data.length) return;
    yield* data;
    if (data.length < 1000) return;
  }
}

const results = [];
let processed = 0;
for await (const article of articles()) {
  if (processed >= LIMIT) break;
  if (!bodyImageUrls(article.content || "").some((u) => !storagePathFromUrl(u))) continue;
  processed++;
  const { result, map } = await planArticle(article);
  const after = rewriteBodySrc(article.content || "", map);
  result.changed = after !== article.content;
  if (result.changed && APPLY) {
    fs.appendFileSync(BACKUP, JSON.stringify({ id: article.id, at: new Date().toISOString(), before: article.content, after }) + "\n");
    const { error } = await sb.from("articles").update({ content: after }).eq("id", article.id);
    if (error) {
      result.failed.push({ url: "", reason: `update failed: ${error.message}` });
      result.changed = false;
    }
  }
  results.push(result);
  console.log(
    `  ${article.id}: ${result.matched.length} matched, ${result.rehosted.length} re-hosted, ${result.failed.length} failed` +
      (result.changed ? (APPLY ? ", content updated" : ", would update content") : "")
  );
}

const changed = results.filter((r) => r.changed).length;
console.log(`\n${processed} article(s) with external body images; ${changed} ${APPLY ? "updated" : "would be updated"}.`);
if (APPLY && changed) console.log(`Backup: ${BACKUP}  (undo: --rollback ${BACKUP} --apply)`);

if (REPORT) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const list = (items, f) => (items.length ? `<ul>${items.map((i) => `<li>${f(i)}</li>`).join("")}</ul>` : "");
  const rowsHtml = results
    .map(
      (r) => `<tr><td>${r.id}</td><td>${esc(r.title)}</td>
<td>${list(r.matched, (m) => `<img src="${esc(m.stored)}" width="120"> ${esc(m.how)} → row ${m.row}<br><small>${esc(m.url)}</small>`)}</td>
<td>${list(r.rehosted, (m) => `<small>${esc(m.url)}</small>`)}</td>
<td>${list(r.failed, (m) => `${esc(m.reason)} <small>${esc(m.url)}</small>`)}</td>
<td>${r.changed ? "yes" : ""}</td></tr>`
    )
    .join("\n");
  fs.writeFileSync(
    REPORT,
    `<!doctype html><meta charset="utf-8"><title>Image repair ${APPLY ? "(applied)" : "(dry run)"}</title>
<style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;vertical-align:top}</style>
<h1>Image repair ${APPLY ? "(applied)" : "(dry run)"}</h1><p>${processed} articles, ${changed} changed.</p>
<table><tr><th>id</th><th>title</th><th>matched to attached</th><th>re-hosted</th><th>failed</th><th>changed</th></tr>${rowsHtml}</table>`
  );
  console.log(`Report: ${REPORT}`);
}

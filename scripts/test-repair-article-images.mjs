#!/usr/bin/env node
/**
 * Offline test of scripts/repair-article-images.mjs against the stub
 * Supabase and a local image host: dry run changes nothing; --apply points
 * the body copies of attached photos at the attached objects (so the page
 * shows each once), re-hosts the rest, writes a backup; a second run is a
 * no-op; --rollback restores.
 *
 *   node scripts/test-repair-article-images.mjs      (npm run test:repair)
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { composeArticleMedia } from "../shared/article-media.js";
import { startStubSupabase } from "./lib/stub-supabase.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "repair-article-images.mjs");

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, n)]);
const MARCH = jpeg(1);
const STRIKE = jpeg(2);
const SORDO = jpeg(3);
const OTHER = jpeg(4);

const host = http.createServer((req, res) => {
  const files = { "/march.jpg": MARCH, "/strike.jpg": STRIKE, "/sordo.jpg": SORDO, "/other.jpg": OTHER };
  const f = files[new URL(req.url, "http://x").pathname];
  if (!f) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { "content-type": "image/jpeg" });
  res.end(f);
});
await new Promise((r) => host.listen(0, "127.0.0.1", r));
const IMG = `http://127.0.0.1:${host.address().port}`;

const fig = (src, cap) => `<figure class="article-figure"><img src="${src}" alt="${cap}" loading="lazy"><figcaption>${cap}</figcaption></figure>`;
const content =
  `<p>Lede paragraph of the article.</p>${fig(`${IMG}/march.jpg?width=1920`, "Marchers in Madrid. Photo: Nemo")}` +
  `<p>Middle.</p>${fig(`${IMG}/strike.jpg?width=1920`, "The 2012 strike")}<p>More.</p>${fig(`${IMG}/sordo.jpg`, "Unai Sordo")}` +
  `<p>Not attached:</p>${fig(`${IMG}/other.jpg`, "Other")}`;

const seed = () => ({
  articles: [{ id: 814, title: "Strike", content, status: "published", published: true }],
  article_images: [
    { id: 1, article_id: 814, image_url: "STUB/storage/v1/object/sign/article-images/api_814_1_0.jpg?token=t", caption: "", order: 0 },
    { id: 2, article_id: 814, image_url: "STUB/storage/v1/object/sign/article-images/api_814_1_1.jpg?token=t", caption: "", order: 1 },
    { id: 3, article_id: 814, image_url: "STUB/storage/v1/object/sign/article-images/api_814_1_2.jpg?token=t", caption: "", order: 2 },
  ],
});
const stub = await startStubSupabase({
  objects: {
    "article-images/api_814_1_0.jpg": { bytes: MARCH, type: "image/jpeg" },
    "article-images/api_814_1_1.jpg": { bytes: STRIKE, type: "image/jpeg" },
    "article-images/api_814_1_2.jpg": { bytes: SORDO, type: "image/jpeg" },
  },
});
const reseed = () => {
  const data = seed();
  for (const r of data.article_images) r.image_url = r.image_url.replace("STUB", stub.url);
  stub.reset(data);
};
reseed();

const work = fs.mkdtempSync(path.join(os.tmpdir(), "np-repair-test-"));
const run = (...extra) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...extra], {
      cwd: work,
      env: { PATH: process.env.PATH, SUPABASE_URL: stub.url, SUPABASE_SERVICE_KEY: "test-service-key", NP_INGEST_ALLOW_HOSTS: `127.0.0.1:${host.address().port}` },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });
const current = () => stub.table("articles")[0].content;

console.log("\nrepair-article-images:");

let r = await run("--report", path.join(work, "dry.html"));
check("dry run exits 0", r.code === 0, r.out);
check("dry run says it would update", /would update content/.test(r.out), r.out);
check("dry run changes nothing", current() === content);
check("dry run uploads nothing", stub.storage.uploads.length === 0, stub.storage.uploads);
check("report written", fs.existsSync(path.join(work, "dry.html")));
check("composeArticleMedia before the repair: mirror (legacy guess)", composeArticleMedia({ images: stub.table("article_images"), html: current() }).dedupe === "mirror");

r = await run("--apply", "--backup", "b.jsonl");
check("apply exits 0", r.code === 0, r.out);
const after = current();
const PUB = (p) => `${stub.url}/storage/v1/object/public/article-images/${p}`;
check("body copies now point at the attached objects", after.includes(`src="${PUB("api_814_1_0.jpg")}"`) && after.includes(`src="${PUB("api_814_1_1.jpg")}"`) && after.includes(`src="${PUB("api_814_1_2.jpg")}"`), after);
check("unattached external image re-hosted by content", /src="[^"]*\/article-images\/c\/[0-9a-f]{32}\.jpg"/.test(after) && !after.includes(`${IMG}/`), after);
check("captions and text untouched", after.replace(/src="[^"]*"/g, "") === content.replace(/src="[^"]*"/g, ""));
check("backup written", fs.readFileSync(path.join(work, "b.jsonl"), "utf8").trim().split("\n").length === 1);
const composed = composeArticleMedia({ images: stub.table("article_images"), html: after });
check("page rule now exact: hero = cover with the figure's caption", composed.dedupe === "exact" && composed.hero?.caption === "Marchers in Madrid." && composed.hero?.credit === "Nemo", composed.hero);
check("each photo once: cover figure removed, others in the body, no gallery", !composed.bodyHtml.includes("api_814_1_0") && composed.bodyHtml.includes("api_814_1_1") && composed.gallery.length === 0, composed);
check("no storage object deleted, no row changed", stub.storage.removed.length === 0 && stub.table("article_images").length === 3);

r = await run("--apply", "--backup", "b2.jsonl");
check("second run changes nothing", current() === after && !fs.existsSync(path.join(work, "b2.jsonl")), r.out);

r = await run("--rollback", "b.jsonl");
check("rollback dry run changes nothing", current() === after && /would restore/.test(r.out), r.out);
r = await run("--rollback", "b.jsonl", "--apply");
check("rollback restores the original content", current() === content, r.out);

r = await run();
check("a plain dry run after the rollback still exits 0", r.code === 0);
const noEnv = await new Promise((resolve) => {
  const child = spawn(process.execPath, [SCRIPT], { cwd: work, env: { PATH: process.env.PATH } });
  child.on("exit", resolve);
});
check("exits 2 without SUPABASE_URL / SUPABASE_SERVICE_KEY", noEnv === 2);

host.close();
await stub.close();
fs.rmSync(work, { recursive: true, force: true });
console.log("");
if (failures) {
  console.error(`test-repair-article-images: ${failures} failure(s).\n`);
  process.exit(1);
}
console.log("test-repair-article-images: all checks passed.\n");

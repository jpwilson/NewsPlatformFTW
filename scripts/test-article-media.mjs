#!/usr/bin/env node
/**
 * Unit tests for shared/article-media.js: permanent image URLs, image
 * identity, captions, excerpts and composeArticleMedia (the cover/duplicate
 * rule shared by the SPA and the crawler prerenderer). No network.
 *
 *   node scripts/test-article-media.mjs      (npm run test:media)
 */

import fs from "node:fs";

import {
  composeArticleMedia,
  deriveExcerpt,
  extractDek,
  imageKey,
  joinCaptionCredit,
  readMinutes,
  rewriteStorageUrls,
  setDek,
  sortImages,
  splitCaptionCredit,
  storagePathFromUrl,
  storeMediaUrls,
  toMediaUrl,
  toStoredUrl,
  LAST_EDITED_IS_TRUSTWORTHY,
} from "../shared/article-media.js";

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (label, actual, expected) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

const SB = "https://mwrhaqghxatfwzsjjfrv.supabase.co";
const TOKEN = "eyJraWQiOiJ4In0.eyJ1cmwiOiJhIn0.sig_-x";
const signed = (p) => `${SB}/storage/v1/object/sign/article-images/${p}?token=${TOKEN}`;
const pub = (p) => `${SB}/storage/v1/object/public/article-images/${p}`;

/* ----------------------------------------------------------------- URLs */
console.log("\nURLs:");
eq("signed URL → path", storagePathFromUrl(signed("api_1_2_0.jpg")), "api_1_2_0.jpg");
eq("public URL → path", storagePathFromUrl(pub("channels/4/banner_1_x.png")), "channels/4/banner_1_x.png");
eq("authenticated URL → path", storagePathFromUrl(`${SB}/storage/v1/object/authenticated/article-images/a.jpg`), "a.jpg");
eq("render/image URL → path", storagePathFromUrl(`${SB}/storage/v1/render/image/public/article-images/a.jpg?width=400`), "a.jpg");
eq("relative /media → path", storagePathFromUrl("/media/c/abc.jpg"), "c/abc.jpg");
eq("absolute /media on our host → path", storagePathFromUrl("https://www.newsplatform.org/media/c/abc.jpg?x=1"), "c/abc.jpg");
eq("absolute /media on a preview host → path", storagePathFromUrl("https://np-git-x.vercel.app/media/a.jpg"), "a.jpg");
eq("/media on someone else's host → null", storagePathFromUrl("https://www.bbc.co.uk/media/a.jpg"), null);
eq("other bucket → null", storagePathFromUrl(`${SB}/storage/v1/object/public/avatars/a.jpg`), null);
eq("traversal → null", storagePathFromUrl("/media/../secret"), null);
eq("unsafe chars → null", storagePathFromUrl(pub("My%20Photo.jpg")), null);
eq("external → null", storagePathFromUrl("https://commons.wikimedia.org/wiki/Special:FilePath/X.jpg"), null);
eq("non-string → null", storagePathFromUrl(null), null);
eq("toMediaUrl relative", toMediaUrl(signed("a.jpg")), "/media/a.jpg");
eq("toMediaUrl absolute", toMediaUrl(signed("a.jpg"), "https://www.newsplatform.org/"), "https://www.newsplatform.org/media/a.jpg");
eq("toMediaUrl external unchanged", toMediaUrl("https://x.example/a.jpg", "https://h"), "https://x.example/a.jpg");
eq("toStoredUrl /media", toStoredUrl("/media/c/a.jpg", SB), pub("c/a.jpg"));
eq("toStoredUrl signed → public", toStoredUrl(signed("a.jpg"), SB + "/"), pub("a.jpg"));
eq("toStoredUrl external unchanged", toStoredUrl("https://x.example/a.jpg", SB), "https://x.example/a.jpg");

{
  const html = `<p><img src="${signed("a.jpg").replace("?", "?download=1&amp;")}" alt="x"> <a href="${pub("b.png")}">b</a> <img src="https://x.example/c.jpg"></p>`;
  const json = JSON.stringify({ content: html, images: [{ image_url: signed("d.jpg") }], avatar: pub("channels/1/p.jpg") });
  const out = rewriteStorageUrls(json, "https://www.newsplatform.org");
  let parsed = null;
  try {
    parsed = JSON.parse(out);
  } catch {}
  check("rewrite inside JSON still parses", !!parsed, out);
  check("no supabase URL left", !out.includes("supabase.co"), out);
  check("no token left", !out.includes("token="), out);
  check("body img rewritten", parsed && parsed.content.includes('src="https://www.newsplatform.org/media/a.jpg"'), parsed && parsed.content);
  check("external image untouched", out.includes("https://x.example/c.jpg"));
  eq("row rewritten", parsed && parsed.images[0].image_url, "https://www.newsplatform.org/media/d.jpg");
  eq("channel avatar rewritten", parsed && parsed.avatar, "https://www.newsplatform.org/media/channels/1/p.jpg");

  const escaped = JSON.stringify(html).replace(/\//g, "\\/");
  const out2 = rewriteStorageUrls(escaped, "");
  check("JSON with \\/ escapes: rewritten", !out2.includes("supabase") && out2.includes("\\\"\\/media") === false && out2.includes("/media/a.jpg"), out2);
  check("JSON with \\/ escapes: parses", (() => { try { JSON.parse(out2); return true; } catch { return false; } })());
  const weird = `<img src="${pub("My%20Photo.jpg")}">`;
  eq("unservable path left alone", rewriteStorageUrls(weird), weird);
  eq("text without the bucket is returned as is", rewriteStorageUrls("plain"), "plain");
}
{
  const html = `<img src="/media/c/a.jpg"><img src='https://www.newsplatform.org/media/b.png?v=1'><img src="https://www.bbc.co.uk/media/x.jpg"><img src="https://e.example/a/media/y.jpg">`;
  const out = storeMediaUrls(html, SB);
  check("relative /media stored as public URL", out.includes(`src="${pub("c/a.jpg")}"`), out);
  check("absolute /media on our host stored", out.includes(`src='${pub("b.png")}'`), out);
  check("foreign /media untouched", out.includes("https://www.bbc.co.uk/media/x.jpg") && out.includes("https://e.example/a/media/y.jpg"), out);
  const j = JSON.stringify({ c: '<img src="/media/a.jpg">' }).replace(/\//g, "\\/");
  const outJ = storeMediaUrls(j, SB);
  check("storeMediaUrls on JSON-escaped text", JSON.parse(outJ).c === `<img src="${pub("a.jpg")}">`, outJ);
  eq("round trip", rewriteStorageUrls(storeMediaUrls(html, SB)), html.replace("https://www.newsplatform.org/media/b.png?v=1", "/media/b.png"));
}

/* ------------------------------------------------------------- identity */
console.log("\nimageKey:");
eq("signed and /media agree", imageKey(signed("a.jpg")), imageKey("/media/a.jpg"));
eq("storage key form", imageKey(pub("a.jpg")), "s:a.jpg");
const wm = "wm:26S-Manifestación_por_la_vivienda--01.jpg";
eq("Special:FilePath", imageKey("https://commons.wikimedia.org/wiki/Special:FilePath/26S-Manifestaci%C3%B3n%20por%20la%20vivienda--01.jpg?width=1920"), wm);
eq("Special:Redirect/file", imageKey("https://commons.wikimedia.org/wiki/Special:Redirect/file/26S-Manifestaci%C3%B3n_por_la_vivienda--01.jpg"), wm);
eq("File: page", imageKey("https://commons.wikimedia.org/wiki/File:26S-Manifestación_por_la_vivienda--01.jpg"), wm);
eq("upload original", imageKey("https://upload.wikimedia.org/wikipedia/commons/a/ab/26S-Manifestaci%C3%B3n_por_la_vivienda--01.jpg"), wm);
eq("upload thumb", imageKey("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/26S-Manifestaci%C3%B3n_por_la_vivienda--01.jpg/1280px-26S-Manifestaci%C3%B3n_por_la_vivienda--01.jpg"), wm);
eq("sizing params dropped", imageKey("https://img.example.com/p/a.jpg?w=800&q=70&id=5"), "u:img.example.com/p/a.jpg?id=5");
eq("http and https agree", imageKey("http://img.example.com/a.jpg?width=10"), imageKey("https://IMG.example.com/a.jpg"));
eq("&amp; in src", imageKey("https://img.example.com/a.jpg?id=5&amp;w=3"), "u:img.example.com/a.jpg?id=5");
eq("empty → ''", imageKey(""), "");

/* ------------------------------------------------------------- captions */
console.log("\ncaptions:");
eq("split Photo:", splitCaptionCredit("Marchers in Madrid. Photo: Nemo / Wikimedia Commons (CC BY-SA 4.0)"), {
  caption: "Marchers in Madrid.",
  credit: "Nemo / Wikimedia Commons (CC BY-SA 4.0)",
});
eq("split without credit", splitCaptionCredit("Just a caption"), { caption: "Just a caption", credit: "" });
eq("credit only", splitCaptionCredit("Photo: AFP"), { caption: "", credit: "AFP" });
eq("empty", splitCaptionCredit(null), { caption: "", credit: "" });
eq("join", joinCaptionCredit("Marchers.", "AFP"), "Marchers. Photo: AFP");
eq("join, no credit", joinCaptionCredit("Marchers.", ""), "Marchers.");
eq("join does not duplicate", joinCaptionCredit("Marchers. Photo: AFP", "AFP"), "Marchers. Photo: AFP");
eq("split(join) round trip", splitCaptionCredit(joinCaptionCredit("A b c.", "X / Y")), { caption: "A b c.", credit: "X / Y" });

/* ----------------------------------------------------- dek and excerpt */
console.log("\ndek / excerpt:");
{
  const body = '<p class="article-dek">Unions say 90% &amp; more.</p>\n<p>First real paragraph of the story text.</p>';
  eq("extractDek text", extractDek(body).dek, "Unions say 90% & more.");
  eq("extractDek rest", extractDek(body).html, "<p>First real paragraph of the story text.</p>");
  eq("no dek", extractDek("<p>x</p>"), { dek: null, html: "<p>x</p>" });
  eq("setDek replaces", setDek(body, "New <dek>"), '<p class="article-dek">New &lt;dek&gt;</p>\n<p>First real paragraph of the story text.</p>');
  eq("setDek null removes", setDek(body, null), "<p>First real paragraph of the story text.</p>");
  eq("setDek inserts", extractDek(setDek("<p>a</p>", "D")).dek, "D");
  eq("deriveExcerpt prefers dek", deriveExcerpt(body), "Unions say 90% & more.");
  eq(
    "deriveExcerpt skips callouts and figures",
    deriveExcerpt('<aside class="callout"><p>Callout text that is long enough.</p></aside><figure><figcaption>Caption that is long enough here</figcaption></figure><p>The lede paragraph goes here.</p>'),
    "The lede paragraph goes here."
  );
  eq(
    "deriveExcerpt falls back to summary bullet",
    deriveExcerpt('<aside class="callout callout-summary"><ul><li>First bullet.</li></ul></aside>'),
    "First bullet."
  );
  const long = deriveExcerpt(`<p>${"word ".repeat(100)}</p>`, 50);
  check("deriveExcerpt truncates at a word", long.length <= 50 && long.endsWith("…"), long);
  eq("readMinutes min 1", readMinutes("<p>hi</p>"), 1);
  eq("readMinutes 450 words", readMinutes(`<p>${"w ".repeat(450)}</p>`), 2);
}

/* -------------------------------------------------------------- sorting */
console.log("\nsortImages:");
eq(
  "by (order, id), stable",
  sortImages([{ id: 9, order: 1 }, { id: 3, order: 1 }, { id: 5, order: 0 }, { id: 1 }, { id: 2, order: "2" }]).map((r) => r.id),
  [5, 3, 9, 2, 1]
);
eq("non-array → []", sortImages(null), []);
check("LAST_EDITED_IS_TRUSTWORTHY is false", LAST_EDITED_IS_TRUSTWORTHY === false);

/* --------------------------------------------- composeArticleMedia: 814 */
console.log("\ncomposeArticleMedia, article 814 (mirror):");
{
  const a814 = JSON.parse(fs.readFileSync(new URL("./fixtures/article-814.json", import.meta.url), "utf8"));
  const r = composeArticleMedia({ images: a814.images, html: a814.content });
  const MARCH = "26S-Manifestaci%C3%B3n%20por%20la%20vivienda--01.jpg";
  const count = (s, sub) => s.split(sub).length - 1;
  eq("dedupe = mirror", r.dedupe, "mirror");
  eq("heroSource = body-promoted", r.heroSource, "body-promoted");
  check("hero is the Madrid march photo", r.hero && r.hero.src.includes(MARCH), r.hero && r.hero.src);
  check("hero caption is the figure's caption", r.hero && r.hero.caption.startsWith("Marchers at a housing demonstration in Spain on 3 October 2026"), r.hero && r.hero.caption);
  eq("hero credit split out", r.hero && r.hero.credit, "Nemo / Wikimedia Commons (CC BY-SA 4.0)");
  eq("march photo is gone from the body", count(r.bodyHtml, MARCH), 0);
  eq("march photo appears once in the lightbox", r.slides.filter((s) => s.src.includes(MARCH)).length, 1);
  check("2012 Madrid strike figure stays in the body", r.bodyHtml.includes("Huelga%20general%20del%2014%20de%20noviembre"));
  check("Unai Sordo figure stays in the body", r.bodyHtml.includes("Unai%20Sordo%201%20de%20mayo"));
  check("pull quote untouched", r.bodyHtml.includes('<figure class="pull-quote">'));
  eq("no attached image rendered", r.gallery.length, 0);
  check("no attached api_814 file in slides", !r.slides.some((s) => s.src.includes("api_814")));
  eq("slides: hero + 2 body", r.slides.map((s) => s.origin), ["hero", "body", "body"]);
  check("summary callout still there", r.bodyHtml.includes("callout-summary"));
  eq("only the figure was removed", a814.content.length - r.bodyHtml.length, (a814.content.match(/<figure class="article-figure">[\s\S]*?<\/figure>/) || [""])[0].length);
}

/* ------------------------------------------ composeArticleMedia: rules */
console.log("\ncomposeArticleMedia, rules:");
const fig = (src, cap) => `<figure class="article-figure"><img src="${src}" alt="${cap}" loading="lazy"><figcaption>${cap}</figcaption></figure>`;
{
  // Exact by key: the cover (signed) and a body figure (/media) are one photo.
  const r = composeArticleMedia({
    images: [
      { id: 2, order: 1, image_url: signed("c/b.jpg"), caption: "" },
      { id: 1, order: 0, image_url: signed("c/a.jpg"), caption: "" },
      { id: 3, order: 2, image_url: pub("c/z.jpg"), caption: "Gallery only" },
    ],
    html: `<p>Lede paragraph.</p>${fig("/media/c/a.jpg", "Cover caption. Photo: AFP")}<p>More.</p>${fig(pub("c/b.jpg"), "Second")}${fig(signed("c/b.jpg"), "Second again")}`,
  });
  eq("exact: dedupe", r.dedupe, "exact");
  eq("exact: hero is the cover (lowest order)", r.hero && r.hero.src, "/media/c/a.jpg");
  eq("exact: empty cover caption takes the figure's", r.hero && [r.hero.caption, r.hero.credit], ["Cover caption.", "AFP"]);
  check("exact: cover figure removed from body", !r.bodyHtml.includes("c/a.jpg"), r.bodyHtml);
  check("exact: other in-body attachment stays in the body once", r.bodyHtml.split("c/b.jpg").length - 1 === 1, r.bodyHtml);
  check("exact: repeated body key shows once", !r.bodyHtml.includes("Second again"));
  eq("exact: gallery = attached not in body", r.gallery.map((s) => s.src), ["/media/c/z.jpg"]);
  eq("exact: slides order", r.slides.map((s) => s.origin), ["hero", "body", "gallery"]);
  check("exact: body storage URLs served as /media", !r.bodyHtml.includes("supabase"), r.bodyHtml);
}
{
  // Exact by caption, cover caption wins.
  const r = composeArticleMedia({
    images: [{ image_url: pub("c/a.jpg"), caption: "Same words here. Photo: X" }],
    html: fig("https://ext.example/other.jpg", "Same words here. Photo: X") + "<p>t</p>",
    origin: "https://www.newsplatform.org",
  });
  eq("caption match: exact", r.dedupe, "exact");
  check("caption match: figure removed", !r.bodyHtml.includes("ext.example"), r.bodyHtml);
  eq("caption match: hero absolute", r.hero && r.hero.src, "https://www.newsplatform.org/media/c/a.jpg");
}
{
  // Otherwise: different photos are all kept.
  const r = composeArticleMedia({
    images: [{ image_url: pub("1700000000_cover.jpg"), caption: "Cover" }, { image_url: pub("x.jpg"), caption: "" }],
    html: `<p>Lede.</p>${fig("https://ext.example/body.jpg", "Body photo")}`,
  });
  eq("none: dedupe", r.dedupe, "none");
  eq("none: hero = cover", r.hero && [r.hero.src, r.hero.caption], ["/media/1700000000_cover.jpg", "Cover"]);
  check("none: body untouched", r.bodyHtml.includes("ext.example/body.jpg"));
  eq("none: gallery", r.gallery.map((s) => s.src), ["/media/x.jpg"]);
}
{
  // Mirror requires every condition: one captioned attachment disables it.
  const r = composeArticleMedia({
    images: [{ image_url: signed("api_1_2_0.jpg"), caption: "" }, { image_url: signed("api_1_2_1.jpg"), caption: "has caption" }],
    html: fig("https://ext.example/a.jpg", "A") + fig("https://ext.example/b.jpg", "B"),
  });
  eq("mirror off when a caption exists", r.dedupe, "none");
  // Mirror off when the body has fewer images than attachments.
  const r2 = composeArticleMedia({
    images: [{ image_url: signed("api_1_2_0.jpg") }, { image_url: signed("api_1_2_1.jpg") }],
    html: fig("https://ext.example/a.jpg", "A"),
  });
  eq("mirror off when body has fewer images", r2.dedupe, "none");
}
{
  // Mirror promotes the first standalone figure, not one inside a gallery.
  const gallery = `<div class="article-gallery" data-gallery data-count="2">${fig("https://e.example/g1.jpg", "G1")}${fig("https://e.example/g2.jpg", "G2")}</div>`;
  const r = composeArticleMedia({
    images: [{ image_url: signed("api_9_1_0.jpg") }],
    html: `${gallery}<p>x</p>${fig("https://e.example/solo.jpg", "Solo")}`,
  });
  eq("mirror: standalone figure promoted", r.hero && r.hero.src, "https://e.example/solo.jpg");
  check("mirror: gallery untouched", r.bodyHtml.includes("g1.jpg") && r.bodyHtml.includes("g2.jpg"));
}
{
  // Removing every image of a gallery removes the gallery wrapper.
  const gallery = `<div class="article-gallery" data-gallery data-count="2">${fig("/media/a.jpg", "A")}${fig("/media/b.jpg", "B")}</div>`;
  const r = composeArticleMedia({
    images: [{ image_url: pub("a.jpg") }],
    html: `<p>x</p>${gallery}<p>y</p>${fig("/media/a.jpg", "A again")}${fig(pub("b.jpg"), "B again")}`,
  });
  check("gallery with one image left keeps its wrapper", r.bodyHtml.includes("article-gallery") && r.bodyHtml.includes("b.jpg"), r.bodyHtml);
  const r2 = composeArticleMedia({
    images: [{ image_url: pub("a.jpg") }],
    html: `<p>x</p><div class="article-gallery">${fig("/media/a.jpg", "A")}</div><p>y</p>`,
  });
  check("emptied gallery removed", !r2.bodyHtml.includes("article-gallery"), r2.bodyHtml);
  eq("emptied gallery: rest of body intact", r2.bodyHtml, "<p>x</p><p>y</p>");
}
{
  // Bare <img> in a paragraph: the paragraph goes when the image was all of it.
  const r = composeArticleMedia({
    images: [{ image_url: pub("a.jpg") }, { image_url: pub("b.jpg") }],
    html: `<p><img src="/media/a.jpg"></p><p>Text <img src="/media/b.jpg"> more</p>`,
  });
  eq("bare img: paragraph and inline tag removal", r.bodyHtml, "<p>Text <img src=\"/media/b.jpg\"> more</p>");
}
{
  // Legacy and empty articles render as before.
  const plain = "<p>Old editor HTML with <strong>bold</strong>.</p>";
  const r = composeArticleMedia({ images: [], html: plain });
  eq("no images: hero null", r.hero, null);
  eq("no images: body unchanged", r.bodyHtml, plain);
  eq("no images: no slides", r.slides, []);
  const r2 = composeArticleMedia({ images: null, html: null });
  eq("null input safe", [r2.hero, r2.bodyHtml, r2.dedupe], [null, "", "none"]);
  const r3 = composeArticleMedia({ images: [{ image_url: pub("x.jpg"), caption: "Cap" }], html: '<p class="article-dek">The dek.</p><p>Body</p>' });
  eq("dek extracted", [r3.dek, r3.bodyHtml], ["The dek.", "<p>Body</p>"]);
  eq("cover only: hero", r3.hero && r3.hero.src, "/media/x.jpg");
}

console.log("");
if (failures) {
  console.error(`test-article-media: ${failures} failure(s).\n`);
  process.exit(1);
}
console.log("test-article-media: all checks passed.\n");

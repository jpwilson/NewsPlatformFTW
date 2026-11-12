#!/usr/bin/env node
/**
 * Offline tests for api/_lib/image-ingest.js: the SSRF guards, redirects,
 * type and size checks, content-addressed storage and ingestArticleMedia.
 * Images come from a local stub server; storage is scripts/lib/stub-supabase.
 *
 *   node scripts/test-image-ingest.mjs      (npm run test:ingest)
 */

import http from "node:http";

import { createClient } from "@supabase/supabase-js";

import { startStubSupabase } from "./lib/stub-supabase.mjs";

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const JPEG2 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(200, 9)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 3)]);

let hits = {};
const images = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  hits[u.pathname] = (hits[u.pathname] || 0) + 1;
  const send = (status, type, body, headers = {}) => {
    res.writeHead(status, { "content-type": type, ...headers });
    res.end(body);
  };
  switch (u.pathname) {
    case "/a.jpg": return send(200, "image/jpeg", JPEG);
    case "/b.jpg": return send(200, "image/jpeg", JPEG2);
    case "/p.png": return send(200, "image/png", PNG);
    case "/same-bytes.jpg": return send(200, "image/jpeg", JPEG);
    case "/html.jpg": return send(200, "image/jpeg", "<html><script>alert(1)</script></html>");
    case "/svg": return send(200, "image/svg+xml", "<svg/>");
    case "/big.jpg": return send(200, "image/jpeg", Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024 + 10)]));
    case "/missing.jpg": return send(404, "text/plain", "no");
    case "/redirect": return send(302, "text/plain", "", { location: "/a.jpg" });
    case "/redirect-private": return send(302, "text/plain", "", { location: "http://10.0.0.1/x.jpg" });
    case "/redirect-localhost": return send(302, "text/plain", "", { location: `http://localhost:${images.address().port}/a.jpg` });
    case "/loop": return send(302, "text/plain", "", { location: "/loop" });
    case "/slow.jpg":
      setTimeout(() => send(200, "image/jpeg", JPEG), 1500);
      return;
    default: return send(404, "text/plain", "no");
  }
});
await new Promise((r) => images.listen(0, "127.0.0.1", r));
const IMG = `http://127.0.0.1:${images.address().port}`;

const stub = await startStubSupabase({});
process.env.NP_INGEST_ALLOW_HOSTS = `127.0.0.1:${images.address().port}`;
delete process.env.VERCEL;

const ingest = await import("../api/_lib/image-ingest.js");
const sb = createClient(stub.url, "test-service-key");
const PUBLIC = (p) => `${stub.url}/storage/v1/object/public/article-images/${p}`;

console.log("\naddress guards:");
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "224.0.0.1"]) {
  check(`private: ${ip}`, ingest.isPrivateAddress(ip));
}
for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700::1111", "1.1.1.1"]) check(`public: ${ip}`, !ingest.isPrivateAddress(ip));

const reason = async (p) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e.reason || String(e);
  }
};
check("file: URL refused", (await reason(ingest.assertPublicUrl("file:///etc/passwd"))) === "invalid_url");
check("localhost refused", (await reason(ingest.assertPublicUrl("http://localhost/a.jpg"))) === "blocked_url");
check("loopback literal refused", (await reason(ingest.assertPublicUrl("http://127.0.0.1/a.jpg"))) === "blocked_url");
check("decimal loopback refused", (await reason(ingest.assertPublicUrl("http://2130706433/a.jpg"))) === "blocked_url");
check("IPv6 loopback refused", (await reason(ingest.assertPublicUrl("http://[::1]/a.jpg"))) === "blocked_url");
check("metadata address refused", (await reason(ingest.assertPublicUrl("http://169.254.169.254/latest"))) === "blocked_url");
check("credentials in URL refused", (await reason(ingest.assertPublicUrl("http://u:p@example.com/a.jpg"))) === "blocked_url");
{
  process.env.VERCEL = "1";
  check("test allow-list ignored on Vercel", (await reason(ingest.assertPublicUrl(`${IMG}/a.jpg`))) === "blocked_url");
  delete process.env.VERCEL;
}

console.log("\nfetchRemoteImage:");
{
  const r = await ingest.fetchRemoteImage(`${IMG}/a.jpg`);
  check("jpeg downloads", r.contentType === "image/jpeg" && r.buffer.equals(JPEG));
  check("redirect followed", (await ingest.fetchRemoteImage(`${IMG}/redirect`)).buffer.equals(JPEG));
  check("redirect to a private address refused", (await reason(ingest.fetchRemoteImage(`${IMG}/redirect-private`))) === "blocked_url");
  check("redirect to localhost refused", (await reason(ingest.fetchRemoteImage(`${IMG}/redirect-localhost`))) === "blocked_url");
  check("redirect loop stops", (await reason(ingest.fetchRemoteImage(`${IMG}/loop`))) === "download_failed");
  check("HTML claiming jpeg refused", (await reason(ingest.fetchRemoteImage(`${IMG}/html.jpg`))) === "unsupported_type");
  check("SVG refused", (await reason(ingest.fetchRemoteImage(`${IMG}/svg`))) === "unsupported_type");
  check("over 10 MB refused", (await reason(ingest.fetchRemoteImage(`${IMG}/big.jpg`))) === "too_large");
  check("404 → download_failed", (await reason(ingest.fetchRemoteImage(`${IMG}/missing.jpg`))) === "download_failed");
  check("timeout", (await reason(ingest.fetchRemoteImage(`${IMG}/slow.jpg`, { timeoutMs: 300 }))) === "timeout");
}

console.log("\nstoreImageBuffer:");
{
  const url1 = await ingest.storeImageBuffer(sb, JPEG, "image/jpeg");
  const path = ingest.contentPath(JPEG, "image/jpeg");
  check("content-addressed name", /^c\/[0-9a-f]{32}\.jpg$/.test(path), path);
  check("returns the public URL", url1 === PUBLIC(path), url1);
  const url2 = await ingest.storeImageBuffer(sb, JPEG, "image/jpeg");
  check("same bytes again: 'already exists' is success, same URL", url2 === url1);
  check("one object stored", Object.keys(stub.storage.objects).filter((k) => k.endsWith(path)).length === 1);
}

console.log("\ningestArticleMedia:");
{
  hits = {};
  const html =
    `<figure class="article-figure"><img src="${IMG}/a.jpg?width=1920" alt="A"></figure>` +
    `<p><img src='${IMG}/b.jpg'></p>` +
    `<img src="${IMG}/missing.jpg">` +
    `<img src="/media/c/already.jpg">`;
  const r = await ingest.ingestArticleMedia(sb, {
    attached: [
      { url: `${IMG}/a.jpg?width=800`, caption: "Cover. Photo: X", field: "coverImage" },
      { url: `${IMG}/p.png`, caption: "", field: "gallery[0]" },
      { url: `${IMG}/svg`, caption: "", field: "gallery[1]" },
      { url: "https://www.newsplatform.org/media/c/kept.jpg", caption: "Kept", field: "gallery[2]" },
    ],
    html,
    supabaseUrl: stub.url,
  });
  check("same photo (cover and body, different sizing) downloaded once", hits["/a.jpg"] === 1, hits);
  check("rows in input order, failures dropped", r.rows.map((x) => x.field).join() === "coverImage,gallery[0],gallery[2]", r.rows);
  check("cover row and body src are the same object", r.html.includes(`src="${r.rows[0].image_url}"`), r.html);
  check("our own /media URL reused without download", r.rows[2].image_url === PUBLIC("c/kept.jpg"), r.rows[2]);
  check("single-quoted body src re-hosted", !r.html.includes(`${IMG}/b.jpg`), r.html);
  check("failed body image keeps its URL", r.html.includes(`${IMG}/missing.jpg`));
  check("failed body image is a warning", r.warnings.some((w) => w.field === "content" && w.reason === "download_failed"), r.warnings);
  check("failed attached image is a failure", r.failures.length === 1 && r.failures[0].field === "gallery[1]" && r.failures[0].reason === "unsupported_type", r.failures);
  check("relative /media body image untouched", r.html.includes('src="/media/c/already.jpg"'));
}

console.log("\nparseImageFields:");
{
  const p = ingest.parseImageFields;
  check("images + coverImage → error", p({ images: [], coverImage: "x" }).error === "Use either images or coverImage/gallery, not both");
  check("more than 5 → error", p({ coverImage: "a", gallery: ["b", "c", "d", "e", "f"] }).error === "Maximum 5 images allowed (cover included)");
  check("legacy > 5 keeps the old message", p({ images: [1, 2, 3, 4, 5, 6] }).error === "Maximum 5 images allowed");
  const ok = p({ coverImage: { url: "https://x/a.jpg", caption: "Cap.", credit: "AFP" }, gallery: ["https://x/b.jpg"] });
  check("credit folded into caption", ok.cover?.caption === "Cap. Photo: AFP", ok.cover);
  check("bare URL strings accepted", ok.gallery?.[0]?.url === "https://x/b.jpg");
  check("coverImage null kept as null", p({ coverImage: null }).cover === null);
  check("bad gallery item → error", /gallery\[0\]/.test(p({ gallery: [42] }).error || ""));
  const legacy = p({ images: [{ url: "https://x/a.jpg", order: 3 }, { nope: 1 }] });
  check("legacy invalid entry skipped with a warning", legacy.legacy?.length === 1 && legacy.warnings.length === 1, legacy);
  check("legacy order kept", legacy.legacy?.[0]?.order === 3);
}

images.close();
await stub.close();
console.log("");
if (failures) {
  console.error(`test-image-ingest: ${failures} failure(s).\n`);
  process.exit(1);
}
console.log("test-image-ingest: all checks passed.\n");

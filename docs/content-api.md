# Content API v1: articles

Base URL `https://www.newsplatform.org`. Every call sends `X-API-Key: nk_...`
(or a Supabase `Authorization: Bearer` token). A key can read, edit and delete
only articles created by its own user; any other article answers **404**, with
the same body as an article that does not exist.

| Call | What it does |
|---|---|
| `POST /api/v1/content/articles` | Create (unchanged, plus `coverImage`, `gallery`, `excerpt`) |
| `POST /api/v1/content/articles/batch` | Create up to 10 |
| `GET /api/v1/content/articles/:id` | Read one (id or slug) |
| `PATCH /api/v1/content/articles/:id` | Edit |
| `DELETE /api/v1/content/articles/:id` | Unpublish, or delete with `?permanent=true` |
| `GET /api/v1/content/channels`, `/categories` | Your channels; the category tree |

Body format: [docs/article-format.md](article-format.md).

## Images

An **Image** is a URL string or `{ "url": "...", "caption": "...", "credit": "..." }`.

- `credit` is stored at the end of the caption as `… Photo: <credit>` (there is
  no credit column); responses return the joined caption.
- External URLs are downloaded and stored on NewsPlatform: http/https only,
  jpeg, png, gif or webp (by content type and by the file's bytes), at most
  10 MB, 8 s per download, up to 5 redirects. Private and local addresses are
  refused.
- A URL NewsPlatform returned earlier (`https://www.newsplatform.org/media/...`)
  is reused without a download, so you can send back the cover you got from a
  GET to change only its caption or order.
- The same photo is stored once. If you send a photo both as an image and in
  the body, it is one file, and the page shows it once (as the hero).
- Images in the body (`![caption](url)` or `<img src>`) are re-hosted too.
  A body image that cannot be downloaded keeps its original URL and is
  reported in `warnings`.
- `coverImage` plus `gallery` is at most 5 images.
- Every image URL in a response is permanent:
  `https://<host>/media/<path>`. It never expires.

Fields:

| Field | Meaning |
|---|---|
| `coverImage` | The hero, card and social image. |
| `gallery` | The other photos, in order. On the page they appear after the body (unless the same photo is in the body). |
| `images` | Legacy: the full list, first = cover. Cannot be combined with `coverImage` or `gallery` (400). |

## Create: POST /api/v1/content/articles

Request fields, unchanged: `title`, `content`, `contentFormat`
(`"markdown"` default, `"html"`, or anything else = auto-detect), `channelId`,
`categoryIds` (max 3, first is primary), `location`, `locationLat`,
`locationLng`, `published` (default `true`), `images`.
New: `coverImage`, `gallery`, `excerpt` (see PATCH).

Everything that worked before works the same way: same validation messages,
status codes, 409 duplicate rule (same title in the same channel within 24 h)
and response fields. A failed image never fails the request; it is listed in
`warnings`. The response adds `coverImage`, `gallery`, `excerpt`, `warnings`
and, for a draft, `previewUrl`.

```bash
curl -X POST https://www.newsplatform.org/api/v1/content/articles \
  -H "X-API-Key: $NP_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "title": "Spain'\''s first general strike in 14 years halts ports",
    "channelId": 4,
    "categoryIds": [12],
    "content": "Intro paragraph.\n\n> [!SUMMARY]\n> - One.\n> - Two.\n\n![Demonstrators in Madrid, 14 November 2012. Photo: Israel Hergón / Wikimedia Commons](https://commons.wikimedia.org/wiki/Special:FilePath/Example.jpg?width=1920)",
    "coverImage": {
      "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Marchers.jpg?width=1920",
      "caption": "Marchers at a housing demonstration, 3 October 2026.",
      "credit": "Nemo / Wikimedia Commons (CC BY-SA 4.0)"
    },
    "published": false
  }'
```

`201`:

```json
{
  "id": 815,
  "title": "Spain's first general strike in 14 years halts ports",
  "slug": "2026-11-12-spain-s-first-general-strike-in-14-years-halts-ports",
  "channelId": 4,
  "status": "draft",
  "published": false,
  "createdAt": "2026-11-12T12:23:00.000Z",
  "url": "/articles/815/2026-11-12-spain-s-first-general-strike-in-14-years-halts-ports",
  "images": [
    { "id": 2291, "article_id": 815, "order": 0,
      "image_url": "https://www.newsplatform.org/media/c/3fa9c1d2e4b5a6978811223344556677.jpg",
      "caption": "Marchers at a housing demonstration, 3 October 2026. Photo: Nemo / Wikimedia Commons (CC BY-SA 4.0)" }
  ],
  "categories": [12],
  "coverImage": {
    "url": "https://www.newsplatform.org/media/c/3fa9c1d2e4b5a6978811223344556677.jpg",
    "caption": "Marchers at a housing demonstration, 3 October 2026. Photo: Nemo / Wikimedia Commons (CC BY-SA 4.0)"
  },
  "gallery": [],
  "excerpt": "Intro paragraph.",
  "warnings": [],
  "previewUrl": "/articles/815/2026-11-12-spain-s-first-general-strike-in-14-years-halts-ports?preview=9f2c…"
}
```

## Read: GET /api/v1/content/articles/:id

`:id` is the numeric id or the slug. `200` returns the **article shape**:

```json
{
  "id": 814,
  "title": "…",
  "slug": "2026-11-12-…",
  "url": "/articles/814/2026-11-12-…",
  "channelId": 4,
  "channelName": "Business & Technology Global",
  "status": "published",
  "published": true,
  "createdAt": "2026-11-12T12:23:00.000Z",
  "viewCount": 2,
  "excerpt": "Unions put participation at 90% in ports; employers dispute it.",
  "excerptSource": "dek",
  "content": "<p class=\"article-dek\">Unions put …</p><aside class=\"callout callout-summary\">…",
  "contentFormat": "html",
  "coverImage": { "url": "https://www.newsplatform.org/media/c/3fa9….jpg", "caption": "… Photo: …" },
  "gallery": [],
  "images": [ { "id": 2291, "article_id": 814, "order": 0, "image_url": "https://www.newsplatform.org/media/c/3fa9….jpg", "caption": "…" } ],
  "categories": [ { "category_id": 12, "is_primary": true, "categories": { "id": 12, "name": "Business" } } ],
  "location": "Madrid, Spain",
  "locationLat": 40.4,
  "locationLng": -3.7,
  "previewUrl": null
}
```

- `content` is HTML. To edit it and send it back, use `"contentFormat": "html"`.
- `content` is stored sanitised (POST and PATCH alike, markdown or HTML): only
  the elements and attributes the reader renders are kept (everything in
  `docs/article-format.md`); scripts, event handlers, `javascript:` links and
  iframes other than YouTube and Vimeo are removed.
- `excerptSource` is `"dek"` when the article has a standfirst, else
  `"derived"` (the first paragraph outside callouts and figures, else the first
  summary bullet, at most 200 characters).
- `previewUrl` is set for an article that is not published: a link that
  shows the draft to anyone who has it. It stays valid until the server key
  changes. Published articles return `null`.

## Edit: PATCH /api/v1/content/articles/:id

Send only the fields to change. Omitted fields stay as they are.

| Field | Type | Effect |
|---|---|---|
| `title` | string, 1-300 chars | New title. The slug and URL do **not** change. |
| `regenerateSlug` | boolean | `true`: new slug from the title, dated with the article's creation date, `-2`, `-3`… on a collision. The response has `previousSlug`. Old links keep working (pages are found by id). |
| `content` | string | Replaces the body. |
| `contentFormat` | `"markdown"` (default), `"html"`, `"auto"` | How `content` is read. |
| `excerpt` | string up to 300 chars, or `null` | The standfirst, stored as the body's leading `<p class="article-dek">`. It is the card text, meta description and social description. When `content` is sent without `excerpt`, the existing standfirst is kept. `null` removes it. |
| `channelId` | number | Moves the article to another of your channels (404 `channel_not_found`, 403 `channel_forbidden`). Comments, views and categories move with it. |
| `categoryIds` | number[], max 3 | Replaces the categories; the first is primary. `[]` clears. |
| `location`, `locationLat`, `locationLng` | string / number, or `null` | `null` clears. |
| `published` | boolean | `true` publishes, `false` makes it a draft. |
| `coverImage` | Image or `null` | Sets the hero. The gallery is untouched. `null` removes the cover; if gallery photos remain, the first becomes the cover (`warnings` says `cover_promoted_from_gallery`). |
| `gallery` | Image[] | Replaces every photo except the cover. `[]` clears. The cover is untouched. |
| `images` | Image[] | Legacy full list, first = cover. Not with `coverImage`/`gallery`. |

**Images are all or nothing on PATCH.** Every new image is downloaded first;
if any of them fails, the answer is `422` and nothing is changed:

```json
{
  "error": "One or more images could not be downloaded; nothing was changed",
  "code": "image_failed",
  "details": [{ "field": "gallery[1]", "url": "https://…", "reason": "unsupported_type" }]
}
```

Reasons: `download_failed`, `timeout`, `too_large`, `unsupported_type`,
`invalid_url`, `blocked_url`, `upload_failed`. Body images stay lenient:
a body image that fails keeps its URL and appears in `warnings` with
`"field": "content"`.

```bash
curl -X PATCH https://www.newsplatform.org/api/v1/content/articles/814 \
  -H "X-API-Key: $NP_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "title": "Spain'\''s first general strike in 14 years halts ports and car plants",
    "excerpt": "Unions put participation at 90% in ports; employers dispute it.",
    "coverImage": {
      "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Marchers.jpg?width=1920",
      "caption": "Marchers at a housing demonstration, 3 October 2026.",
      "credit": "Nemo / Wikimedia Commons (CC BY-SA 4.0)"
    },
    "gallery": []
  }'
```

`200` returns the article shape (as GET) plus `previousSlug` (`null` unless
the slug changed) and `warnings`.

```bash
# Unpublish, publish, move, change only the cover caption
curl -X PATCH …/api/v1/content/articles/814 -H "X-API-Key: $NP_API_KEY" -H "Content-Type: application/json" -d '{"published": false}'
curl -X PATCH …/api/v1/content/articles/814 -H "X-API-Key: $NP_API_KEY" -H "Content-Type: application/json" -d '{"published": true}'
curl -X PATCH …/api/v1/content/articles/814 -H "X-API-Key: $NP_API_KEY" -H "Content-Type: application/json" -d '{"channelId": 5}'
curl -X PATCH …/api/v1/content/articles/814 -H "X-API-Key: $NP_API_KEY" -H "Content-Type: application/json" \
  -d '{"coverImage": {"url": "https://www.newsplatform.org/media/c/3fa9….jpg", "caption": "New caption.", "credit": "AFP"}}'
```

## Delete: DELETE /api/v1/content/articles/:id

The default is reversible: the article becomes a draft (the owner's
"Move to Drafts"), disappears from the site, feeds and search, and comes back
with `PATCH {"published": true}`.

```bash
curl -X DELETE https://www.newsplatform.org/api/v1/content/articles/814 -H "X-API-Key: $NP_API_KEY"
```
```json
{ "id": 814, "deleted": false, "unpublished": true, "status": "draft",
  "restore": "PATCH /api/v1/content/articles/814 {\"published\": true}" }
```

`?permanent=true` deletes the article with its comments, reactions, image
rows and categories. It cannot be undone.

```bash
curl -X DELETE "https://www.newsplatform.org/api/v1/content/articles/814?permanent=true" -H "X-API-Key: $NP_API_KEY"
```
```json
{ "id": 814, "deleted": true }
```

`?dryRun=true` (with or without `permanent`) changes nothing and says what
would happen: `{ "id": 814, "dryRun": true, "action": "unpublish", "currentStatus": "published", "restore": "…" }`.

Repeating a call is safe: unpublishing again is `200`; after a permanent
delete the article is `404`. Stored image files are never deleted.

## Errors

Every error body is `{ "error": "<message>", "code": "<code>" }`, plus extra
fields where noted.

| Status | `code` | When |
|---|---|---|
| 400 | `validation_failed` | A field is invalid, `No updatable fields provided`, `Use either images or coverImage/gallery, not both`, `Maximum 5 images allowed (cover included)` |
| 401 | `unauthorized` | No key, bad key, revoked or expired key |
| 403 | `channel_forbidden` | The channel is not yours |
| 404 | `not_found` | No such article, or not yours (same body) |
| 404 | `channel_not_found` | No such channel |
| 409 | `duplicate_title` | Same title in the same channel within 24 h (create only; also `message`, `existingArticleId`) |
| 422 | `image_failed` | PATCH: an image could not be downloaded (also `details`) |
| 500 | `server_error` | Unexpected failure |

## Draft previews

Drafts are not public. `GET /api/articles/:id` (what the article page uses)
answers 404 for an unpublished article unless the request is from its owner
or an admin, or carries `?preview=<token>` from `previewUrl`.

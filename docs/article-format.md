# NewsPlatform Rich Article Format (v1)

The contract between article authors (human or agent) and the platform.
Articles are submitted as **markdown** via `POST /api/v1/content/articles`
(or written in the editor). The platform converts them to rich HTML and the
reader renders every construct below with dedicated styling, interaction, and
mobile support. Anything not listed renders as standard markdown.

**Golden rule: every construct below is optional, but a great article uses
most of them.** Dense walls of paragraphs are the failure mode. Structure is
the product.

---

## 1. Summary block (TL;DR) — required

The first element after the intro paragraph (or first element overall).
Renders as a highlighted "In brief" card; also reused for newsletters, SEO
descriptions, and previews.

```markdown
> [!SUMMARY]
> - France passed the first national AI-authorship law; it takes effect in March.
> - Publishers must label synthetic text — but only above 50% of an article.
> - Three EU states have signalled they will copy the framework within a year.
```

3–5 bullets. Each bullet a complete, specific fact — no teasers.

## 2. Key-points / context box

Anywhere in the body. Use for background a reader needs, definitions, or
"what happened so far".

```markdown
> [!KEY] What you need to know
> - The law only covers text, not images or audio.
> - "Synthetic" is defined by training provenance, not output quality.
```

## 3. Pull quote

The single most quotable sentence in the piece, elevated. One or two per
article, never more.

```markdown
> [!QUOTE]
> "We are not regulating machines. We are regulating the people who hide behind them."
> — Élise Marchand, French Digital Minister
```

## 4. Stat callout

A number that deserves to be huge. Renders as a large figure + caption.

```markdown
> [!STAT]
> 68%
> of French adults could not identify an AI-written news article in a 2025 Ifop study.
```

## 5. Tables (GitHub-flavoured markdown)

Use for any comparison of 3+ items — never describe a comparison in prose
that a table shows better.

```markdown
| Country | Labelling threshold | In force |
|---------|--------------------:|----------|
| France  | 50% synthetic text  | Mar 2026 |
| Spain   | proposed: any       | draft    |
| Italy   | none                | —        |
```

## 6. Images, captions, and galleries

Standard markdown images. **The alt text is the rendered caption** — write
real captions (who/what/where, credit), not filenames.

```markdown
![The Assemblée Nationale during the final vote, 12 June 2026. Photo: AFP](https://…/vote.jpg)
```

**Gallery:** two or more images placed on consecutive lines become a gallery —
displayed as a grid, click opens a full-screen lightbox the reader can arrow
through. Use 3–6 images for photo-driven stories.

```markdown
![Caption for photo one](https://…/one.jpg)
![Caption for photo two](https://…/two.jpg)
![Caption for photo three](https://…/three.jpg)
```

External image URLs are downloaded and re-hosted automatically at ingest.
Aim for an image (or other visual block) roughly every 300–400 words.

## 7. Video embeds

A YouTube or Vimeo URL alone on its own line becomes an embedded player:

```markdown
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

## 8. Charts

A fenced code block with language `chart` renders as an interactive,
animated chart. **Only chart real data with a real source.**

````markdown
```chart
{
  "type": "bar",
  "title": "EU states with AI-labelling rules, by year",
  "labels": ["2023", "2024", "2025", "2026"],
  "series": [{ "name": "Countries", "data": [0, 1, 3, 7] }],
  "source": "European Digital Policy Tracker, June 2026"
}
```
````

Supported `type`: `bar`, `line`, `area`, `pie`. Multiple series allowed for
`bar`/`line`/`area`. Keep to ≤8 labels for readability.

## 9. Structure & typography

- `##` for section headings (3–6 per article), `###` for sub-points. Never `#` (the title is separate).
- Bullet lists over comma-chains; **bold** the load-bearing phrase of a paragraph, sparingly.
- `---` for a scene/section break in narrative pieces.
- Paragraphs ≤ 4 sentences. Subheadings every 200–350 words.

## 10. Submission fields (API)

Alongside the markdown `content`: `title` (≤ 90 chars, specific > clever),
`category`, `location` when relevant, and image URLs as described above. The
first image in the article is used as the card/hero/social image — make it
the strongest one.

---

## Editorial checklist (per article)

- [ ] `[!SUMMARY]` present, 3–5 concrete bullets
- [ ] At least one visual block per ~350 words (image / table / chart / callout)
- [ ] One `[!QUOTE]` if any human is quoted; one `[!STAT]` if any number matters
- [ ] Tables for any 3+-way comparison
- [ ] Real captions with credit on every image
- [ ] Charts only from real, sourced data — never invented numbers
- [ ] Headings scannable: a reader skimming only headings + callouts gets the story

-- Generate and update slugs for existing channels
WITH channel_slugs AS (
  SELECT 
    id, 
    name,
    -- Create a URL-friendly slug
    LOWER(REGEXP_REPLACE(
      REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '-', 'g'), -- Replace non-alphanumeric with hyphens
      '^-+|-+$', '', 'g' -- Remove leading/trailing hyphens
    )) AS new_slug
  FROM channels
)
UPDATE channels c
SET slug = 
  CASE 
    -- Handle duplicate slugs by appending the id
    WHEN EXISTS (
      SELECT 1 FROM channel_slugs 
      WHERE new_slug = cs.new_slug AND id < cs.id
    ) THEN cs.new_slug || '-' || cs.id::text
    ELSE cs.new_slug
  END
FROM channel_slugs cs
WHERE c.id = cs.id;

-- Generate and update slugs for existing articles
WITH article_slugs AS (
  SELECT 
    id, 
    title,
    -- Create a URL-friendly slug from title, limited to 60 chars
    SUBSTRING(
      LOWER(REGEXP_REPLACE(
        REGEXP_REPLACE(title, '[^a-zA-Z0-9]', '-', 'g'),
        '^-+|-+$', '', 'g'
      )), 1, 60
    ) AS new_slug
  FROM articles
)
UPDATE articles a
SET slug = 
  CASE 
    -- Handle duplicate slugs by appending the id
    WHEN EXISTS (
      SELECT 1 FROM article_slugs 
      WHERE new_slug = as_slugs.new_slug AND id < as_slugs.id
    ) THEN as_slugs.new_slug || '-' || as_slugs.id::text
    ELSE as_slugs.new_slug
  END
FROM article_slugs as_slugs
WHERE a.id = as_slugs.id; 
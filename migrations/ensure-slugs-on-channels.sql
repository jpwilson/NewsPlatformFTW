-- Check if 'slug' column exists in the channels table, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'channels' 
        AND column_name = 'slug'
    ) THEN
        -- Add slug column if it doesn't exist
        ALTER TABLE channels ADD COLUMN slug TEXT;
        
        -- Add a unique constraint
        ALTER TABLE channels ADD CONSTRAINT channels_slug_unique UNIQUE (slug);

        -- Generate slugs for existing channels
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
        
        RAISE NOTICE 'Added slug column to channels table and generated slugs for existing channels';
    ELSE
        RAISE NOTICE 'slug column already exists in channels table';
    END IF;
END $$; 
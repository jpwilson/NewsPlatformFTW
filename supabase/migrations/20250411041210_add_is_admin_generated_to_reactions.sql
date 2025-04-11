-- Add is_admin_generated column to reactions table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'reactions' AND column_name = 'is_admin_generated'
  ) THEN
    ALTER TABLE public.reactions
    ADD COLUMN is_admin_generated BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

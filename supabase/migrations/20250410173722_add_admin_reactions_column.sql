-- Add is_admin_generated column to reactions table
ALTER TABLE public.reactions ADD COLUMN is_admin_generated BOOLEAN DEFAULT FALSE;

-- Create index on is_admin_generated for faster filtering
CREATE INDEX idx_reactions_is_admin_generated ON public.reactions(is_admin_generated);

-- Add comments for documentation
COMMENT ON COLUMN public.reactions.is_admin_generated IS 'Flag indicating if this reaction was generated by an admin user to adjust counts';

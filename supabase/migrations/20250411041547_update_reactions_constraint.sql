-- Drop existing unique constraint on reactions table
ALTER TABLE public.reactions
DROP CONSTRAINT IF EXISTS unique_user_article_reaction;

-- Create a partial index to enforce uniqueness only for real users
CREATE UNIQUE INDEX unique_user_article_reaction
ON public.reactions (article_id, user_id)
WHERE user_id > 0;

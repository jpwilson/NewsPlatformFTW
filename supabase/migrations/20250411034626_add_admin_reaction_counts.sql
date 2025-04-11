-- Add admin reaction count columns to articles table
ALTER TABLE public.articles
ADD COLUMN admin_like_count integer NOT NULL DEFAULT 0,
ADD COLUMN admin_dislike_count integer NOT NULL DEFAULT 0;

-- Create or replace function to get total like count (user likes + admin likes)
CREATE OR REPLACE FUNCTION public.get_total_like_count(article_id integer)
RETURNS integer AS $$
DECLARE
  user_likes integer;
  admin_likes integer;
BEGIN
  -- Get user-generated likes
  SELECT COUNT(*) 
  INTO user_likes 
  FROM reactions 
  WHERE article_id = $1 
    AND is_like = true 
    AND user_id > 0;
    
  -- Get admin-set likes
  SELECT admin_like_count 
  INTO admin_likes 
  FROM articles 
  WHERE id = $1;
  
  -- Return the sum
  RETURN COALESCE(user_likes, 0) + COALESCE(admin_likes, 0);
END;
$$ LANGUAGE plpgsql;

-- Create or replace function to get total dislike count (user dislikes + admin dislikes)
CREATE OR REPLACE FUNCTION public.get_total_dislike_count(article_id integer)
RETURNS integer AS $$
DECLARE
  user_dislikes integer;
  admin_dislikes integer;
BEGIN
  -- Get user-generated dislikes
  SELECT COUNT(*) 
  INTO user_dislikes 
  FROM reactions 
  WHERE article_id = $1 
    AND is_like = false 
    AND user_id > 0;
    
  -- Get admin-set dislikes
  SELECT admin_dislike_count 
  INTO admin_dislikes 
  FROM articles 
  WHERE id = $1;
  
  -- Return the sum
  RETURN COALESCE(user_dislikes, 0) + COALESCE(admin_dislikes, 0);
END;
$$ LANGUAGE plpgsql;

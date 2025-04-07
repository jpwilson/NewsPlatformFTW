-- Add the intermediate 'School Subjects' category under 'Education' (ID 12)
WITH new_parent AS (
  INSERT INTO public.categories (name, parent_id)
  VALUES ('School Subjects', 12)
  RETURNING id
)
-- Add specific subjects under the newly created 'School Subjects' category
INSERT INTO public.categories (name, parent_id)
SELECT name, (SELECT id FROM new_parent)
FROM (VALUES
  ('English'),
  ('English Literature'),
  ('Mathematics'),
  ('Physics'),
  ('Chemistry'),
  ('Biology'),
  ('History'),
  ('Geography'),
  ('Art'),
  ('Music'),
  ('Physical Education'),
  ('Computer Science'),
  ('Foreign Languages'),
  ('Social Studies'),
  ('Economics')
) AS subjects(name);

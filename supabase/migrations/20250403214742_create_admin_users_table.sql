CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.admin_users IS 'Stores the user IDs of administrators.';

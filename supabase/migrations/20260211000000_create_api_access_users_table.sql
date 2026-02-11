-- API Access Users: users granted permission to generate API keys
-- Separate from admin_users (which grants full admin dashboard access)
CREATE TABLE public.api_access_users (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now() NOT NULL
);

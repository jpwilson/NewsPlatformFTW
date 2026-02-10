-- Create api_keys table for programmatic Content API access
CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "key_prefix" text NOT NULL,
    "key_hash" text NOT NULL,
    "user_id" integer NOT NULL,
    "name" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_used_at" timestamp with time zone,
    "is_revoked" boolean DEFAULT false NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "public"."users"("id") ON DELETE CASCADE
);

-- Index for fast key lookup by hash (primary query path)
CREATE INDEX "api_keys_key_hash_idx" ON "public"."api_keys" USING btree ("key_hash");

-- Index for listing a user's keys
CREATE INDEX "api_keys_user_id_idx" ON "public"."api_keys" USING btree ("user_id");

-- Grant permissions
GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";

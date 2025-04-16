-- Add admin_subscriber_count column to channels table if it doesn't exist
ALTER TABLE "public"."channels" 
ADD COLUMN IF NOT EXISTS "admin_subscriber_count" INTEGER DEFAULT 0;

-- Add comment explaining the purpose of this column
COMMENT ON COLUMN "public"."channels"."admin_subscriber_count" IS 'Number of additional subscribers added by admin for display purposes only';

import { createHash, randomBytes } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generate a new API key and its hash.
 * Key format: nk_ + 64 hex chars (32 random bytes)
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const rawBytes = randomBytes(32);
  const key = `nk_${rawBytes.toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 11); // "nk_" + first 8 hex chars
  return { key, hash, prefix };
}

/** Hash an API key for lookup/comparison */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Authenticate a request via X-API-Key header.
 * Returns the userId tied to the key, or an error.
 */
export async function authenticateApiKey(
  apiKeyHeader: string,
  supabase: SupabaseClient
): Promise<{ userId?: number; error?: string }> {
  if (!apiKeyHeader || !apiKeyHeader.startsWith("nk_")) {
    return { error: "Invalid API key format" };
  }

  const keyHash = hashApiKey(apiKeyHeader);

  const { data: apiKeyRow, error } = await supabase
    .from("api_keys")
    .select("id, user_id, is_revoked, expires_at")
    .eq("key_hash", keyHash)
    .single();

  if (error || !apiKeyRow) {
    return { error: "Invalid API key" };
  }

  if (apiKeyRow.is_revoked) {
    return { error: "API key has been revoked" };
  }

  if (apiKeyRow.expires_at && new Date(apiKeyRow.expires_at) < new Date()) {
    return { error: "API key has expired" };
  }

  // Update last_used_at (fire-and-forget)
  supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyRow.id)
    .then(() => {});

  return { userId: apiKeyRow.user_id };
}

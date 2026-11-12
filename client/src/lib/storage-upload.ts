/**
 * Browser uploads to the public `article-images` bucket.
 *
 * Every object goes into the uploader's own folder,
 * `<supabase auth user id>/<timestamp>_<name>`, to match the storage rule
 * `(storage.foldername(name))[1] = auth.uid()::text`. Only jpg/jpeg/png/gif/webp
 * are accepted, and a content type is sent only when it is one of those image
 * types. supabase-js sends a Blob as multipart, where the part's type is the
 * Blob's own type, so a file whose type is anything else (empty,
 * application/octet-stream, or something hostile) is re-wrapped with the type
 * its allowed extension implies. Returns the permanent public URL.
 */

import { supabase } from "@/lib/supabase";

const BUCKET = "article-images";
const EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/** Lower-case extension of `name` when it is an allowed image type, else null. */
export function allowedImageExtension(name: string): string | null {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return EXTENSIONS.includes(ext) && name.includes(".") ? ext : null;
}

/** `<uid>/<timestamp>_<safe base name>.<ext>`; throws for a disallowed extension. */
export function userObjectPath(uid: string, fileName: string, now = Date.now()): string {
  const ext = allowedImageExtension(fileName);
  if (!ext) throw new Error("Please choose a JPG, PNG, GIF or WebP image.");
  const base = fileName
    .slice(0, fileName.length - ext.length - 1)
    .replace(/[^a-zA-Z0-9-]/g, "_")
    .slice(0, 80) || "image";
  return `${uid}/${now}_${base}.${ext}`;
}

/**
 * Upload `file` as `fileName` into the signed-in user's folder.
 * @param fileName the name used for the extension and the readable part of the path
 */
export async function uploadUserImage(file: Blob, fileName: string): Promise<string> {
  if (!supabase?.storage) throw new Error("Storage service is not available");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error("You need to be signed in to upload images.");

  const path = userObjectPath(uid, fileName);
  const contentType = CONTENT_TYPES.includes(file.type) ? file.type : TYPE_BY_EXT[path.split(".").pop()!];
  const body = file.type === contentType ? file : new Blob([file], { type: contentType });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { cacheControl: "31536000", contentType });
  if (error || !data) throw error || new Error("Upload failed");
  // The bucket is public: store the permanent public URL (signed URLs expired after a year).
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return publicUrl;
}

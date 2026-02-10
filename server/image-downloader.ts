import { SupabaseClient } from "@supabase/supabase-js";

interface ImageInput {
  url: string;
  caption?: string;
  order?: number;
}

interface DownloadedImage {
  imageUrl: string;
  originalUrl: string;
  caption: string;
  order: number;
}

const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const DOWNLOAD_TIMEOUT = 30000; // 30 seconds

/**
 * Download an image from an external URL and upload it to Supabase Storage.
 * Returns the stored image URL and metadata, or null on failure.
 */
export async function downloadAndUploadImage(
  imageInput: ImageInput,
  articleId: number,
  index: number,
  supabase: SupabaseClient
): Promise<DownloadedImage | null> {
  const { url, caption = "", order } = imageInput;

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.error(`Invalid image URL protocol: ${parsedUrl.protocol}`);
      return null;
    }

    // Download with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NewsPlatform-ContentAPI/1.0" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Failed to download image from ${url}: ${response.status}`);
      return null;
    }

    // Validate content type
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    if (!VALID_IMAGE_TYPES.includes(contentType)) {
      console.error(`Invalid image content type: ${contentType} from ${url}`);
      return null;
    }

    // Read image data
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length > MAX_IMAGE_SIZE) {
      console.error(`Image too large (${buffer.length} bytes) from ${url}`);
      return null;
    }

    // Determine extension and generate filename
    const ext = EXT_MAP[contentType] || "jpg";
    const timestamp = Date.now();
    const filename = `api_${articleId}_${timestamp}_${index}.${ext}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("article-images")
      .upload(filename, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError || !uploadData) {
      console.error("Error uploading image to storage:", uploadError);
      return null;
    }

    // Get signed URL (valid for 1 year)
    const { data: urlData } = await supabase.storage
      .from("article-images")
      .createSignedUrl(uploadData.path, 365 * 24 * 60 * 60);

    const imageUrl = urlData?.signedUrl || supabase.storage
      .from("article-images")
      .getPublicUrl(uploadData.path).data.publicUrl;

    return {
      imageUrl,
      originalUrl: url,
      caption,
      order: order ?? index,
    };
  } catch (error) {
    console.error(`Error processing image from ${url}:`, error);
    return null;
  }
}

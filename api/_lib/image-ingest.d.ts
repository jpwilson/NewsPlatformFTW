/** Types for image-ingest.js. */
export declare const MAX_IMAGE_BYTES: number;
export declare const FETCH_TIMEOUT_MS: number;
export declare const MAX_REDIRECTS: number;
export type IngestReason =
  | "invalid_url"
  | "blocked_url"
  | "download_failed"
  | "timeout"
  | "too_large"
  | "unsupported_type"
  | "upload_failed"
  | "too_many_images";
export interface IngestIssue { field: string; url: string; reason: IngestReason | string }
export declare function isPrivateAddress(ip: string): boolean;
export declare function assertPublicUrl(rawUrl: string): Promise<URL>;
export declare function sniffImageType(bytes: Uint8Array): string | null;
export declare function fetchRemoteImage(
  url: string,
  options?: { timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<{ buffer: Buffer; contentType: string; finalUrl: string }>;
export declare function contentPath(buffer: Uint8Array, contentType: string): string;
export declare function storeImageBuffer(sb: any, buffer: Uint8Array, contentType: string): Promise<string>;
export declare function normalizeImageInput(input: unknown): { url: string; caption: string } | null;
export declare function bodyImageUrls(html: string): string[];
export declare function rewriteBodySrc(html: string, map: Map<string, string>): string;
export declare function ingestArticleMedia(
  sb: any,
  input: {
    attached?: { url: string; caption: string; field: string }[];
    html?: string;
    supabaseUrl: string;
    rehostBody?: boolean;
    fetchImpl?: typeof fetch;
  }
): Promise<{
  rows: { image_url: string; caption: string; field: string }[];
  html: string;
  warnings: IngestIssue[];
  failures: IngestIssue[];
}>;
export interface ParsedImage { url: string; caption: string; field: string; order?: number }
export declare function parseImageFields(body: unknown):
  | { error: string }
  | {
      legacy?: ParsedImage[];
      cover?: ParsedImage | null;
      gallery?: ParsedImage[];
      warnings: IngestIssue[];
      error?: undefined;
    };

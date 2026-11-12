/** Types for article-media.js (plain JS so Node functions and the client can import it). */

export declare const BUCKET: "article-images";
export declare const LAST_EDITED_IS_TRUSTWORTHY: boolean;

export declare function isSafeStoragePath(path: unknown): boolean;
export declare function storagePathFromUrl(url: unknown): string | null;
export declare function toMediaUrl(url: string, origin?: string): string;
export declare function toStoredUrl(url: string, supabaseUrl: string | null | undefined): string;
export declare function publicStorageUrl(path: string, supabaseUrl: string): string;
export declare function rewriteStorageUrls(text: string, origin?: string): string;
export declare function storeMediaUrls(text: string, supabaseUrl: string | null | undefined): string;

export declare function imageKey(url: unknown): string;
export declare function splitCaptionCredit(text: unknown): { caption: string; credit: string };
export declare function joinCaptionCredit(
  caption: string | null | undefined,
  credit: string | null | undefined
): string;

export declare function extractDek(html: string): { dek: string | null; html: string };
export declare function setDek(html: string, dek: string | null | undefined): string;
export declare function deriveExcerpt(html: string, max?: number): string;
export declare function readMinutes(html: string): number;

export interface ArticleImageRow {
  id?: number | string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  caption?: string | null;
  order?: number | string | null;
  [key: string]: unknown;
}

export declare function sortImages<T extends ArticleImageRow>(images: T[] | null | undefined): T[];

export interface Slide {
  /** /media/… (or origin + /media/…) for our images; external URLs unchanged. Plain text, not HTML-escaped. */
  src: string;
  /** Caption without the credit. */
  caption: string;
  /** Text after "Photo:" in the stored caption, or "". */
  credit: string;
  alt: string;
  origin: "hero" | "body" | "gallery";
}

export interface ComposedArticleMedia {
  hero: Slide | null;
  heroSource: "cover" | "body-promoted" | null;
  /** Text of a leading <p class="article-dek">, removed from bodyHtml. */
  dek: string | null;
  /** Body minus dek, minus duplicate/promoted figures; storage URLs → /media. */
  bodyHtml: string;
  /** Attached non-cover images that are not in the body. */
  gallery: Slide[];
  /** Lightbox order: hero, body images in document order, gallery. */
  slides: Slide[];
  dedupe: "exact" | "mirror" | "none";
}

export declare function composeArticleMedia(input?: {
  images?: ArticleImageRow[] | null;
  /** Must already be sanitised. */
  html?: string | null;
  origin?: string;
}): ComposedArticleMedia;

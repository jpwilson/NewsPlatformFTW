/** Types for article-service.js. */
export declare function isNumericId(idOrSlug: unknown): boolean;
export declare function findArticle(sb: any, idOrSlug: string | number, columns?: string): Promise<any | null>;
export declare function slugBase(title: string): string;
export declare function slugDate(date: Date): string;
export declare function uniqueSlug(sb: any, title: string, date: Date, excludeId?: number | string): Promise<string>;
export type SlugMode = "keep" | "regenerate" | "if-title-changed";
export declare function updateArticleFields(
  sb: any,
  article: any,
  fields: Record<string, unknown>,
  options?: { slugMode?: SlugMode }
): Promise<{ article: any; previousSlug: string | null }>;
export declare function replaceArticleImages(
  sb: any,
  articleId: number,
  rows: { image_url: string; caption?: string | null; order?: number }[],
  options?: { renumber?: boolean }
): Promise<any[]>;
export declare function replaceArticleCategories(sb: any, articleId: number, categoryIds: number[]): Promise<void>;
export declare function deleteArticle(
  sb: any,
  article: { id: number },
  options?: { permanent?: boolean }
): Promise<{ id: number; deleted: boolean; unpublished?: boolean; status?: string }>;

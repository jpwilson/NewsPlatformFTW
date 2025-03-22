import { Article } from "@shared/schema";

/**
 * Extended Article type that accommodates both camelCase and snake_case properties
 * from different data sources (database, API, etc.)
 */
export type ArticleWithSnakeCase = Article & {
  // Snake case alternatives
  created_at?: string | Date;
  channel_id?: number;
  user_id?: number;
  published_at?: string | Date;
  view_count?: number;
  comment_count?: number;
  like_count?: number;
  last_edited?: string | Date;
  
  // Additional fields from API responses
  published?: boolean;
  status?: "published" | "draft";
  categoryId?: number;
  locationId?: number;
  likes?: number;
  dislikes?: number;
  viewCount?: number;
  commentCount?: number;
  likeCount?: number;
  userReaction?: boolean | null;
  slug?: string;
  _count?: {
    comments?: number;
    likes?: number;
  };
  channel?: { 
    id: number; 
    name: string;
    user_id?: number;
    userId?: number;
    slug?: string;
  };
}; 
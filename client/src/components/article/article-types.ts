import { Article } from "@shared/schema";

// Define a more flexible type for article that accommodates both camelCase and snake_case
export type ArticleWithSnakeCase = Article & {
  created_at?: string | Date;
  channel_id?: number;
  user_id?: number;
  title?: string;
  content?: string;
  channel?: { id: number; name: string; slug?: string; profileImage?: string | null; profile_image?: string | null };
  createdAt?: string | Date;
  lastEdited?: string | Date;
  last_edited?: string | Date;
  status?: string;
  published?: boolean;
  view_count?: number;
  viewCount?: number;
  commentCount?: number;
  comment_count?: number;
  likes?: number;
  dislikes?: number;
  userReaction?: boolean | null;
  category?: string;
  categoryId?: number;
  categoryIds?: number[];
  location?: string;
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
  slug?: string;
  categories?: Array<{ id: number; name: string; isPrimary?: boolean }>;
  _count?: {
    comments?: number;
  };
  images?: Array<{ imageUrl: string; caption?: string }>;
};

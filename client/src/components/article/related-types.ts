/** Shape of GET /api/articles/:id/related?limit=6 (Plan B, section D1 "Data for the end zone"). */
export interface RelatedCard {
  id: number;
  slug: string | null;
  title: string;
  category: string | null;
  createdAt: string | null;
  channel: { id: number; name: string; slug: string | null; profileImage: string | null } | null;
  image: { url: string; caption: string } | null;
}

export interface RelatedArticles {
  /** The previous story in the same channel, else the first of `more`. */
  next: RelatedCard | null;
  sameChannel: RelatedCard[];
  /** Same category from other channels, topped up with the latest. */
  more: RelatedCard[];
}

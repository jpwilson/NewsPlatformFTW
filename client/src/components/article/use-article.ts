import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Channel } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePostHog } from "@/lib/posthog";
import { startReadTracking, trafficContext } from "@/lib/track";
import type { ArticleWithSnakeCase } from "./article-types";
import type { RelatedArticles, RelatedCard } from "./related-types";

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

/**
 * The article, fetched with the reader's session (so owners and admins can open drafts)
 * and with the page's `?preview=<token>` forwarded. A missing article resolves to null.
 * The cache key stays `/api/articles/:id` so existing invalidations keep working.
 */
export async function fetchArticle(
  articleId: string,
  preview?: string | null
): Promise<ArticleWithSnakeCase | null> {
  const url = `/api/articles/${articleId}${preview ? `?preview=${encodeURIComponent(preview)}` : ""}`;
  const res = await fetch(url, { headers: await authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch article (${res.status})`);
  return res.json();
}

export function useArticle(articleId: string) {
  return useQuery<ArticleWithSnakeCase | null>({
    queryKey: [`/api/articles/${articleId}`],
    enabled: !!articleId,
    queryFn: () =>
      fetchArticle(
        articleId,
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("preview")
          : null
      ),
  });
}

/** Records one view per article per page visit (the old effect fired on every refetch). */
export function useRecordView(article: ArticleWithSnakeCase | null | undefined) {
  const recorded = useRef<number | null>(null);
  const { trackEvent } = usePostHog();
  const [viewCount, setViewCount] = useState<number | null>(null);

  useEffect(() => {
    if (!article?.id || !article.slug || recorded.current === article.id) return;
    recorded.current = article.id;

    trackEvent("article_viewed", {
      article_id: article.id,
      article_slug: article.slug,
      article_title: article.title,
      channel_id: article.channel_id || article.channelId,
      channel_name: article.channel?.name,
      category: article.category,
    });

    // Where the reader came from (once per landing) feeds the Analytics tab;
    // empty when the reader opted out (Do Not Track / GPC).
    const ctx = trafficContext();
    const body = ctx
      ? { ...ctx, path: window.location.pathname, channelId: article.channel_id || article.channelId || null }
      : { dnt: true };
    apiRequest("POST", `/api/articles/${article.slug}/view`, body)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.view_count === "number") setViewCount(data.view_count);
        if (data.counted || data.shouldInvalidateFeeds) {
          queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
          const channelId = article.channelId || article.channel_id;
          if (channelId) {
            queryClient.invalidateQueries({ queryKey: [`/api/channels/${channelId}/articles`] });
          }
        }
      })
      .catch(() => {
        /* a failed view count must never disturb the reader */
      });
  }, [article, trackEvent]);

  // Read-through (engaged time, scroll depth): one beacon per article visit.
  const articleId = article?.id;
  useEffect(() => {
    if (!articleId) return;
    return startReadTracking(articleId, window.location.pathname);
  }, [articleId]);

  return viewCount;
}

export interface ReactionState {
  likes: number;
  dislikes: number;
  userReaction: boolean | null;
}

/** Like / dislike with optimistic-free local state seeded from the article. */
export function useReaction(
  article: ArticleWithSnakeCase | null | undefined,
  onNeedAuth: () => void
) {
  const { user } = useAuth();
  const { toast } = useToast();
  const seed = useMemo<ReactionState>(
    () => ({
      likes: article?.likes || 0,
      dislikes: article?.dislikes || 0,
      userReaction: article?.userReaction ?? null,
    }),
    [article?.likes, article?.dislikes, article?.userReaction]
  );
  const [state, setState] = useState<ReactionState>(seed);
  const [pending, setPending] = useState(false);
  useEffect(() => setState(seed), [seed]);

  const react = useCallback(
    async (isLike: boolean) => {
      if (!user) return onNeedAuth();
      if (!article?.slug || pending) return;
      setPending(true);
      try {
        const res = await fetch(`/api/articles/${article.slug}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ isLike }),
        });
        if (!res.ok) throw new Error("Failed to process reaction");
        const data = await res.json();
        setState({
          likes: data.like_count ?? 0,
          dislikes: data.dislike_count ?? 0,
          userReaction: data.user_reaction ?? null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      } catch {
        toast({
          title: "Something went wrong",
          description: "Your reaction was not saved. Please try again.",
          variant: "destructive",
        });
      } finally {
        setPending(false);
      }
    },
    [user, article?.slug, pending, onNeedAuth, toast]
  );

  return { ...state, pending, react };
}

/** Follow (subscribe to) the article's channel. */
export function useChannelFollow(
  channel: { id: number; name: string } | null | undefined,
  onNeedAuth: () => void
) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { trackEvent } = usePostHog();
  const { data: subscriptions } = useQuery<Channel[]>({
    queryKey: ["/api/user/subscriptions"],
    enabled: !!user,
  });
  const following = !!channel && !!subscriptions?.some((s) => Number(s.id) === Number(channel.id));

  const mutation = useMutation({
    mutationFn: async (follow: boolean) => {
      await apiRequest(follow ? "POST" : "DELETE", `/api/channels/${channel!.id}/subscribe`);
      return follow;
    },
    onSuccess: (follow) => {
      if (follow) {
        trackEvent("channel_subscribed", { channel_id: channel!.id, channel_name: channel!.name });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
      toast({
        title: follow ? `Following ${channel!.name}` : `Unfollowed ${channel!.name}`,
        description: follow ? "New stories will show up in your feed." : undefined,
      });
    },
    onError: () =>
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      }),
  });

  const toggle = useCallback(() => {
    if (!channel) return;
    if (!user) return onNeedAuth();
    mutation.mutate(!following);
  }, [channel, user, following, mutation, onNeedAuth]);

  return { following, pending: mutation.isPending, toggle };
}

/**
 * Cards for the end of the article: GET /api/articles/:id/related (Builder A). Until that
 * endpoint exists (404), fall back to today's channel list (same-channel cards only).
 */
export function useRelated(article: ArticleWithSnakeCase | null | undefined) {
  const id = article?.id;
  const channelId = article?.channel_id || article?.channelId;

  const related = useQuery<RelatedArticles | null>({
    queryKey: [`/api/articles/${id}/related?limit=6`],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/articles/${id}/related?limit=6`);
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) return null;
      return res.json();
    },
  });

  const needFallback = !!id && related.isFetched && !related.data;
  const fallback = useQuery<any[]>({
    queryKey: [`/api/channels/${channelId}/articles`],
    enabled: needFallback && !!channelId,
  });

  return useMemo<RelatedArticles | null>(() => {
    if (related.data) return related.data;
    if (!needFallback || !article) return null;
    const toCard = (a: any): RelatedCard => ({
      id: a.id,
      slug: a.slug ?? null,
      title: a.title,
      category:
        a.categories?.find((c: any) => c.isPrimary)?.name ||
        a.categories?.[0]?.name ||
        a.category ||
        null,
      createdAt: a.createdAt || a.created_at || a.published_at || null,
      channel: a.channel
        ? {
            id: a.channel.id,
            name: a.channel.name,
            slug: a.channel.slug ?? null,
            profileImage: a.channel.profileImage || a.channel.profile_image || null,
          }
        : article.channel
          ? {
              id: article.channel.id,
              name: article.channel.name,
              slug: article.channel.slug ?? null,
              profileImage: article.channel.profileImage || article.channel.profile_image || null,
            }
          : null,
      image: a.images?.[0]?.imageUrl ? { url: a.images[0].imageUrl, caption: a.images[0].caption || "" } : null,
    });
    const notThis = (a: any) => a && a.id !== article.id && (a.status ?? "published") !== "draft";
    const sameChannel = (fallback.data || []).filter(notThis).slice(0, 4).map(toCard);
    // Cross-channel stories need the related endpoint; the full feed is too heavy to fetch here.
    const more: RelatedCard[] = [];
    if (!sameChannel.length) return null;
    // "Read next": the previous story in this channel, else the first of `more`.
    const created = new Date(article.created_at || article.createdAt || 0).getTime();
    const older = sameChannel.find((c) => c.createdAt && new Date(c.createdAt).getTime() < created);
    const next = older || sameChannel[0] || more[0] || null;
    return {
      next,
      sameChannel: sameChannel.filter((c) => c.id !== next?.id).slice(0, 3),
      more: more.filter((c) => c.id !== next?.id),
    };
  }, [related.data, needFallback, article, fallback.data]);
}

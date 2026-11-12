import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { Check, Plus, Share, ThumbsDown, ThumbsUp } from "lucide-react";
import { CommentSection } from "@/components/comment-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLightbox, type LightboxSlide } from "@/components/lightbox/lightbox-context";
import { queryClient } from "@/lib/queryClient";
import { createSlugUrl } from "@/lib/slug-utils";
import { cn } from "@/lib/utils";
import { toMediaUrl } from "@shared/article-media";
import { ShareMenu } from "./share-menu";
import { ReadNextCard, StoryGrid } from "./related-cards";
import { fetchArticle } from "./use-article";
import type { RelatedArticles } from "./related-types";

interface EndChannel {
  id: number;
  name: string;
  slug?: string | null;
  profileImage?: string | null;
  description?: string | null;
  subscriberCount?: number | null;
}

interface Props {
  articleId: number;
  title: string;
  shareText?: string;
  isDraft: boolean;
  showImages: boolean;
  gallery: LightboxSlide[];
  channel: EndChannel | null;
  related: RelatedArticles | null;
  reaction: {
    likes: number;
    dislikes: number;
    userReaction: boolean | null;
    pending: boolean;
    react: (isLike: boolean) => void;
  };
  follow: { following: boolean; pending: boolean; toggle: () => void };
  onCommentsLoaded: (count: number) => void;
}

const pill =
  "inline-flex h-10 items-center gap-2 rounded-full border border-[hsl(var(--edition-border))] bg-background px-4 text-[14px] font-semibold text-[hsl(var(--edition-text))] transition-colors hover:border-[hsl(var(--edition-border-strong))] hover:bg-[hsl(var(--edition-panel))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))] disabled:opacity-60";

/**
 * Everything after the last paragraph, in reading order: end mark, photos, reactions,
 * channel card, Read next, More from this channel, comments, More top stories.
 */
export function ArticleEnd(p: Props) {
  const endMark = useRef<HTMLDivElement>(null);
  const next = p.related?.next ?? null;

  // Fetch the Read next story as the reader reaches the end, so the tap opens it instantly.
  useEffect(() => {
    const el = endMark.current;
    if (!el || !next) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          queryClient.prefetchQuery({
            queryKey: [`/api/articles/${next.id}`],
            queryFn: () => fetchArticle(String(next.id)),
          });
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [next]);

  const channelUrl = p.channel
    ? createSlugUrl("/channels/", p.channel.slug || "", String(p.channel.id))
    : null;

  return (
    <div className="pb-4">
      <div className="mx-auto max-w-[720px] px-4">
        <div
          ref={endMark}
          aria-hidden
          className="mt-10 h-[3px] w-12 rounded-full bg-[hsl(var(--edition-accent))]"
        />

        {p.showImages && p.gallery.length > 0 && <PhotoGrid gallery={p.gallery} />}

        {!p.isDraft && (
          <section
            aria-label="Reactions"
            className="mt-10 flex flex-col gap-4 rounded-2xl bg-[hsl(var(--edition-panel))] p-5 ring-1 ring-[hsl(var(--edition-border-hair))] sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <p className="font-display text-[20px] font-bold text-[hsl(var(--edition-text))]">
              Was this worth your time?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn(
                  pill,
                  p.reaction.userReaction === true &&
                    "border-[hsl(var(--edition-accent))] text-[hsl(var(--edition-accent))]"
                )}
                aria-pressed={p.reaction.userReaction === true}
                disabled={p.reaction.pending}
                onClick={() => p.reaction.react(true)}
              >
                <ThumbsUp className={cn("h-4 w-4", p.reaction.userReaction === true && "fill-current")} />
                Yes
                {p.reaction.likes > 0 && (
                  <span className="tabular-nums text-[hsl(var(--edition-text-muted))]">{p.reaction.likes}</span>
                )}
              </button>
              <button
                type="button"
                className={cn(
                  pill,
                  p.reaction.userReaction === false &&
                    "border-[hsl(var(--edition-negative))] text-[hsl(var(--edition-negative))]"
                )}
                aria-pressed={p.reaction.userReaction === false}
                disabled={p.reaction.pending}
                onClick={() => p.reaction.react(false)}
              >
                <ThumbsDown className={cn("h-4 w-4", p.reaction.userReaction === false && "fill-current")} />
                No
              </button>
              <ShareMenu
                title={p.title}
                text={p.shareText}
                align="end"
                trigger={
                  <button type="button" className={pill}>
                    <Share className="h-4 w-4" />
                    Share
                  </button>
                }
              />
            </div>
          </section>
        )}

        {p.channel && channelUrl && (
          <section
            aria-label="About the channel"
            className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl p-5 ring-1 ring-[hsl(var(--edition-border))] sm:p-6"
          >
            <Link href={channelUrl} className="shrink-0 rounded-full" tabIndex={-1} aria-hidden>
              <Avatar className="h-14 w-14 ring-1 ring-[hsl(var(--edition-border))]">
                <AvatarImage src={p.channel.profileImage ? toMediaUrl(p.channel.profileImage) : undefined} alt="" />
                <AvatarFallback className="font-semibold">
                  {p.channel.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
            <div className="min-w-0 flex-1 basis-[calc(100%-4.5rem)] sm:basis-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--edition-text-muted))]">
                Published by
              </p>
              <Link
                href={channelUrl}
                className="mt-0.5 block font-display text-[19px] font-bold leading-tight text-[hsl(var(--edition-text))] hover:underline"
              >
                {p.channel.name}
              </Link>
              {p.channel.description && (
                <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-[hsl(var(--edition-text-secondary))]">
                  {p.channel.description}
                </p>
              )}
              {typeof p.channel.subscriberCount === "number" && p.channel.subscriberCount > 0 && (
                <p className="mt-1 text-[12.5px] text-[hsl(var(--edition-text-muted))]">
                  {p.channel.subscriberCount.toLocaleString()} followers
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={p.follow.toggle}
              disabled={p.follow.pending}
              aria-pressed={p.follow.following}
              className={cn(
                "ml-[4.5rem] inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors sm:ml-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))] focus-visible:ring-offset-2 disabled:opacity-60",
                p.follow.following
                  ? "bg-[hsl(var(--edition-panel))] text-[hsl(var(--edition-text-secondary))] ring-1 ring-[hsl(var(--edition-border))]"
                  : "bg-[hsl(var(--edition-text))] text-[hsl(var(--edition-bg))] hover:opacity-90"
              )}
            >
              {p.follow.following ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {p.follow.following ? "Following" : "Follow"}
            </button>
          </section>
        )}
      </div>

      {!p.isDraft && (
        <div className="mx-auto max-w-[1040px] px-4 lg:px-6">
          {next && (
            <div className="mt-12">
              <ReadNextCard card={next} showImages={p.showImages} />
            </div>
          )}
          <StoryGrid
            title={`More from ${p.channel?.name || "this channel"}`}
            cards={p.related?.sameChannel ?? []}
            showImages={p.showImages}
          />
        </div>
      )}

      {!p.isDraft && (
        <section id="comments" aria-label="Comments" className="mx-auto mt-12 max-w-[720px] scroll-mt-24 px-4">
          <CommentSection articleId={p.articleId} onCommentsLoaded={p.onCommentsLoaded} />
        </section>
      )}

      {!p.isDraft && (
        <div className="mx-auto max-w-[1040px] px-4 lg:px-6">
          <StoryGrid
            title="More top stories"
            cards={p.related?.more ?? []}
            showImages={p.showImages}
          />
        </div>
      )}
    </div>
  );
}

/** Attached photos that are not already in the article, after the text. */
function PhotoGrid({ gallery }: { gallery: LightboxSlide[] }) {
  const { open, slides } = useLightbox();
  const first = slides.length - gallery.length;
  return (
    <section aria-label="Photos" className="mt-10">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[hsl(var(--edition-text-muted))]">
        Photos <span className="tabular-nums text-[hsl(var(--edition-text-dim))]">{gallery.length}</span>
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {gallery.map((g, i) => (
          <figure key={`${g.src}-${i}`} className="min-w-0">
            <button
              type="button"
              onClick={(e) => open(first + i, e.currentTarget)}
              aria-label={`Open photo ${first + i + 1} of ${slides.length}${g.caption ? `: ${g.caption}` : ""}`}
              className="group relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-lg bg-[hsl(var(--edition-panel))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))]"
            >
              <img
                src={g.src}
                alt={g.alt || g.caption || ""}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
              />
            </button>
            {g.caption && (
              <figcaption className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[hsl(var(--edition-text-muted))]">
                {g.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}

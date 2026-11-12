import type { ReactNode } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Check, MessageCircle, Plus, Share, ThumbsUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { categoryColor } from "@/lib/category-colors";
import { createSlugUrl } from "@/lib/slug-utils";
import { cn } from "@/lib/utils";
import { ShareMenu } from "./share-menu";

export interface HeaderChannel {
  id: number;
  name: string;
  slug?: string | null;
  profileImage?: string | null;
}

interface Props {
  title: string;
  /** Primary category, shown in its section colour. */
  category: string | null;
  location: string | null;
  dek: string | null;
  channel: HeaderChannel | null;
  publishedAt: string | Date | null | undefined;
  minutes: number;
  reads: number;
  likes: number;
  liked: boolean;
  onLike: () => void;
  likePending: boolean;
  commentCount: number;
  following: boolean;
  followPending: boolean;
  onFollow: () => void;
  shareText?: string;
  /** Owner-only toolbar, rendered above the kicker. */
  ownerSlot?: ReactNode;
}

const iconButton =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-[hsl(var(--edition-text-secondary))] transition-colors hover:bg-[hsl(var(--edition-panel))] hover:text-[hsl(var(--edition-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))] disabled:opacity-60";

function compact(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
}

export function ArticleHeader(p: Props) {
  const channelUrl = p.channel
    ? createSlugUrl("/channels/", p.channel.slug || "", String(p.channel.id))
    : null;
  const date = p.publishedAt ? new Date(p.publishedAt) : null;
  const validDate = date && !isNaN(date.getTime()) ? date : null;

  return (
    <header className="mx-auto max-w-[1040px] px-4 pt-5 sm:pt-8 lg:px-6 lg:pt-10">
      {p.ownerSlot}

      {(p.category || p.location) && (
        <p className="text-[11px] font-bold uppercase leading-none tracking-[0.14em] lg:text-[12px]">
          {p.category && <span style={{ color: categoryColor(p.category) }}>{p.category}</span>}
          {p.category && p.location && (
            <span aria-hidden className="mx-2 text-[hsl(var(--edition-text-dim))]">
              ·
            </span>
          )}
          {p.location && (
            <span className="text-[hsl(var(--edition-text-muted))]">{p.location}</span>
          )}
        </p>
      )}

      <h1
        className={cn(
          "max-w-[900px] text-balance font-display text-[30px] font-extrabold leading-[1.12] tracking-[-0.02em] text-[hsl(var(--edition-text))] sm:text-[38px] lg:text-[44px] xl:text-[52px] xl:leading-[1.05]",
          (p.category || p.location) && "mt-3 lg:mt-4"
        )}
      >
        {p.title}
      </h1>

      {p.dek && (
        <p className="mt-3 max-w-[720px] text-[18px] leading-snug text-[hsl(var(--edition-text-secondary))] lg:mt-4 lg:text-[20px]">
          {p.dek}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-[hsl(var(--edition-border-hair))] py-3 lg:mt-7">
        {p.channel && channelUrl && (
          <Link
            href={channelUrl}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))]"
            aria-label={`${p.channel.name} channel`}
          >
            <Avatar className="h-9 w-9 ring-1 ring-[hsl(var(--edition-border))] lg:h-10 lg:w-10">
              <AvatarImage src={p.channel.profileImage || undefined} alt="" />
              <AvatarFallback className="text-xs font-semibold">
                {p.channel.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        )}
        <div className="min-w-0 flex-1 sm:flex-none">
          {p.channel && channelUrl && (
            <Link
              href={channelUrl}
              className="block truncate text-[14px] font-semibold leading-tight text-[hsl(var(--edition-text))] hover:underline"
            >
              {p.channel.name}
            </Link>
          )}
          <p className="mt-0.5 text-[13px] leading-tight text-[hsl(var(--edition-text-muted))]">
            {validDate && (
              <time dateTime={validDate.toISOString()}>{format(validDate, "d MMM yyyy")}</time>
            )}
            {validDate && p.minutes > 0 && <span aria-hidden> · </span>}
            {p.minutes > 0 && <span>{p.minutes} min read</span>}
            {p.reads >= 100 && (
              <span className="hidden sm:inline">
                <span aria-hidden> · </span>
                {compact(p.reads)} reads
              </span>
            )}
          </p>
        </div>

        {p.channel && (
          <button
            type="button"
            onClick={p.onFollow}
            disabled={p.followPending}
            aria-pressed={p.following}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))] focus-visible:ring-offset-2 disabled:opacity-60",
              p.following
                ? "bg-[hsl(var(--edition-panel))] text-[hsl(var(--edition-text-secondary))] ring-1 ring-[hsl(var(--edition-border))]"
                : "bg-[hsl(var(--edition-text))] text-[hsl(var(--edition-bg))] hover:opacity-90"
            )}
          >
            {p.following ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {p.following ? "Following" : "Follow"}
          </button>
        )}

        <div className="flex basis-full items-center justify-end gap-0.5 sm:ml-auto sm:basis-auto">
          <ShareMenu
            title={p.title}
            text={p.shareText}
            trigger={
              <button type="button" className={iconButton} aria-label="Share this story">
                <Share className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Share</span>
              </button>
            }
          />
          <button
            type="button"
            onClick={p.onLike}
            disabled={p.likePending}
            aria-pressed={p.liked}
            aria-label={`${p.liked ? "Unlike" : "Like"} this story${p.likes ? `, ${p.likes} likes` : ""}`}
            className={cn(iconButton, p.liked && "text-[hsl(var(--edition-accent))] hover:text-[hsl(var(--edition-accent))]")}
          >
            <ThumbsUp className={cn("h-[18px] w-[18px]", p.liked && "fill-current")} />
            {p.likes > 0 && <span className="tabular-nums">{compact(p.likes)}</span>}
          </button>
          <a
            href="#comments"
            className={iconButton}
            aria-label={`Comments${p.commentCount ? `, ${p.commentCount}` : ""}`}
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            {p.commentCount > 0 && <span className="tabular-nums">{compact(p.commentCount)}</span>}
          </a>
        </div>
      </div>
    </header>
  );
}

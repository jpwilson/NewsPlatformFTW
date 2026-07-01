import { Article } from "@shared/schema";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import {
  MessageSquare,
  ThumbsUp,
  Eye,
  Clock,
  Flame,
  MapPin,
  Tag,
  Newspaper,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/date-utils";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { createSlugUrl } from "@/lib/slug-utils";
import { useImageVisibility } from "@/components/image-toggle";

// Define a more flexible type for article that accommodates both camelCase and snake_case
type ArticleWithSnakeCase = Article & {
  created_at?: string | Date;
  channel_id?: number;
  channel?: { id: number; name: string; slug?: string };
  likes?: number;
  dislikes?: number;
  viewCount?: number;
  view_count?: number;
  commentCount?: number;
  comment_count?: number;
  userReaction?: boolean | null;
  slug?: string | null;
  categories?: Array<{ id: number; name: string; isPrimary?: boolean }>;
  _count?: {
    comments?: number;
  };
  images?: Array<{ imageUrl: string; caption?: string }>;
};

type ArticleCardVariant = "horizontal" | "vertical" | "hero" | "row";

// Compact number formatting for reader-facing counts (e.g. 12408 -> "12.4k").
function formatCompact(n: number): string {
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(n);
}

export function ArticleCard({
  article,
  variant = "horizontal",
  showReadingNow = true,
}: {
  article: ArticleWithSnakeCase;
  variant?: ArticleCardVariant;
  showReadingNow?: boolean;
}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { showImages } = useImageVisibility();

  const handleChannelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuthDialog(true);
    } else {
      // Use either channelId or channel_id, checking for existence
      const channelId = article?.channel_id || article?.channelId;
      // Only navigate if channelId exists
      if (channelId) {
        const channelSlug = article?.channel?.slug || "";
        setLocation(
          createSlugUrl("/channels/", channelSlug, channelId.toString())
        );
      } else {
        console.error("No channel ID found for this article");
      }
    }
  };

  const handleReaction = async (e: React.MouseEvent, isLike: boolean) => {
    e.preventDefault(); // Prevent navigating to the article

    if (!user) {
      setShowAuthDialog(true);
      return;
    }

    await apiRequest("POST", `/api/articles/${article.id}/reactions`, {
      isLike,
    });
    // Invalidate both the article list and this specific article
    queryClient.invalidateQueries({ queryKey: [`/api/articles`] });
    queryClient.invalidateQueries({
      queryKey: [`/api/articles/${article.id}`],
    });
  };

  // Use 0 as default if counts are undefined.
  // Check for both camelCase and snake_case properties (dev vs prod API shapes).
  const likes = article.likes || 0;
  const views = article.viewCount || article.view_count || 0;
  const commentCount =
    article._count?.comments ||
    article.commentCount ||
    article.comment_count ||
    0;

  // Create the article URL with slug
  const articleUrl = createSlugUrl(
    "/articles/",
    article.slug || "",
    article.id.toString()
  );

  // Freshness / popularity signals ------------------------------------------
  const plainText = article.content
    ? article.content.replace(/<[^>]+>/g, "")
    : "";
  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const rawDate = article.created_at || article.createdAt;
  let relativeTime: string;
  try {
    const d = rawDate ? new Date(rawDate) : null;
    relativeTime =
      d && !isNaN(d.getTime())
        ? formatDistanceToNow(d, { addSuffix: true })
        : formatDate(rawDate);
  } catch {
    relativeTime = formatDate(rawDate);
  }

  // Is the story from today? Drives the hero eyebrow so a stale lead never
  // claims to be "Today's lead".
  const isFromToday = (() => {
    if (!rawDate) return false;
    const d = new Date(rawDate);
    return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
  })();

  // Static "reading now" placeholder — DETERMINISTIC from view count so it is
  // stable (no flicker) and always plausible (kept below total views).
  // TODO: swap for a real live-readers/presence signal when available.
  const readingNow = Math.max(
    1,
    Math.min(Math.round(views * 0.6), Math.round(Math.sqrt(views) * 12))
  );

  // Primary category label (blue eyebrow on the new edition cards)
  const primaryCategory =
    article.categories?.find((c) => c.isPrimary)?.name ||
    article.categories?.[0]?.name ||
    article.category ||
    "";

  // Image handling — respect the global image-visibility toggle. When images
  // are enabled but this article has none, we show a neutral placeholder so the
  // edition grid stays uniform (issue: current cards mix photos with no-image).
  const images = article.images ?? [];
  const imagesEnabled = showImages;
  const firstImage = imagesEnabled && images.length > 0 ? images[0] : null;

  const mediaPlaceholder = (
    <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground/30">
      <Newspaper className="h-8 w-8" />
    </div>
  );

  const authDialog = (
    <AlertDialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Authentication Required</AlertDialogTitle>
          <AlertDialogDescription>
            You need to be logged in to view channel details.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowAuthDialog(false)}>
            Cancel
          </AlertDialogCancel>
          <Button onClick={() => setLocation("/auth")}>Sign In</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // === HERO variant — the lead story (compact side-by-side) ===
  // Image beside a moderate headline so the lead + several "More top stories"
  // rows share the top of the page. Stacks (image over text) on mobile.
  if (variant === "hero") {
    return (
      <>
        <article className="grid grid-cols-1 gap-5 md:grid-cols-[1.1fr_1fr] md:items-center md:gap-7">
          {imagesEnabled && (
            <Link href={articleUrl} className="group block">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted">
                {firstImage ? (
                  <img
                    src={firstImage.imageUrl}
                    alt={firstImage.caption || article.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  mediaPlaceholder
                )}
                {primaryCategory && (
                  <>
                    <div className="edition-scrim pointer-events-none absolute inset-0" />
                    <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      {primaryCategory}
                    </span>
                  </>
                )}
              </div>
            </Link>
          )}
          <div className="flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--edition-accent))]">
              {isFromToday ? "Today's lead" : "Top story"}
              {primaryCategory ? ` · ${primaryCategory}` : ""}
            </span>
            <Link href={articleUrl}>
              <h2 className="mt-2 font-display text-2xl font-extrabold leading-[1.1] tracking-tight hover:underline cursor-pointer line-clamp-3 lg:text-3xl">
                {article.title}
              </h2>
            </Link>
            <p className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
              {plainText}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <button
                onClick={handleChannelClick}
                className="font-medium text-foreground hover:underline"
              >
                {article.channel?.name || "Unknown Channel"}
              </button>
              <span aria-hidden>·</span>
              <span>{relativeTime}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {readMinutes} min read
              </span>
              {showReadingNow && (
                <span className="inline-flex items-center gap-1 font-medium text-[hsl(var(--edition-negative))]">
                  <Flame className="h-3.5 w-3.5" />
                  {formatCompact(readingNow)} reading
                </span>
              )}
            </div>
          </div>
        </article>
        {authDialog}
      </>
    );
  }

  // === ROW variant — compact "More top stories" list item ===
  if (variant === "row") {
    return (
      <>
        <article className="flex gap-4 border-b border-[hsl(var(--edition-border-hair))] py-4">
          {imagesEnabled && (
            <Link href={articleUrl} className="shrink-0">
              <div className="relative h-[74px] w-[116px] overflow-hidden rounded-md bg-muted">
                {firstImage ? (
                  <img
                    src={firstImage.imageUrl}
                    alt={firstImage.caption || article.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  mediaPlaceholder
                )}
              </div>
            </Link>
          )}
          <div className="min-w-0 flex-1">
            {primaryCategory && (
              <span className="text-[10.5px] font-bold uppercase tracking-wide text-[hsl(var(--edition-accent))]">
                {primaryCategory}
              </span>
            )}
            <Link href={articleUrl}>
              <h3 className="font-display text-[19px] font-bold leading-tight hover:underline cursor-pointer line-clamp-2">
                {article.title}
              </h3>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
              <button
                onClick={handleChannelClick}
                className="hover:underline"
              >
                {article.channel?.name || "Unknown Channel"}
              </button>
              <span aria-hidden>·</span>
              <span>{relativeTime}</span>
              <span aria-hidden>·</span>
              <span>{readMinutes} min</span>
              {showReadingNow && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-[hsl(var(--edition-negative))]">
                    {formatCompact(readingNow)} reading
                  </span>
                </>
              )}
            </div>
          </div>
        </article>
        {authDialog}
      </>
    );
  }

  return (
    <>
      <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
        {/* Vertical Layout for grid view */}
        {variant === "vertical" && (
          <div className="hidden md:flex flex-col h-full">
            {firstImage && (
              <div className="w-full h-48 overflow-hidden">
                <img
                  src={firstImage.imageUrl}
                  alt={firstImage.caption || "Article image"}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-col flex-1 p-5">
              <Link href={articleUrl}>
                <h3 className="text-lg font-display font-bold hover:underline cursor-pointer line-clamp-2 mb-2">
                  {article.title}
                </h3>
              </Link>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground mb-3">
                <span>{relativeTime} · {readMinutes} min read</span>
                <button
                  onClick={handleChannelClick}
                  className="text-primary hover:underline w-fit"
                >
                  By: {article.channel?.name || "Unknown Channel"}
                </button>
                {article.categories && article.categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {article.categories.map((cat, index) => (
                      <span key={`${cat.id}-${index}`} className="px-2 py-0.5 bg-muted rounded-md text-xs">
                        {cat.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  article.category && article.category.trim() !== "" && (
                    <span className="px-2 py-0.5 bg-muted rounded-md text-xs w-fit mt-1">
                      {article.category}
                    </span>
                  )
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
                {plainText}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <span>{formatCompact(views)}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                  <span>{likes}</span>
                </div>
                {commentCount > 0 && (
                  <Link href={`${articleUrl}#comments`}>
                    <div className="flex items-center hover:text-primary hover:underline cursor-pointer">
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      <span>{commentCount}</span>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Layout */}
        <div className={cn("md:hidden", variant === "vertical" ? "" : "")}>
          {firstImage && (
            <div className="flex">
              {/* Left side: Title, metadata, text, and stats */}
              <div className="flex-1 flex flex-col p-4">
                <Link href={articleUrl}>
                  <h3 className="text-lg font-display font-semibold hover:underline cursor-pointer line-clamp-2 mb-2">
                    {article.title}
                  </h3>
                </Link>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span>{relativeTime} · {readMinutes} min read</span>
                  {article.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {article.location}
                    </span>
                  )}
                  <button
                    onClick={handleChannelClick}
                    className="text-primary hover:underline w-fit"
                  >
                    By: {article.channel?.name || "Unknown Channel"}
                  </button>
                  {article.category && article.category.trim() !== "" && (
                    <div className="mt-1">
                      <span className="px-2 py-0.5 bg-muted rounded-md text-xs inline-block">
                        {article.category}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-3 flex-1">
                  {plainText}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-2 border-t">
                  <div className="flex items-center">
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    <span>{formatCompact(views)}</span>
                  </div>
                  <div className="flex items-center">
                    <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                    <span>{likes}</span>
                  </div>
                  {commentCount > 0 && (
                    <Link href={`${articleUrl}#comments`}>
                      <div className="flex items-center hover:text-primary hover:underline cursor-pointer">
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        <span>{commentCount}</span>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
              {/* Right side: Image filling the right third */}
              <div className="w-2/5 relative flex-shrink-0">
                <img
                  src={firstImage.imageUrl}
                  alt={firstImage.caption || "Article image"}
                  className="absolute inset-0 w-full h-full object-cover rounded-r-lg"
                />
              </div>
            </div>
          )}
          {!firstImage && (
            <div className="p-4">
              <Link href={articleUrl}>
                <h3 className="text-lg font-display font-semibold hover:underline cursor-pointer mb-2">
                  {article.title}
                </h3>
              </Link>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>{relativeTime} · {readMinutes} min read</span>
                {article.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {article.location}
                  </span>
                )}
                <button
                  onClick={handleChannelClick}
                  className="text-primary hover:underline w-fit"
                >
                  By: {article.channel?.name || "Unknown Channel"}
                </button>
                {article.category && article.category.trim() !== "" && (
                  <div className="mt-1">
                    <span className="px-2 py-0.5 bg-muted rounded-md text-xs inline-block">
                      {article.category}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-3">
                {plainText}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-2 border-t">
                <div className="flex items-center">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <span>{formatCompact(views)}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                  <span>{likes}</span>
                </div>
                {commentCount > 0 && (
                  <Link href={`${articleUrl}#comments`}>
                    <div className="flex items-center hover:text-primary hover:underline cursor-pointer">
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      <span>{commentCount}</span>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Layout - horizontal (hidden when vertical variant is used) */}
        <div className={cn("hidden", variant === "vertical" ? "" : "md:flex")}>
          <div className={cn("flex-1", firstImage && "w-2/3")}>
            <CardHeader>
              <div className="space-y-2">
                <Link href={articleUrl}>
                  <h3 className="text-xl font-display font-bold hover:underline cursor-pointer">
                    {article.title}
                  </h3>
                </Link>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>{relativeTime} · {readMinutes} min read</span>
                    {article.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {article.location}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleChannelClick}
                    className="text-primary hover:underline w-fit"
                  >
                    By: {article.channel?.name || "Unknown Channel"}
                  </button>
                  {/* Display all categories */}
                  {article.categories && article.categories.length > 0 ? (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {article.categories.map((cat, index) => (
                        <span
                          key={`${cat.id}-${index}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-xs"
                        >
                          <Tag className="h-3 w-3" />
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    article.category &&
                    article.category.trim() !== "" && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-xs">
                          <Tag className="h-3 w-3" />
                          {article.category}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <p className="text-muted-foreground line-clamp-3">
                {plainText}
              </p>
            </CardContent>

            <CardFooter>
              <div className="flex items-center gap-5">
                <div className="flex items-center text-muted-foreground">
                  <Eye className="h-4 w-4 mr-1" />
                  <span className="text-sm">{formatCompact(views)}</span>
                </div>

                <div className="flex items-center text-muted-foreground">
                  <ThumbsUp className="h-4 w-4 mr-1" />
                  <span className="text-sm">{likes}</span>
                </div>

                {commentCount > 0 && (
                  <Link href={`${articleUrl}#comments`}>
                    <div className="flex items-center text-muted-foreground hover:text-primary hover:underline cursor-pointer">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      <span className="text-sm">{commentCount}</span>
                    </div>
                  </Link>
                )}
              </div>
            </CardFooter>
          </div>

          {firstImage && (
            <div className="w-1/3 relative">
              <img
                src={firstImage.imageUrl}
                alt={firstImage.caption || "Article image"}
                className="absolute inset-0 w-full h-full object-cover rounded-r-lg"
              />
            </div>
          )}
        </div>
      </Card>

      {authDialog}
    </>
  );
}

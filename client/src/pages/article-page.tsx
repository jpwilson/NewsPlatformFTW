import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { NavigationBar } from "@/components/navigation-bar";
import { ReadingProgress } from "@/components/rich-article-content";
import { SiteFooter } from "@/components/site-footer";
import { AuthDialog } from "@/components/auth-dialog";
import { MetaHead } from "@/components/meta-head";
import { useImageVisibility } from "@/components/image-toggle";
import { LightboxProvider } from "@/components/lightbox/lightbox-context";
import { ArticleHeader } from "@/components/article/article-header";
import { ArticleHero } from "@/components/article/article-hero";
import { ArticleBody } from "@/components/article/article-body";
import { ArticleEnd } from "@/components/article/article-end";
import { OwnerToolbar } from "@/components/article/owner-toolbar";
import {
  useArticle,
  useChannelFollow,
  useReaction,
  useRecordView,
  useRelated,
} from "@/components/article/use-article";
import type { ArticleWithSnakeCase } from "@/components/article/article-types";
import { useAuth } from "@/hooks/use-auth";
import { createSlugUrl } from "@/lib/slug-utils";
import { sanitizeArticleHtml } from "@/lib/sanitize-article-html";
import {
  composeArticleMedia,
  deriveExcerpt,
  readMinutes,
  sortImages,
  toMediaUrl,
} from "@shared/article-media";
import { SITE_URL } from "@/content/marketing";

// The owner's inline editor is only downloaded when Edit is pressed.
const ArticleEditMode = lazy(() => import("@/components/article/article-edit-mode"));

/** Legacy articles stored as plain text (no tags) become paragraphs. */
function toHtml(content: string | undefined): string {
  if (!content) return "";
  if (/<[a-z][\s\S]*>/i.test(content)) return content;
  return content
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function primaryCategory(article: ArticleWithSnakeCase): string | null {
  const name =
    article.categories?.find((c) => c.isPrimary)?.name ||
    article.categories?.[0]?.name ||
    article.category ||
    "";
  const clean = name.trim();
  if (!clean || clean.toLowerCase() === "uncategorized") return null;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  // Extract just the numeric ID portion if it contains a slash
  const articleId = id.includes("/") ? id.split("/")[0] : id;
  const { user } = useAuth();
  const { showImages } = useImageVisibility();
  const [isEditing, setIsEditing] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);
  const [liveCommentCount, setLiveCommentCount] = useState<number | null>(null);

  const { data: article, isLoading } = useArticle(articleId);
  const liveViews = useRecordView(article);
  const askToLogIn = useCallback((why: string) => () => setAuthPrompt(why), []);
  const reaction = useReaction(article, askToLogIn("Log in to react to stories."));
  const channel = article?.channel ?? null;
  const follow = useChannelFollow(channel, askToLogIn("Log in to follow channels."));
  const related = useRelated(article);

  // Hero, body and gallery decided once: each photo appears once (shared/article-media.js).
  const media = useMemo(
    () =>
      composeArticleMedia({
        images: article?.images,
        html: sanitizeArticleHtml(toHtml(article?.content)),
      }),
    [article?.images, article?.content]
  );
  const minutes = useMemo(() => readMinutes(media.bodyHtml), [media.bodyHtml]);
  const excerpt = useMemo(() => deriveExcerpt(media.bodyHtml), [media.bodyHtml]);

  if (isLoading) return <ArticleSkeleton />;

  if (!article) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <main className="mx-auto max-w-[720px] px-4 py-24 text-center">
          <h1 className="font-display text-3xl font-extrabold">This story is not available</h1>
          <p className="mt-3 text-[hsl(var(--edition-text-muted))]">
            It may have been moved, unpublished or deleted.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-[hsl(var(--edition-text))] px-5 text-sm font-semibold text-[hsl(var(--edition-bg))]"
          >
            Go to today's top stories
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const isOwner = !!user && (article.userId === user.id || article.user_id === user.id);
  const isDraft = article.status === "draft" || article.published === false;
  const reads = liveViews ?? (article.viewCount || article.view_count || 0);
  const commentCount =
    liveCommentCount ?? (article._count?.comments || article.commentCount || article.comment_count || 0);
  const cover = sortImages(article.images || [])[0] as { imageUrl?: string } | undefined;
  const articleUrl = createSlugUrl("/articles/", article.slug || "", articleId);
  const coverUrl = cover?.imageUrl ? toMediaUrl(cover.imageUrl) : undefined;
  const publishedRaw = article.published_at || article.created_at || article.createdAt;
  const published = publishedRaw ? new Date(publishedRaw).toISOString() : undefined;

  const rawAvatar = channel?.profileImage || channel?.profile_image;
  const avatar = rawAvatar ? toMediaUrl(rawAvatar) : null;

  const hero =
    showImages && media.hero ? <ArticleHero slide={media.hero} total={media.slides.length} /> : null;

  return (
    <LightboxProvider slides={media.slides}>
      <MetaHead
        title={article.title || "News Article"}
        description={excerpt}
        imageUrl={coverUrl}
        url={articleUrl}
        jsonLd={
          isDraft
            ? undefined
            : {
                "@context": "https://schema.org",
                "@type": "NewsArticle",
                headline: article.title,
                description: excerpt,
                ...(coverUrl ? { image: [`${SITE_URL}${coverUrl}`] } : {}),
                datePublished: published,
                // last_edited is bumped by every view, so it is not a real modification time.
                dateModified: published,
                mainEntityOfPage: `${SITE_URL}${articleUrl}`,
                isAccessibleForFree: true,
                ...(channel
                  ? {
                      author: {
                        "@type": "Organization",
                        name: channel.name,
                        url: `${SITE_URL}${createSlugUrl("/channels/", channel.slug || "", String(channel.id))}`,
                      },
                    }
                  : {}),
                publisher: {
                  "@type": "Organization",
                  name: "NewsPlatform",
                  logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-stacked.png` },
                },
              }
        }
      />

      <div className="min-h-screen bg-background">
        <ReadingProgress />
        <NavigationBar />

        {isEditing ? (
          <Suspense
            fallback={
              <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ArticleEditMode
              article={article}
              articleId={articleId}
              isOwner={isOwner}
              isDraft={isDraft}
              chrome={{ imagesSection: hero }}
              onExit={() => setIsEditing(false)}
            />
          </Suspense>
        ) : (
          <main>
            <article>
              <ArticleHeader
                title={article.title}
                category={primaryCategory(article)}
                location={article.location_name || article.location || null}
                dek={media.dek}
                channel={
                  channel
                    ? {
                        id: channel.id,
                        name: channel.name,
                        slug: channel.slug,
                        profileImage: avatar,
                      }
                    : null
                }
                publishedAt={article.created_at || article.createdAt}
                minutes={minutes}
                reads={reads}
                likes={reaction.likes}
                liked={reaction.userReaction === true}
                likePending={reaction.pending}
                onLike={() => reaction.react(true)}
                commentCount={commentCount}
                following={follow.following}
                followPending={follow.pending}
                onFollow={follow.toggle}
                shareText={excerpt}
                ownerSlot={
                  isOwner ? (
                    <OwnerToolbar
                      articleId={articleId}
                      isDraft={isDraft}
                      onEdit={() => setIsEditing(true)}
                    />
                  ) : null
                }
              />
              {hero}
              <ArticleBody html={media.bodyHtml} />
            </article>
            <ArticleEnd
              articleId={article.id}
              title={article.title}
              shareText={excerpt}
              isDraft={isDraft}
              showImages={showImages}
              gallery={media.gallery}
              channel={
                channel
                  ? {
                      id: channel.id,
                      name: channel.name,
                      slug: channel.slug,
                      profileImage: avatar,
                      description: (channel as { description?: string | null }).description,
                      subscriberCount: (channel as { subscriberCount?: number | null }).subscriberCount,
                    }
                  : null
              }
              related={related}
              reaction={reaction}
              follow={follow}
              onCommentsLoaded={setLiveCommentCount}
            />
          </main>
        )}
        <SiteFooter />
      </div>

      <AuthDialog
        open={!!authPrompt}
        onOpenChange={(o) => !o && setAuthPrompt(null)}
        title="Log in to continue"
        description={authPrompt || ""}
      />
    </LightboxProvider>
  );
}

function ArticleSkeleton() {
  const bar = "rounded bg-[hsl(var(--edition-panel))] dark:bg-[hsl(var(--muted))]";
  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      <div
        className="mx-auto max-w-[1040px] animate-pulse px-4 pt-5 sm:pt-8 lg:px-6 lg:pt-10"
        aria-busy="true"
        aria-label="Loading story"
      >
        <div className={`${bar} h-3 w-40`} />
        <div className={`${bar} mt-4 h-8 w-full max-w-[860px] lg:h-11`} />
        <div className={`${bar} mt-3 h-8 w-4/5 max-w-[700px] lg:h-11`} />
        <div className="mt-7 flex items-center gap-3 border-y border-[hsl(var(--edition-border-hair))] py-3">
          <div className={`${bar} h-9 w-9 rounded-full`} />
          <div className="flex-1 space-y-2">
            <div className={`${bar} h-3 w-40`} />
            <div className={`${bar} h-3 w-28`} />
          </div>
        </div>
      </div>
      <div className="mx-auto mt-6 max-w-[1040px] sm:px-4 lg:mt-8 lg:px-6">
        <div
          className={`${bar} aspect-[3/2] w-full animate-pulse rounded-none sm:aspect-[16/9] sm:max-h-[620px] sm:rounded-xl`}
        />
      </div>
    </div>
  );
}

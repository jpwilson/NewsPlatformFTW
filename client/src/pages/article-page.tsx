import { useQuery } from "@tanstack/react-query";
import { NavigationBar } from "@/components/navigation-bar";
import {
  RichArticleContent,
  ReadingProgress,
} from "@/components/rich-article-content";
import { ArticleCard } from "@/components/article-card";
import { CommentSection } from "@/components/comment-section";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Eye,
  MessageSquare,
  Edit,
  Trash2,
  ExternalLink,
  FileDown,
  Image as ImageIcon,
  ImageOff,
  Share,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/date-utils";
import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import type { ArticleWithSnakeCase } from "@/components/article/article-types";

// The owner's inline editor is only downloaded when Edit is pressed.
const ArticleEditMode = lazy(() => import("@/components/article/article-edit-mode"));
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { createSlugUrl } from "@/lib/slug-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LightboxProvider,
  useLightbox,
  type LightboxSlide,
} from "@/components/lightbox/lightbox-context";
import { sanitizeArticleHtml } from "@/lib/sanitize-article-html";
import { supabase } from "@/lib/supabase";
import { MetaHead } from "@/components/meta-head";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePostHog } from "@/lib/posthog";

// Helper function to capitalize the first letter of a string
function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Add a new function to format date without day of week and year
function formatDateWithoutDay(
  date: string | Date | undefined | null,
  showTime = false
) {
  if (!date) return "";
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    // year removed as requested
  };
  if (showTime) {
    options.hour = "numeric";
    options.minute = "2-digit";
  }
  return new Date(date).toLocaleDateString("en-US", options);
}

// Helper function to extract a readable description from article content
function extractDescription(
  content: string | undefined,
  maxLength = 160
): string {
  if (!content) return "";

  // Strip HTML tags if present
  const strippedContent = content.replace(/<[^>]*>/g, " ");

  // Remove excess whitespace
  const cleanedContent = strippedContent.replace(/\s+/g, " ").trim();

  // If content is shorter than maxLength, return it all
  if (cleanedContent.length <= maxLength) {
    return cleanedContent;
  }

  // Find the last complete sentence or cut at a reasonable word boundary
  const truncated = cleanedContent.substring(0, maxLength);

  // Try to find the last period, question mark, or exclamation within the truncated text
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("?"),
    truncated.lastIndexOf("!")
  );

  if (lastSentenceEnd > maxLength * 0.7) {
    // If we found a sentence end that's at least 70% through the max length, cut there
    return truncated.substring(0, lastSentenceEnd + 1);
  } else {
    // Otherwise, find the last space to avoid cutting words in half
    const lastSpace = truncated.lastIndexOf(" ");
    return truncated.substring(0, lastSpace) + "...";
  }
}

// Add these utility functions after the other helper functions
const isPlainText = (content: string | undefined): boolean => {
  if (!content) return true;
  // Check if content has any HTML tags
  return !/<[a-z][\s\S]*>/i.test(content);
};

const convertPlainTextToHtml = (plainText: string | undefined): string => {
  if (!plainText) return "";

  // Split on double newlines (paragraphs)
  const paragraphs = plainText.split(/\n\s*\n/);

  // Wrap each paragraph in <p> tags and join
  return paragraphs
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
};

export default function ArticlePage() {
  const [location, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  // Extract just the numeric ID portion if it contains a slash
  const articleId = id.includes("/") ? id.split("/")[0] : id;
  const { user } = useAuth();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  // Edit mode (the editor lives in components/article/article-edit-mode.tsx)
  const [isEditing, setIsEditing] = useState(false);

  // Local override for view count in case API response is faster than query invalidation
  const [viewCountOverride, setViewCountOverride] = useState<number | null>(
    null
  );

  const [showImages, setShowImages] = useState(true);
  const { trackEvent } = usePostHog();

  const {
    data: article,
    isLoading,
    error,
  } = useQuery<ArticleWithSnakeCase>({
    queryKey: [`/api/articles/${articleId}`],
    queryFn: async () => {
      if (!articleId) return null;
      const response = await fetch(`/api/articles/${articleId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch article");
      }
      return response.json();
    },
    enabled: !!articleId,
  });



  // Related articles (same channel) for the recirculation block
  const articleChannelId = article?.channel_id || article?.channelId;
  const { data: channelArticles } = useQuery<any[]>({
    queryKey: [`/api/channels/${articleChannelId}/articles`],
    enabled: !!articleChannelId,
  });
  const relatedArticles = (channelArticles || [])
    .filter((a) => a.id !== article?.id)
    .slice(0, 4)
    .map((a) => ({
      ...a,
      channel:
        a.channel ??
        (article?.channel
          ? { id: articleChannelId, name: (article as any).channel?.name }
          : undefined),
    }));

  // Check if the current user is the article owner
  const isOwner =
    !!user &&
    !!article &&
    (article.userId === user.id || article.user_id === user.id);

  // Log ownership debugging info to console
  useEffect(() => {
    if (article && user) {
      console.log("Article owner check:");
      console.log("- Article userId:", article.userId || article.user_id);
      console.log("- Current user id:", user.id);
      console.log("- Is owner:", isOwner);
    }
  }, [article, user, isOwner]);


  // Check if article is in draft state
  const isDraft = article?.status === "draft" || article?.published === false;

  // Increment view count when the article is loaded
  useEffect(() => {
    if (articleId && !isLoading && article) {
      console.log("Recording view for article:", article.slug);
      
      // Track article view in PostHog
      trackEvent("article_viewed", {
        article_id: article.id,
        article_slug: article.slug,
        article_title: article.title,
        channel_id: article.channel_id || article.channelId,
        channel_name: article.channel?.name,
        category: article.category,
      });

      apiRequest("POST", `/api/articles/${article.slug}/view`, {})
        .then((response) => response.json())
        .then((data) => {
          console.log("View count response:", data);

          // Update view count locally if returned from API
          if (data.view_count !== undefined) {
            console.log(`Setting view count override to ${data.view_count}`);
            setViewCountOverride(data.view_count);
          }

          // If this is a new view, invalidate ALL relevant queries to update counts everywhere
          if (data.counted || data.shouldInvalidateFeeds) {
            console.log(
              "Invalidating article queries to refresh view counts everywhere"
            );

            // Invalidate the specific article query
            queryClient.invalidateQueries({
              queryKey: [`/api/articles/${articleId}`],
            });

            // Invalidate all article lists/feeds
            queryClient.invalidateQueries({
              queryKey: ["/api/articles"],
            });

            // Invalidate channel articles if we know the channel
            if (article.channelId || article.channel_id) {
              const channelId = article.channelId || article.channel_id;
              console.log(
                `Invalidating channel articles for channel ${channelId}`
              );
              queryClient.invalidateQueries({
                queryKey: [`/api/channels/${channelId}/articles`],
              });
            }
          } else {
            console.log(
              "View already counted previously, not invalidating queries"
            );
          }
        })
        .catch((err) => console.error("Failed to increment view count:", err));
    }
  }, [articleId, isLoading, article, trackEvent]);

  const [likeCount, setLikeCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  const [userReaction, setUserReaction] = useState<boolean | null>(null);

  const handleReaction = async (isLike: boolean) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to react to articles",
        variant: "destructive",
      });
      return;
    }

    if (!article) {
      toast({
        title: "Error",
        description: "Article not found",
        variant: "destructive",
      });
      return;
    }

    try {
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      if (authError || !session) {
        throw new Error("No valid session");
      }

      const response = await fetch(`/api/articles/${article.slug}/reactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ isLike }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to process reaction");
      }

      const data = await response.json();
      setLikeCount(data.like_count);
      setDislikeCount(data.dislike_count);
      setUserReaction(data.user_reaction);

      // Show success message
      toast({
        title: "Success",
        description:
          data.user_reaction === null
            ? "Reaction removed"
            : data.user_reaction
            ? "Article liked!"
            : "Article disliked!",
        variant: "default",
      });

      // Invalidate queries to update counts everywhere
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${article.id}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });

      // If article is from a channel, invalidate channel articles too
      if (article.channelId || article.channel_id) {
        const channelId = article.channelId || article.channel_id;
        queryClient.invalidateQueries({
          queryKey: [`/api/channels/${channelId}/articles`],
        });
      }
    } catch (error) {
      console.error("Error handling reaction:", error);
      toast({
        title: "Error",
        description: "Failed to process reaction",
        variant: "destructive",
      });
    }
  };

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
        setLocation(createSlugUrl("/channels/", channelSlug, channelId));
      } else {
        console.error("No channel ID found for this article");
      }
    }
  };

  // Mutation for toggling article publish status
  const togglePublishMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/articles/${articleId}/toggle-status`
      );
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${articleId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      toast({
        title: `Article ${data.published ? "published" : "moved to drafts"}`,
        description: `The article has been ${
          data.published ? "published" : "moved to your drafts"
        }.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to change article status.",
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting the article
  const deleteArticleMutation = useMutation({
    mutationFn: async () => {
      console.log(`Attempting to delete article with ID: ${articleId}`);
      try {
        const response = await apiRequest(
          "DELETE",
          `/api/articles/${articleId}`
        );
        // Don't try to parse JSON for 204 No Content responses
        if (response.status === 204) {
          return null; // No content to parse
        }

        // If there's an error response with JSON body
        if (!response.ok) {
          const errorData = await response.json();
          console.error("Error deleting article:", errorData);
          throw new Error(
            errorData.error ||
              errorData.message ||
              "Failed to delete the article"
          );
        }

        return await response.json();
      } catch (error) {
        console.error("Error in article deletion:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setLocation("/");
      toast({
        title: "Article deleted",
        description: "The article has been deleted.",
      });
    },
    onError: (error: any) => {
      console.error("Deletion error details:", error);
      const errorMessage = error.message || "Failed to delete the article.";

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteArticleMutation.mutate();
  };


  // Body HTML as rendered, and the photo viewer's slides (attached images, then body images).
  const bodyHtml = useMemo(
    () =>
      isPlainText(article?.content)
        ? convertPlainTextToHtml(article?.content)
        : article?.content || "",
    [article?.content]
  );
  const slides = useMemo(
    () => interimSlides(article?.images || [], bodyHtml),
    [article?.images, bodyHtml]
  );
  const attachedCount = article?.images?.length || 0;

  // Add a state for real-time comment count
  const [realTimeCommentCount, setRealTimeCommentCount] = useState<
    number | null
  >(null);

  // Replace the handleShare function with two separate functions
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied to clipboard",
        description: "You can now share it manually",
      });
    } catch (err) {
      console.error("Error copying to clipboard:", err);
      toast({
        title: "Copying failed",
        description: "Could not copy the link to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleShareVia = async () => {
    const articleUrl = window.location.href;
    const title = article?.title || "News Article";
    const text = article?.content
      ? extractDescription(article.content, 100)
      : "Check out this article";

    try {
      // Try to use Web Share API if available
      if (navigator.share) {
        await navigator.share({
          title,
          text,
          url: articleUrl,
        });
        // Only show success message if sharing completes successfully
        toast({
          title: "Shared successfully",
          description: "The article link has been shared",
        });
      } else {
        // Fallback if Web Share API is not available
        toast({
          title: "Sharing not supported",
          description: "Your browser doesn't support direct sharing",
          variant: "destructive",
        });
        // Automatically fall back to copying the link
        await handleCopyLink();
      }
    } catch (err: unknown) {
      // Check if it's an AbortError (user cancelled) and don't show error
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        err.name !== "AbortError"
      ) {
        console.error("Error sharing:", err);
        // Only show error for non-cancellation errors
        toast({
          title: "Sharing failed",
          description: "Failed to share the article",
          variant: "destructive",
        });
      }
      // For AbortError, do nothing as user intentionally cancelled
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="flex justify-center items-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="container mx-auto p-4 lg:p-8">
          <div className="text-center">Article not found</div>
        </div>
      </div>
    );
  }

  // Extract counts from article and apply local override for views if available
  const likes = article.likes || 0;
  const dislikes = article.dislikes || 0;
  const views =
    viewCountOverride !== null
      ? viewCountOverride
      : article.viewCount || article.view_count || 0;

  // Use real-time comment count if available, otherwise fall back to article data
  const commentCount =
    realTimeCommentCount !== null
      ? realTimeCommentCount
      : article._count?.comments ||
        article.commentCount ||
        article.comment_count ||
        0;

  // Check if user has liked or disliked
  const userLiked = article.userReaction === true;
  const userDisliked = article.userReaction === false;

  // Get location from either location or any nested location objects
  const articleLocation =
    article.location ||
    ((article as any).locationDetails
      ? (article as any).locationDetails.name
      : null) ||
    ((article as any)._location ? (article as any)._location.name : null);

  // Create meta information for sharing
  const articleUrl = createSlugUrl(
    "/articles/",
    article?.slug || "",
    articleId
  );
  const articleFullUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const firstImage =
    article?.images && article.images.length > 0
      ? article.images[0].imageUrl
      : undefined;
  const description = article?.content
    ? extractDescription(article.content)
    : "";


  // Read-only parts shared by the read view and the edit mode
  const channelBlock = (
    <>
      {/* Channel Profile Image and Name */}
      {article?.channel && (
        <div className="flex flex-col items-center gap-2 min-w-fit">
          <button
            onClick={handleChannelClick}
            className="flex flex-col items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage 
                src={article.channel.profileImage || article.channel.profile_image || undefined} 
                alt={article.channel.name} 
              />
              <AvatarFallback className="bg-primary/10 text-lg font-semibold">
                {article.channel.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-primary hover:underline text-center">
              {article.channel.name}
            </span>
          </button>
        </div>
      )}
    </>
  );
  const datesRow = (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
        <span className="font-medium">Published:</span>{" "}
        {formatDate(article.created_at || article.createdAt, true)}
      </span>
      {(() => {
        // Safely get the dates
        const editedDate = article.lastEdited || article.last_edited;
        const createdDate = article.created_at || article.createdAt;

        // Only show if both dates exist and are meaningfully different (more than a few seconds)
        if (editedDate && createdDate) {
          const editDateTime = new Date(editedDate);
          const createDateTime = new Date(createdDate);

          // Format both dates to exclude seconds for comparison
          const editTimeFormatted = editDateTime
            .toISOString()
            .slice(0, 16);
          const createTimeFormatted = createDateTime
            .toISOString()
            .slice(0, 16);

          // Only show the edit time if they differ when ignoring seconds
          if (
            editTimeFormatted !== createTimeFormatted &&
            Math.abs(
              editDateTime.getTime() - createDateTime.getTime()
            ) > 60000
          ) {
            return (
              <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                <span className="font-medium">Latest Edit:</span>{" "}
                {formatDateWithoutDay(editedDate, true)}
              </span>
            );
          }
        }
        return null;
      })()}
    </div>
  );
  const metricsBar = (
    <>
      {/* Article metrics with Share button */}
      <div className="flex items-center gap-5 mt-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
        <div className="flex items-center">
          <Eye className="h-5 w-5 mr-2 text-slate-600 dark:text-slate-300" />
          <span className="text-sm font-medium">{views} views</span>
        </div>

        <div className="flex items-center">
          <ThumbsUp className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
          <span className="text-sm font-medium">{likes} likes</span>
        </div>

        <div className="flex items-center">
          <ThumbsDown className="h-5 w-5 mr-2 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium">
            {dislikes} dislikes
          </span>
        </div>

        {commentCount >= 7 && (
          <div className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium">
              {commentCount} comments
            </span>
          </div>
        )}

        {/* Replace the Share button with a dropdown menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto flex items-center text-primary"
            >
              <Share className="h-5 w-5 mr-2" />
              <span className="text-sm font-medium">Share</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyLink}>
              Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleShareVia}>
              Share post via...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
  const imagesSection = (
    <>
      {/* Image Gallery */}
      {article?.images && article.images.length > 0 && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Article Images</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImages(!showImages)}
            >
              {showImages ? (
                <>
                  <ImageOff className="h-4 w-4 mr-2" />
                  Hide Images
                </>
              ) : (
                <>
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Show Images
                </>
              )}
            </Button>
          </div>

          {showImages && article.images[0] && (
            <div className="relative">
              <HeroPhoto src={article.images[0].imageUrl} />
              {article.images[0].caption && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {article.images[0].caption}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
  const afterBody = (
    <>
      {/* Related articles — recirculation from the same channel */}
      {article && article.status !== "draft" && relatedArticles.length > 0 && (
        <div className="my-10 border-t pt-8">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            More from {article.channel?.name || "this channel"}
          </h2>
          <div>
            {relatedArticles.map((a: any) => (
              <ArticleCard key={a.id} article={a} variant="row" />
            ))}
          </div>
        </div>
      )}

      {/* Comments section (only show for published articles) */}
      {article && article.status !== "draft" && (
        <CommentSection
          articleId={parseInt(articleId)}
          onCommentsLoaded={setRealTimeCommentCount}
        />
      )}
    </>
  );

  return (
    <LightboxProvider slides={slides}>
      {/* Add meta tags for social sharing when article is loaded */}
      {article && (
        <MetaHead
          title={article.title || "News Article"}
          description={description}
          imageUrl={firstImage}
          url={articleUrl}
        />
      )}

      <div className="min-h-screen bg-background">
        <ReadingProgress />
        <NavigationBar />

        {isEditing ? (
          <Suspense
            fallback={
              <div className="flex justify-center items-center h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <ArticleEditMode
              article={article}
              articleId={articleId}
              isOwner={isOwner}
              isDraft={isDraft}
              chrome={{ channelBlock, datesRow, metricsBar, imagesSection, afterBody }}
              onExit={() => setIsEditing(false)}
            />
          </Suspense>
        ) : (
        <article className="container mx-auto p-4 lg:p-8 max-w-4xl">
          <header className="mb-8 border-b pb-6 relative">
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-4">
                  <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
              </div>

              {channelBlock}
            </div>

            <div className="flex justify-between items-start mt-4">
              {/* Owner actions */}
              {isOwner && (
                <div className="flex gap-2">
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </>

                    <>
                      <Button
                        variant={isDraft ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePublishMutation.mutate()}
                        disabled={togglePublishMutation.isPending}
                      >
                        {togglePublishMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : isDraft ? (
                          <ExternalLink className="h-4 w-4 mr-2" />
                        ) : (
                          <FileDown className="h-4 w-4 mr-2" />
                        )}
                        {isDraft ? "Publish" : "Move to Drafts"}
                      </Button>

                      <AlertDialog
                        open={showDeleteDialog}
                        onOpenChange={setShowDeleteDialog}
                      >
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Article</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this article? This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDelete}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                </div>
              )}
            </div>

            {/* Draft indicator */}
            {isDraft && (
              <div className="inline-block mb-4 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-2 py-1 rounded text-sm font-medium">
                Draft
              </div>
            )}

            <div className="flex flex-col gap-3 text-muted-foreground mt-4">
              {datesRow}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Show categories from either the categories array or fallback to the legacy category field */}
                {((article.categories && article.categories.length > 0) ||
                  (article.category &&
                    article.category.trim() !== "" &&
                    article.category.toLowerCase() !== "uncategorized")) && (
                  <>
                    <span className="font-medium">Categories:</span>{" "}
                      <div className="flex flex-wrap gap-2">
                        {article.categories && article.categories.length > 0 ? (
                          article.categories.map(
                            (
                              cat: {
                                id: number;
                                name: string;
                                isPrimary?: boolean;
                              },
                              index: number
                            ) => (
                              <span
                                key={`${cat.id}-${index}`}
                                className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-3 py-1 rounded-md"
                              >
                                {capitalizeFirstLetter(cat.name)}
                              </span>
                            )
                          )
                        ) : (
                          <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-3 py-1 rounded-md">
                            {capitalizeFirstLetter(article.category)}
                          </span>
                        )}
                      </div>
                  </>
                )}

                {/* Only show location if it exists and is not empty AND we're not in edit mode */}
                {articleLocation &&
                articleLocation.trim() !== "" ? (
                  <>
                    {article.category &&
                      article.category.trim() !== "" &&
                      article.category.toLowerCase() !== "uncategorized" && (
                        <span className="mx-2">|</span>
                      )}
                    <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-md">
                      <span className="font-medium">📍 Location:</span>{" "}
                      {articleLocation}
                    </span>
                  </>
                ) : null}

              </div>

              {metricsBar}
            </div>
          </header>

          {imagesSection}

          {/* Article content */}
          <div className="prose dark:prose-invert max-w-none">
            {/* Article content */}
              {/* Rich article content: charts hydrate, figures open the photo viewer */}
              <BodyWithViewer html={bodyHtml} firstBodySlide={attachedCount} />
          </div>

          {/* Interactive like/dislike buttons at the bottom */}
          <div className="flex items-center gap-4 my-8 border-t border-b py-6">
              <>
                <div className="text-lg font-medium mr-2">
                  What did you think?
                </div>
                <Button
                  variant={userLiked ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleReaction(true)}
                  className={cn(userLiked && "bg-green-600 hover:bg-green-700")}
                >
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  Like {likes > 0 && <span className="ml-1">({likes})</span>}
                </Button>
                <Button
                  variant={userDisliked ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleReaction(false)}
                  className={cn(userDisliked && "bg-red-600 hover:bg-red-700")}
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Dislike{" "}
                  {dislikes > 0 && <span className="ml-1">({dislikes})</span>}
                </Button>
              </>
          </div>

          {afterBody}
        </article>
        )}
      </div>

      <AlertDialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Authentication Required</AlertDialogTitle>
            <AlertDialogDescription>
              You need to be logged in to{" "}
              {articleId ? "like or dislike articles" : "view channel details"}.
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
    </LightboxProvider>
  );
}

/**
 * Interim slide list for the photo viewer (replaced by composeArticleMedia from
 * shared/article-media.js in step B3): the attached images, then the body's images
 * in document order, captioned from their <figcaption> or alt text.
 */
function interimSlides(
  images: Array<{ imageUrl: string; caption?: string }>,
  html: string
): LightboxSlide[] {
  const slides: LightboxSlide[] = images.map((img, i) => ({
    src: img.imageUrl,
    caption: img.caption || "",
    credit: "",
    alt: img.caption || `Photo ${i + 1}`,
    origin: i === 0 ? "hero" : "gallery",
  }));
  if (typeof DOMParser === "undefined" || !html) return slides;
  const doc = new DOMParser().parseFromString(sanitizeArticleHtml(html), "text/html");
  doc.querySelectorAll("img").forEach((img) => {
    const fig = img.closest("figure");
    const caption =
      fig?.querySelector("figcaption")?.textContent?.trim() || img.getAttribute("alt") || "";
    slides.push({
      src: img.getAttribute("src") || "",
      caption,
      credit: "",
      alt: img.getAttribute("alt") || "",
      origin: "body",
    });
  });
  return slides;
}

function HeroPhoto({ src }: { src: string }) {
  const { open } = useLightbox();
  return (
    <button
      type="button"
      aria-label="Open photo viewer"
      className="block w-full cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => open(0, e.currentTarget)}
    >
      <img
        src={src}
        alt="Article main image"
        className="w-full max-h-[480px] h-auto object-cover object-[50%_25%] rounded-lg aspect-[16/9]"
      />
    </button>
  );
}

function BodyWithViewer({
  html,
  firstBodySlide,
}: {
  html: string;
  firstBodySlide: number;
}) {
  const { open, slides } = useLightbox();
  return (
    <RichArticleContent
      className="article-body prose dark:prose-invert max-w-none"
      html={html}
      onImageActivate={(img, i) => {
        const src = img.getAttribute("src");
        const at = firstBodySlide + i;
        const index =
          slides[at]?.src === src
            ? at
            : slides.findIndex((s) => s.origin === "body" && s.src === src);
        if (index >= 0) open(index, img);
      }}
    />
  );
}

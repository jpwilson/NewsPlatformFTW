import { Article } from "@shared/schema";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { MessageSquare, ThumbsUp, ThumbsDown, Eye } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/date-utils";
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

export function ArticleCard({ article, variant = "horizontal" }: { article: ArticleWithSnakeCase; variant?: "horizontal" | "vertical" }) {
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

  // Use 0 as default if counts are undefined
  const likes = article.likes || 0;
  const dislikes = article.dislikes || 0;
  // Check for both camelCase and snake_case view count properties
  const views = article.viewCount || article.view_count || 0;
  const commentCount =
    article._count?.comments ||
    article.commentCount ||
    article.comment_count ||
    0;

  // Check if user has liked or disliked
  const userLiked = article.userReaction === true;
  const userDisliked = article.userReaction === false;

  // Create the article URL with slug
  const articleUrl = createSlugUrl(
    "/articles/",
    article.slug || "",
    article.id.toString()
  );

  // Check if article has an image and if images are enabled
  const images = article.images ?? [];
  const hasImage = showImages && images.length > 0;
  const firstImage = hasImage ? images[0] : null;

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
                <span>{formatDate(article.created_at || article.createdAt)}</span>
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
                {article.content.replace(/<[^>]+>/g, "")}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <span>{views}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                  <span>{likes}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                  <span>{dislikes}</span>
                </div>
                {commentCount >= 7 && (
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
                  <span>{formatDate(article.created_at || article.createdAt)}</span>
                  {article.location && <span>📍 {article.location}</span>}
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
                  {article.content.replace(/<[^>]+>/g, "")}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-2 border-t">
                  <div className="flex items-center">
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    <span>{views}</span>
                  </div>
                  <div className="flex items-center">
                    <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                    <span>{likes}</span>
                  </div>
                  <div className="flex items-center">
                    <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                    <span>{dislikes}</span>
                  </div>
                  {commentCount >= 7 && (
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
              <div className="w-1/3 relative flex-shrink-0">
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
                <span>{formatDate(article.created_at || article.createdAt)}</span>
                {article.location && <span>📍 {article.location}</span>}
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
                {article.content.replace(/<[^>]+>/g, "")}
              </p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3 pt-2 border-t">
                <div className="flex items-center">
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  <span>{views}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                  <span>{likes}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                  <span>{dislikes}</span>
                </div>
                {commentCount >= 7 && (
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
          <div className={cn("flex-1", hasImage && "w-2/3")}>
            <CardHeader>
              <div className="space-y-2">
                <Link href={articleUrl}>
                  <h3 className="text-xl font-display font-bold hover:underline cursor-pointer">
                    {article.title}
                  </h3>
                </Link>
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span>
                      {formatDate(article.created_at || article.createdAt)}
                    </span>
                    {article.location && <span>📍 {article.location}</span>}
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
                          className="px-2 py-0.5 bg-muted rounded-md text-xs"
                        >
                          🏷️ {cat.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    article.category &&
                    article.category.trim() !== "" && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-muted rounded-md text-xs">
                          🏷️ {article.category}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <p className="text-muted-foreground line-clamp-3">
                {article.content.replace(/<[^>]+>/g, "")}
              </p>
            </CardContent>

            <CardFooter>
              <div className="flex items-center gap-5">
                <div className="flex items-center text-muted-foreground">
                  <Eye className="h-4 w-4 mr-1" />
                  <span className="text-sm">{views}</span>
                </div>

                <div className="flex items-center text-muted-foreground">
                  <ThumbsUp className="h-4 w-4 mr-1" />
                  <span className="text-sm">{likes}</span>
                </div>

                <div className="flex items-center text-muted-foreground">
                  <ThumbsDown className="h-4 w-4 mr-1" />
                  <span className="text-sm">{dislikes}</span>
                </div>

                {commentCount >= 7 && (
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
    </>
  );
}

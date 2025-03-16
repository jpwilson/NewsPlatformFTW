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

// Define a more flexible type for article that accommodates both camelCase and snake_case
type ArticleWithSnakeCase = Article & {
  created_at?: string | Date;
  channel_id?: number;
  channel?: { id: number; name: string };
  likes?: number;
  dislikes?: number;
  viewCount?: number;
  view_count?: number;
  userReaction?: boolean | null;
  _count?: {
    comments?: number;
  };
};

export function ArticleCard({ article }: { article: ArticleWithSnakeCase }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  const handleChannelClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      setShowAuthDialog(true);
    } else {
      // Use either channelId or channel_id, checking for existence
      const channelId = article?.channel_id || article?.channelId;
      // Only navigate if channelId exists
      if (channelId) {
        setLocation(`/channels/${channelId}`);
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
  const commentCount = article._count?.comments || 0;

  // Check if user has liked or disliked
  const userLiked = article.userReaction === true;
  const userDisliked = article.userReaction === false;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-2">
            <Link href={`/articles/${article.id}`}>
              <h3 className="text-xl font-semibold hover:underline cursor-pointer">
                {article.title}
              </h3>
            </Link>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>
                  {formatDate(article.created_at || article.createdAt)}
                </span>
                {article.location && <span>📍 {article.location}</span>}
                {article.category && article.category.trim() !== "" && (
                  <span>🏷️ {article.category}</span>
                )}
              </div>
              <button
                onClick={handleChannelClick}
                className="text-primary hover:underline w-fit"
              >
                By: {article.channel?.name || "Unknown Channel"}
              </button>
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

            <Link href={`/articles/${article.id}#comments`}>
              <div className="flex items-center text-muted-foreground hover:text-primary hover:underline cursor-pointer">
                <MessageSquare className="h-4 w-4 mr-1" />
                <span className="text-sm">{commentCount}</span>
              </div>
            </Link>
          </div>
        </CardFooter>
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

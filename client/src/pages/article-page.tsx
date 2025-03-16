import { useQuery } from "@tanstack/react-query";
import { Article, Channel } from "@shared/schema";
import { NavigationBar } from "@/components/navigation-bar";
import { CommentSection } from "@/components/comment-section";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArticleWithSnakeCase } from "@/types/article";
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
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/date-utils";
import { useState, useEffect } from "react";
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

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  // Add edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableContent, setEditableContent] = useState("");
  const [editableCategory, setEditableCategory] = useState("");
  const [editableLocation, setEditableLocation] = useState("");

  // Local override for view count in case API response is faster than query invalidation
  const [viewCountOverride, setViewCountOverride] = useState<number | null>(
    null
  );

  const { data: article, isLoading } = useQuery<ArticleWithSnakeCase>({
    queryKey: [`/api/articles/${id}`],
  });

  // Fetch user's channels if needed for editing
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/user/channels"],
    enabled: !!user && !!isEditing,
  });

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

  // Initialize editable fields when article data is loaded
  useEffect(() => {
    if (article) {
      setEditableTitle(article.title);
      setEditableContent(article.content);
      setEditableCategory(article.category || "");
      setEditableLocation(article.location || "");
    }
  }, [article]);

  // Check if article is in draft state
  const isDraft = article?.status === "draft" || article?.published === false;

  // Increment view count when the article is loaded
  useEffect(() => {
    if (id && !isLoading && article) {
      console.log("Recording view for article:", id);
      apiRequest("POST", `/api/articles/${id}/view`, {})
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
              queryKey: [`/api/articles/${id}`],
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
  }, [id, isLoading, article]);

  const handleReaction = async (isLike: boolean) => {
    if (!user) {
      setShowAuthDialog(true);
      return;
    }

    await apiRequest("POST", `/api/articles/${id}/reactions`, { isLike });
    queryClient.invalidateQueries({ queryKey: [`/api/articles/${id}`] });
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
        setLocation(`/channels/${channelId}`);
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
        `/api/articles/${id}/toggle-status`
      );
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/articles/${id}`] });
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

  // New mutation for updating the article
  const updateArticleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/articles/${id}`, {
        title: editableTitle,
        content: editableContent,
        category: editableCategory,
        location: editableLocation,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/articles/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setIsEditing(false);
      toast({
        title: "Article updated",
        description: "Your article has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update the article.",
        variant: "destructive",
      });
    },
  });

  // Mutation for deleting the article
  const deleteArticleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/articles/${id}`);
      // Don't try to parse JSON for 204 No Content responses
      if (response.status === 204) {
        return null; // No content to parse
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setLocation("/");
      toast({
        title: "Article deleted",
        description: "The article has been deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the article.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteArticleMutation.mutate();
  };

  const handleSaveChanges = () => {
    updateArticleMutation.mutate();
  };

  const handleCancelEdit = () => {
    // Reset to original values
    if (article) {
      setEditableTitle(article.title);
      setEditableContent(article.content);
      setEditableCategory(article.category || "");
      setEditableLocation(article.location || "");
    }
    setIsEditing(false);
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
  const commentCount = article._count?.comments || 0;

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

  return (
    <>
      <div className="min-h-screen bg-background">
        <NavigationBar />

        <article className="container mx-auto p-4 lg:p-8 max-w-4xl">
          <header className="mb-8 border-b pb-6">
            <div className="flex justify-between items-start">
              {isEditing ? (
                <input
                  type="text"
                  value={editableTitle}
                  onChange={(e) => setEditableTitle(e.target.value)}
                  className="text-4xl font-bold mb-4 w-full p-2 border border-input bg-background rounded-md"
                />
              ) : (
                <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
              )}

              {/* Owner actions */}
              {isOwner && (
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSaveChanges}
                        disabled={updateArticleMutation.isPending}
                      >
                        {updateArticleMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
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
                  )}

                  {!isEditing && (
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
                  )}
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
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Only show categories if they exist and are not empty strings */}
                {article.category &&
                  article.category.trim() !== "" &&
                  article.category.toLowerCase() !== "uncategorized" && (
                    <>
                      <span className="font-medium">Categories:</span>{" "}
                      {!isEditing ? (
                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 px-3 py-1 rounded-md">
                          {capitalizeFirstLetter(article.category)}
                        </span>
                      ) : (
                        <select
                          value={editableCategory}
                          onChange={(e) => setEditableCategory(e.target.value)}
                          className="px-2 py-1 rounded-md border border-input bg-background"
                        >
                          <option value="">Select category</option>
                          <option value="politics">Politics</option>
                          <option value="technology">Technology</option>
                          <option value="sports">Sports</option>
                          <option value="health">Health</option>
                          <option value="entertainment">Entertainment</option>
                          <option value="business">Business</option>
                          <option value="science">Science</option>
                          <option value="environment">Environment</option>
                          <option value="education">Education</option>
                          <option value="other">Other</option>
                        </select>
                      )}
                    </>
                  )}

                {/* Only show location if it exists and is not empty */}
                {articleLocation && articleLocation.trim() !== "" && (
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
                )}
                {isEditing && (
                  <div className="flex items-center gap-2 ml-4">
                    <span className="font-medium">Location:</span>
                    <input
                      type="text"
                      value={editableLocation}
                      onChange={(e) => setEditableLocation(e.target.value)}
                      placeholder="Location (optional)"
                      className="px-2 py-1 rounded-md border border-input bg-background w-36"
                    />
                  </div>
                )}
              </div>
              <button
                onClick={handleChannelClick}
                className="text-primary hover:underline w-fit font-medium"
              >
                By: {article.channel?.name || "Unknown Channel"}
              </button>

              {/* Article metrics */}
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

                <div className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium">
                    {commentCount} comments
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Article content */}
          <div className="prose prose-lg max-w-none dark:prose-invert">
            {isEditing ? (
              <textarea
                value={editableContent}
                onChange={(e) => setEditableContent(e.target.value)}
                className="w-full min-h-[500px] p-4 border border-input bg-background rounded-md"
              />
            ) : (
              // Use white-space-pre-line to preserve paragraphs and text-justify for justified text
              <div
                className="whitespace-pre-line text-justify"
                dangerouslySetInnerHTML={{
                  __html: article.content.replace(/\n/g, "<br />"),
                }}
              />
            )}
          </div>

          {/* Interactive like/dislike buttons at the bottom */}
          <div className="flex items-center gap-4 my-8 border-t border-b py-6">
            <div className="text-lg font-medium mr-2">What did you think?</div>
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
          </div>

          <CommentSection articleId={article.id} />
        </article>
      </div>

      <AlertDialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Authentication Required</AlertDialogTitle>
            <AlertDialogDescription>
              You need to be logged in to{" "}
              {id ? "like or dislike articles" : "view channel details"}.
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

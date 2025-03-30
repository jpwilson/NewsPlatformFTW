import { useQuery } from "@tanstack/react-query";
import { Article, Channel } from "@shared/schema";
import { NavigationBar } from "@/components/navigation-bar";
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
  ChevronLeft,
  ChevronRight,
  X,
  Image as ImageIcon,
  ImageOff,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/date-utils";
import { useState, useEffect, useMemo } from "react";
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
import {
  HierarchicalCategorySelect,
  CategoryWithChildren,
  EnhancedAutocomplete,
  LocationWithChildren,
  MapboxLocationPicker,
  MapboxLocation,
  StandaloneLocationPicker,
} from "@/components/article-editor";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

// Define a more flexible type for article that accommodates both camelCase and snake_case
type ArticleWithSnakeCase = Article & {
  created_at?: string | Date;
  channel_id?: number;
  user_id?: number;
  title?: string;
  content?: string;
  channel?: { id: number; name: string; slug?: string };
  createdAt?: string | Date;
  lastEdited?: string | Date;
  last_edited?: string | Date;
  status?: string;
  published?: boolean;
  view_count?: number;
  viewCount?: number;
  likes?: number;
  dislikes?: number;
  userReaction?: boolean | null;
  category?: string;
  categoryId?: number;
  categoryIds?: number[];
  location?: string;
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
  slug?: string;
  categories?: Array<{ id: number; name: string; isPrimary?: boolean }>;
  _count?: {
    comments?: number;
  };
  images?: Array<{ imageUrl: string; caption?: string }>;
};

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
  const [isSaving, setIsSaving] = useState(false);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableContent, setEditableContent] = useState("");
  const [editableCategory, setEditableCategory] = useState("");
  const [editableLocation, setEditableLocation] = useState("");
  const [editableCategoryId, setEditableCategoryId] = useState<
    number | undefined
  >(undefined);
  const [editableLocationId, setEditableLocationId] = useState<
    number | undefined
  >();
  const [editableLocationName, setEditableLocationName] = useState("");
  const [editableLocationLat, setEditableLocationLat] = useState<
    number | undefined
  >();
  const [editableLocationLng, setEditableLocationLng] = useState<
    number | undefined
  >();
  const [selectedCategories, setSelectedCategories] = useState<
    { id: number; path: string }[]
  >([]);

  // Local override for view count in case API response is faster than query invalidation
  const [viewCountOverride, setViewCountOverride] = useState<number | null>(
    null
  );

  const [showImages, setShowImages] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showImageModal, setShowImageModal] = useState(false);

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

  // Fetch categories and locations when in edit mode
  const { data: categories, isLoading: isLoadingCategories } = useQuery<
    CategoryWithChildren[]
  >({
    queryKey: ["/api/categories"],
    enabled: isEditing,
  });

  // Deduplicate and process categories
  const processedCategories = useMemo(() => {
    if (!categories) return [];

    // Create a map to track seen category names at each level
    const seenCategories = new Map<string, Set<string>>();

    // Process the categories to eliminate duplicates
    const processCategories = (
      cats: CategoryWithChildren[],
      parentPath = ""
    ): CategoryWithChildren[] => {
      const result: CategoryWithChildren[] = [];
      const seenNamesAtLevel = new Set<string>();

      for (const cat of cats) {
        // Create a path key to identify this category's position in the hierarchy
        const pathKey = parentPath ? `${parentPath}/${cat.name}` : cat.name;

        // Skip if we've already seen this category name at this level
        if (seenNamesAtLevel.has(cat.name.toLowerCase())) {
          continue;
        }

        // Mark this category name as seen at this level
        seenNamesAtLevel.add(cat.name.toLowerCase());

        // Process children if any
        let processedChildren: CategoryWithChildren[] = [];
        if (cat.children && cat.children.length > 0) {
          processedChildren = processCategories(cat.children, pathKey);
        }

        // Add this category with processed children
        result.push({
          ...cat,
          children:
            processedChildren.length > 0 ? processedChildren : undefined,
        });
      }

      return result;
    };

    return processCategories(categories);
  }, [categories]);

  // Fetch locations when in edit mode
  const { data: locations, isLoading: isLoadingLocations } = useQuery<
    LocationWithChildren[]
  >({
    queryKey: ["/api/locations"],
    enabled: isEditing,
  });

  // Initialize editable fields when article data is loaded
  useEffect(() => {
    if (article) {
      setEditableTitle(article.title || "");
      setEditableContent(article.content || "");
      setEditableCategory(article.category || "");
      setEditableLocation(article.location || "");
      setEditableLocationName(article.location_name || article.location || "");
      setEditableLocationLat(article.location_lat);
      setEditableLocationLng(article.location_lng);

      // We still use categoryId and locationId for the UI component display
      // but don't send them to the API
      if (article.category) {
        // Find the category ID if possible by searching the categories
        const findCategoryId = (
          catName: string,
          cats: CategoryWithChildren[] = []
        ): number | undefined => {
          for (const cat of cats) {
            if (cat.name.toLowerCase() === catName.toLowerCase()) {
              return cat.id;
            }
            if (cat.children) {
              const childId: number | undefined = findCategoryId(
                catName,
                cat.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        if (processedCategories && processedCategories.length > 0) {
          const foundId = findCategoryId(article.category, processedCategories);
          if (foundId) {
            setEditableCategoryId(foundId);
            setSelectedCategories([
              {
                id: foundId,
                path: article.category,
              },
            ]);
          }
        }
      }

      // Similar for locations
      if (article.location && locations) {
        const findLocationId = (
          locName: string,
          locs: LocationWithChildren[] = []
        ): number | undefined => {
          for (const loc of locs) {
            if (loc.name.toLowerCase() === locName.toLowerCase()) {
              return loc.id;
            }
            if (loc.children) {
              const childId: number | undefined = findLocationId(
                locName,
                loc.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        const foundId = findLocationId(article.location, locations);
        if (foundId) {
          setEditableLocationId(foundId);
        }
      }
    }
  }, [article, processedCategories, locations]);

  // Extract all categories into a flat list for search
  const flatCategories = useMemo(() => {
    const flattenCategories = (
      items: CategoryWithChildren[] = [],
      path = ""
    ): { id: number; label: string }[] => {
      return items.flatMap((item) => {
        const label = path ? `${path} > ${item.name}` : item.name;
        return [
          { id: item.id, label },
          ...(item.children ? flattenCategories(item.children, label) : []),
        ];
      });
    };

    return processedCategories ? flattenCategories(processedCategories) : [];
  }, [processedCategories]);

  // Extract all locations into a flat list for search
  const flatLocations = useMemo(() => {
    const flattenLocations = (
      items: LocationWithChildren[] = [],
      path = ""
    ): { id: number; label: string }[] => {
      return items.flatMap((item) => {
        const label = path
          ? `${path} > ${item.name}${item.type ? ` (${item.type})` : ""}`
          : `${item.name}${item.type ? ` (${item.type})` : ""}`;
        return [
          { id: item.id, label },
          ...(item.children ? flattenLocations(item.children, label) : []),
        ];
      });
    };

    return locations ? flattenLocations(locations) : [];
  }, [locations]);

  // Check if article is in draft state
  const isDraft = article?.status === "draft" || article?.published === false;

  // Increment view count when the article is loaded
  useEffect(() => {
    if (id && !isLoading && article) {
      console.log("Recording view for article:", article.slug);
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
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", `/api/articles/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/articles/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setIsEditing(false);
      setIsSaving(false);
      toast({
        title: "Article updated",
        description: "Your article has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      setIsSaving(false);
      toast({
        title: "Error",
        description: error.message || "Failed to update the article.",
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
    setIsSaving(true);
    // Create update object with categories
    const updateData = {
      title: editableTitle,
      content: editableContent,
      category: editableCategory,
      location: editableLocationName, // Use the name from the MapboxLocationPicker
      location_name: editableLocationName,
      location_lat: editableLocationLat,
      location_lng: editableLocationLng,
      // Only include categoryIds if we actually have selections
      ...(selectedCategories.length > 0
        ? {
            categoryIds: selectedCategories.map((cat) => cat.id),
          }
        : {}),
    };

    // Make sure to properly call the mutation with the updateData object
    updateArticleMutation.mutate(updateData);
  };

  const handleCancelEdit = () => {
    // Reset to original values
    if (article) {
      setEditableTitle(article.title || "");
      setEditableContent(article.content || "");
      setEditableCategory(article.category || "");
      setEditableLocation(article.location || "");
      setEditableLocationName(article.location_name || article.location || "");
      setEditableLocationLat(article.location_lat);
      setEditableLocationLng(article.location_lng);

      // We still use categoryId and locationId for the UI component display
      // but don't send them to the API
      if (article.category) {
        // Find the category ID if possible by searching the categories
        const findCategoryId = (
          catName: string,
          cats: CategoryWithChildren[] = []
        ): number | undefined => {
          for (const cat of cats) {
            if (cat.name.toLowerCase() === catName.toLowerCase()) {
              return cat.id;
            }
            if (cat.children) {
              const childId: number | undefined = findCategoryId(
                catName,
                cat.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        if (processedCategories && processedCategories.length > 0) {
          const foundId = findCategoryId(article.category, processedCategories);
          if (foundId) {
            setEditableCategoryId(foundId);
            setSelectedCategories([
              {
                id: foundId,
                path: article.category,
              },
            ]);
          }
        }
      }

      // Similar for locations
      if (article.location && locations) {
        const findLocationId = (
          locName: string,
          locs: LocationWithChildren[] = []
        ): number | undefined => {
          for (const loc of locs) {
            if (loc.name.toLowerCase() === locName.toLowerCase()) {
              return loc.id;
            }
            if (loc.children) {
              const childId: number | undefined = findLocationId(
                locName,
                loc.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        const foundId = findLocationId(article.location, locations);
        if (foundId) {
          setEditableLocationId(foundId);
        }
      }
    }
    setIsEditing(false);
  };

  const handleNextImage = () => {
    if (!article?.images?.length) return;
    setSelectedImageIndex((prev) => (prev + 1) % article.images!.length);
  };

  const handlePrevImage = () => {
    if (!article?.images?.length) return;
    setSelectedImageIndex(
      (prev) => (prev - 1 + article.images!.length) % article.images!.length
    );
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
                {/* Show categories from either the categories array or fallback to the legacy category field */}
                {((article.categories && article.categories.length > 0) ||
                  (article.category &&
                    article.category.trim() !== "" &&
                    article.category.toLowerCase() !== "uncategorized")) && (
                  <>
                    <span className="font-medium">Categories:</span>{" "}
                    {!isEditing ? (
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
                    ) : (
                      <div className="flex-1 max-w-md">
                        <HierarchicalCategorySelect
                          categories={processedCategories || []}
                          value={editableCategoryId}
                          onChange={(id) => {
                            setEditableCategoryId(id);

                            // Find the category to set the text name for compatibility
                            const findCategory = (
                              cats: CategoryWithChildren[]
                            ): CategoryWithChildren | undefined => {
                              for (const cat of cats) {
                                if (cat.id === id) return cat;
                                if (cat.children) {
                                  const found = findCategory(cat.children);
                                  if (found) return found;
                                }
                              }
                              return undefined;
                            };

                            if (processedCategories) {
                              const selectedCategory =
                                findCategory(processedCategories);
                              if (selectedCategory) {
                                setEditableCategory(selectedCategory.name);
                              }
                            }
                          }}
                          isLoading={isLoadingCategories}
                          onSelectMultiple={(selections) => {
                            setSelectedCategories(selections);

                            // Set the primary categoryId to the first selection
                            if (selections.length > 0) {
                              setEditableCategoryId(selections[0].id);

                              // Set category name from path
                              const pathParts = selections[0].path.split(" > ");
                              if (pathParts.length > 0) {
                                setEditableCategory(
                                  pathParts[pathParts.length - 1]
                                );
                              }
                            }
                          }}
                          multipleSelections={selectedCategories}
                        />

                        <div className="mt-2">
                          <EnhancedAutocomplete
                            items={flatCategories}
                            placeholder="Search for a category..."
                            value={editableCategoryId}
                            isLoading={isLoadingCategories}
                            onSelect={(id) => {
                              setEditableCategoryId(id);

                              // Find the category
                              const findCategory = (
                                cats: CategoryWithChildren[]
                              ): CategoryWithChildren | undefined => {
                                for (const cat of cats) {
                                  if (cat.id === id) return cat;
                                  if (cat.children) {
                                    const found = findCategory(cat.children);
                                    if (found) return found;
                                  }
                                }
                                return undefined;
                              };

                              if (processedCategories) {
                                const selectedCategory =
                                  findCategory(processedCategories);
                                if (selectedCategory) {
                                  setEditableCategory(selectedCategory.name);

                                  // Find the full path for the selected category
                                  const findPath = (
                                    cats: CategoryWithChildren[],
                                    id: number,
                                    currentPath: string[] = []
                                  ): string[] | null => {
                                    for (const cat of cats) {
                                      if (cat.id === id) {
                                        return [...currentPath, cat.name];
                                      }

                                      if (cat.children) {
                                        const path = findPath(
                                          cat.children,
                                          id,
                                          [...currentPath, cat.name]
                                        );
                                        if (path) return path;
                                      }
                                    }
                                    return null;
                                  };

                                  const path = findPath(
                                    processedCategories,
                                    id
                                  );
                                  if (path) {
                                    const pathString = path.join(" > ");
                                    // Add to selected categories if not already there
                                    if (
                                      !selectedCategories.some(
                                        (s) => s.id === id
                                      )
                                    ) {
                                      const newSelections = [
                                        ...selectedCategories,
                                        { id, path: pathString },
                                      ].slice(-3);
                                      setSelectedCategories(newSelections);
                                    }
                                  }
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Only show location if it exists and is not empty AND we're not in edit mode */}
                {articleLocation &&
                articleLocation.trim() !== "" &&
                !isEditing ? (
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

                {isEditing && (
                  <div className="flex-1 mt-4 w-full">
                    <div className="border border-input rounded-md p-4 bg-card">
                      <span className="font-medium block mb-3">
                        Location (optional):
                      </span>
                      <StandaloneLocationPicker
                        value={
                          editableLocationName
                            ? {
                                location_name: editableLocationName,
                                location_lat: editableLocationLat,
                                location_lng: editableLocationLng,
                              }
                            : null
                        }
                        onChange={(value) => {
                          if (value) {
                            setEditableLocationName(value.location_name || "");
                            setEditableLocationLat(value.location_lat);
                            setEditableLocationLng(value.location_lng);
                            // For backward compatibility
                            setEditableLocation(value.location_name || "");
                          } else {
                            // Clear all location data
                            setEditableLocationName("");
                            setEditableLocationLat(undefined);
                            setEditableLocationLng(undefined);
                            setEditableLocation("");
                            setEditableLocationId(undefined);
                          }
                        }}
                        onLocationSelected={(location) => {
                          if (location) {
                            setEditableLocationName(location.place_name);
                            setEditableLocationLat(location.center[1]); // latitude
                            setEditableLocationLng(location.center[0]); // longitude
                            setEditableLocation(location.place_name);
                          }
                        }}
                        label=""
                        description="Select a location to help readers find geographically relevant content"
                      />
                    </div>
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
                  <img
                    src={article.images[0].imageUrl}
                    alt="Article main image"
                    className="w-full h-[400px] object-cover rounded-lg cursor-pointer"
                    onClick={() => {
                      setSelectedImageIndex(0);
                      setShowImageModal(true);
                    }}
                  />
                  {article.images[0].caption && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {article.images[0].caption}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Image Modal */}
          {article?.images &&
            article.images.length > 0 &&
            article.images[selectedImageIndex] && (
              <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
                <DialogContent className="max-w-4xl h-[80vh] p-0">
                  <div className="relative h-full flex flex-col">
                    <div className="absolute top-2 right-2 z-10">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowImageModal(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex-1 relative">
                      <img
                        src={article.images[selectedImageIndex].imageUrl}
                        alt={`Article image ${selectedImageIndex + 1}`}
                        className="w-full h-full object-contain"
                      />

                      {article.images.length > 1 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-2 top-1/2 transform -translate-y-1/2"
                            onClick={handlePrevImage}
                          >
                            <ChevronLeft className="h-6 w-6" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2"
                            onClick={handleNextImage}
                          >
                            <ChevronRight className="h-6 w-6" />
                          </Button>
                        </>
                      )}
                    </div>

                    {article.images[selectedImageIndex].caption && (
                      <div className="p-4 bg-background border-t">
                        <p className="text-sm text-muted-foreground">
                          {article.images[selectedImageIndex].caption}
                        </p>
                      </div>
                    )}

                    <div className="p-2 bg-background border-t flex justify-center gap-2">
                      {article.images.map((_, index) => (
                        <Button
                          key={index}
                          variant={
                            index === selectedImageIndex ? "default" : "ghost"
                          }
                          size="sm"
                          onClick={() => setSelectedImageIndex(index)}
                        >
                          {index + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

          {/* Article content */}
          <div className="prose dark:prose-invert max-w-none">
            {/* Article content */}
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

import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { NavigationBar } from "@/components/navigation-bar";
import { Channel, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  ArrowUpDown,
  PlusCircle,
  Pencil,
  Check,
  X,
  Eye,
  MessageSquare,
  ThumbsUp,
  ChevronDown,
  Camera,
  Image,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArticleWithSnakeCase } from "@/types/article";
import { formatDate } from "@/lib/date-utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AuthDialog } from "@/components/auth-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createSlugUrl } from "@/lib/slug-utils";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortField =
  | "title"
  | "createdAt"
  | "category"
  | "viewCount"
  | "commentCount"
  | "likeCount";
type SortOrder = "asc" | "desc";

// Extended Channel type that includes created_at
type ExtendedChannel = Channel & {
  created_at?: string;
  user_id?: number;
  subscriberCount?: number;
  realSubscriberCount?: number;
  isSubscribed?: boolean;
  bannerImage?: string | null;
  banner_image?: string | null;
  profileImage?: string | null;
  profile_image?: string | null;
};

export default function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [activeTab, setActiveTab] = useState("published");
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedCategory, setEditedCategory] = useState("");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const bannerImageInputRef = useRef<HTMLInputElement>(null);

  // Redirect to home if auth dialog is closed without login
  useEffect(() => {
    if (!user && !authDialogOpen) {
      setLocation("/");
    }
  }, [user, authDialogOpen, setLocation]);

  // Only show auth dialog if explicitly needed
  useEffect(() => {
    // Only show the dialog if user is null after a short delay (to allow auth to load)
    const timer = setTimeout(() => {
      if (!user) {
        setAuthDialogOpen(true);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [user]);

  // Fetch current channel
  const { data: channel, isLoading: loadingChannel, refetch: refetchChannel } =
    useQuery<ExtendedChannel>({
      queryKey: [`/api/channels/${id}`],
    });

  // Debug channel data when it changes
  useEffect(() => {
    if (channel) {
      console.log("Channel data loaded:", channel);
      console.log("created_at value:", channel.created_at);
      console.log("===== IMAGE FIELDS DEBUG =====");
      console.log("channel.bannerImage:", channel.bannerImage);
      console.log("channel.banner_image:", channel.banner_image);
      console.log("channel.profileImage:", channel.profileImage);
      console.log("channel.profile_image:", channel.profile_image);
      console.log("==============================");
    }
  }, [channel]);

  // Fetch articles for this channel
  const { data: articles, isLoading: loadingArticles } = useQuery<
    ArticleWithSnakeCase[]
  >({
    queryKey: [`/api/channels/${id}/articles`],
    select: (data) => data || [], // Ensure we always have an array
  });

  // Fetch draft articles for this channel (only for channel owner)
  const { data: drafts, isLoading: loadingDrafts } = useQuery<
    ArticleWithSnakeCase[]
  >({
    queryKey: [`/api/channels/${id}/drafts`],
    select: (data) => data || [], // Ensure we always have an array
    enabled:
      !!user &&
      !!(channel?.user_id === user?.id || channel?.userId === user?.id),
  });

  // Fetch all channels owned by the current user
  const { data: userChannels, isLoading: loadingUserChannels } = useQuery<
    Channel[]
  >({
    queryKey: ["/api/channels"],
    select: (channels) => channels.filter((c) => c.userId === user?.id),
    enabled: !!user, // Only run if user is logged in
  });

  // Fetch user's subscriptions to determine if subscribed to this channel
  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery<
    Channel[]
  >({
    queryKey: ["/api/user/subscriptions"],
    enabled: !!user, // Only run if user is logged in
  });

  // Fetch channel owner information
  const { data: ownerInfo, isLoading: loadingOwner, error: ownerError } = useQuery<
    Omit<User, "password">
  >({
    queryKey: [`/api/users/${channel?.user_id || channel?.userId}`],
    enabled: !!(channel?.user_id || channel?.userId),
  });
  
  // Debug owner info
  useEffect(() => {
    if (channel) {
      console.log("Channel owner ID:", channel?.user_id || channel?.userId);
    }
    if (ownerInfo) {
      console.log("Owner info fetched:", ownerInfo);
    }
    if (ownerError) {
      console.error("Error fetching owner info:", ownerError);
    }
  }, [channel, ownerInfo, ownerError]);


  const isOwner = user?.id === (channel?.user_id || channel?.userId);
  // Use the server-provided isSubscribed flag from channel data when available
  // Fall back to client-side calculation if not present (backwards compatibility)
  const isSubscribed =
    channel?.isSubscribed !== undefined
      ? channel.isSubscribed
      : subscriptions?.some((sub: Channel) => sub.id === Number(id)) || false;

  // Debug subscription state
  useEffect(() => {
    if (channel) {
      console.log("Subscription state:", {
        isSubscribed,
        channelIsSubscribed: channel.isSubscribed,
        clientDerived:
          subscriptions?.some((sub: Channel) => sub.id === Number(id)) || false,
      });
    }
  }, [channel, subscriptions, id, isSubscribed]);

  // Initialize edit form fields when channel data is loaded
  useEffect(() => {
    if (channel) {
      setEditedName(channel.name);
      setEditedDescription(channel.description);
      setEditedCategory(channel.category || "");
    }
  }, [channel]);

  // Handle profile image upload
  const handleProfileImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingProfileImage(true);
    try {
      if (!supabase?.storage) {
        throw new Error("Storage service is not available");
      }

      // Create sanitized filename
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filename = `channels/${id}/profile_${timestamp}_${sanitizedFilename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("article-images")
        .upload(filename, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      // Get signed URL (valid for 1 year)
      const { data: urlData } = await supabase.storage
        .from("article-images")
        .createSignedUrl(uploadData.path, 31536000);

      let imageUrl: string;
      if (!urlData?.signedUrl) {
        // Fallback to regular public URL if signed URL fails
        const { data: { publicUrl } } = supabase.storage
          .from("article-images")
          .getPublicUrl(uploadData.path);
        imageUrl = publicUrl;
      } else {
        imageUrl = urlData.signedUrl;
      }

      console.log("Profile upload - uploadData.path:", uploadData.path);
      console.log("Profile upload - imageUrl:", imageUrl);

      // Update channel with new profile image
      const response = await apiRequest("PATCH", `/api/channels/${id}`, {
        profileImage: imageUrl
      });

      if (!response.ok) {
        throw new Error("Failed to update channel");
      }

      const updatedChannelData = await response.json();
      console.log("Profile upload - API response:", updatedChannelData);
      console.log("Profile upload - response profileImage:", updatedChannelData.profileImage);
      console.log("Profile upload - response profile_image:", updatedChannelData.profile_image);

      // Force refetch channel data
      const refetchResult = await refetchChannel();
      console.log("Profile upload - refetched channel:", refetchResult.data);

      toast({
        title: "Profile image updated",
        description: "Your channel's profile image has been updated successfully.",
      });
    } catch (error) {
      console.error("Error uploading profile image:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload profile image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingProfileImage(false);
    }
  };

  // Handle banner image upload
  const handleBannerImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingBannerImage(true);
    try {
      if (!supabase?.storage) {
        throw new Error("Storage service is not available");
      }

      // Create sanitized filename
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filename = `channels/${id}/banner_${timestamp}_${sanitizedFilename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("article-images")
        .upload(filename, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      // Get signed URL (valid for 1 year)
      const { data: urlData } = await supabase.storage
        .from("article-images")
        .createSignedUrl(uploadData.path, 31536000);

      let imageUrl: string;
      if (!urlData?.signedUrl) {
        // Fallback to regular public URL if signed URL fails
        const { data: { publicUrl } } = supabase.storage
          .from("article-images")
          .getPublicUrl(uploadData.path);
        imageUrl = publicUrl;
      } else {
        imageUrl = urlData.signedUrl;
      }

      console.log("Banner upload - uploadData.path:", uploadData.path);
      console.log("Banner upload - imageUrl:", imageUrl);

      // Update channel with new banner image
      const response = await apiRequest("PATCH", `/api/channels/${id}`, {
        bannerImage: imageUrl
      });

      if (!response.ok) {
        throw new Error("Failed to update channel");
      }

      const updatedChannelData = await response.json();
      console.log("Banner upload - API response:", updatedChannelData);
      console.log("Banner upload - response bannerImage:", updatedChannelData.bannerImage);
      console.log("Banner upload - response banner_image:", updatedChannelData.banner_image);

      // Force refetch channel data
      const refetchResult = await refetchChannel();
      console.log("Banner upload - refetched channel:", refetchResult.data);

      toast({
        title: "Banner image updated",
        description: "Your channel's banner image has been updated successfully.",
      });
    } catch (error) {
      console.error("Error uploading banner image:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload banner image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploadingBannerImage(false);
    }
  };

  // Update channel mutation
  const updateChannelMutation = useMutation({
    mutationFn: async () => {
      // Use the ID/slug directly from the URL
      const response = await apiRequest("PATCH", `/api/channels/${id}`, {
        name: editedName,
        description: editedDescription,
        category: editedCategory || null,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setIsEditing(false);
      toast({
        title: "Channel updated",
        description: "Your channel has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update the channel.",
        variant: "destructive",
      });
    },
  });

  const handleSaveChanges = () => {
    updateChannelMutation.mutate();
  };

  const handleCancelEdit = () => {
    // Reset to original values
    if (channel) {
      setEditedName(channel.name);
      setEditedDescription(channel.description);
      setEditedCategory(channel.category || "");
    }
    setIsEditing(false);
  };

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const handleChannelChange = (channelId: string) => {
    // Find the selected channel to get its slug
    const selectedChannel = userChannels?.find(
      (c) => c.id.toString() === channelId
    );
    const channelSlug = selectedChannel?.slug || "";
    setLocation(createSlugUrl("/channels/", channelSlug, channelId));
  };

  // Sort published articles
  const sortedArticles = articles?.slice().sort((a, b) => {
    const multiplier = sortOrder === "asc" ? 1 : -1;
    if (sortField === "createdAt") {
      const dateA =
        a.createdAt || a.created_at
          ? new Date(a.createdAt || a.created_at!).getTime()
          : 0;
      const dateB =
        b.createdAt || b.created_at
          ? new Date(b.createdAt || b.created_at!).getTime()
          : 0;
      return multiplier * (dateA - dateB);
    } else if (sortField === "viewCount") {
      const viewsA = Number(a.viewCount || a.view_count || 0);
      const viewsB = Number(b.viewCount || b.view_count || 0);
      return multiplier * (viewsA - viewsB);
    } else if (sortField === "commentCount") {
      const commentsA = Number(
        a.commentCount || a.comment_count || a._count?.comments || 0
      );
      const commentsB = Number(
        b.commentCount || b.comment_count || b._count?.comments || 0
      );
      return multiplier * (commentsA - commentsB);
    } else if (sortField === "likeCount") {
      const likesA = Number(
        a.likeCount || a.like_count || a.likes || a._count?.likes || 0
      );
      const likesB = Number(
        b.likeCount || b.like_count || b.likes || b._count?.likes || 0
      );
      return multiplier * (likesA - likesB);
    }
    const aValue = a[sortField] || "";
    const bValue = b[sortField] || "";
    return multiplier * (aValue < bValue ? -1 : 1);
  });

  // Sort draft articles
  const sortedDrafts = drafts?.slice().sort((a, b) => {
    // Get the correct creation date from either camelCase or snake_case property
    const dateA = a.createdAt || a.created_at;
    const dateB = b.createdAt || b.created_at;

    // Sort by the selected field
    switch (sortField) {
      case "title":
        if (sortOrder === "asc") {
          return a.title.localeCompare(b.title);
        }
        return b.title.localeCompare(a.title);
      case "category":
        if (sortOrder === "asc") {
          return a.category.localeCompare(b.category);
        }
        return b.category.localeCompare(a.category);
      case "viewCount":
        const viewsA = Number(a.viewCount || a.view_count || 0);
        const viewsB = Number(b.viewCount || b.view_count || 0);
        return sortOrder === "asc" ? viewsA - viewsB : viewsB - viewsA;
      case "commentCount":
        const commentsA = Number(
          a.commentCount || a.comment_count || a._count?.comments || 0
        );
        const commentsB = Number(
          b.commentCount || b.comment_count || b._count?.comments || 0
        );
        return sortOrder === "asc"
          ? commentsA - commentsB
          : commentsB - commentsA;
      case "likeCount":
        const likesA = Number(
          a.likeCount || a.like_count || a.likes || a._count?.likes || 0
        );
        const likesB = Number(
          b.likeCount || b.like_count || b.likes || b._count?.likes || 0
        );
        return sortOrder === "asc" ? likesA - likesB : likesB - likesA;
      case "createdAt":
      default:
        if (sortOrder === "asc") {
          return (
            new Date(dateA || 0).getTime() - new Date(dateB || 0).getTime()
          );
        }
        return new Date(dateB || 0).getTime() - new Date(dateA || 0).getTime();
    }
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/channels/${id}/subscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${id}`] });
      toast({
        title: "Subscribed",
        description: `You are now subscribed to ${channel?.name}`,
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${id}/subscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/channels/${id}`] });
      toast({
        title: "Unsubscribed",
        description: `You have unsubscribed from ${channel?.name}`,
      });
    },
  });

  // Render published articles
  const renderArticles = (
    articles: ArticleWithSnakeCase[] | undefined,
    isDrafts = false
  ) => {
    if (!articles || articles.length === 0) {
      return (
        <div className="text-center p-4 text-muted-foreground">
          {isDrafts ? "No draft articles found." : "No articles published yet."}
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer"
              onClick={() => handleSort("title")}
            >
              Title{" "}
              <ArrowUpDown
                className={cn(
                  "ml-2 h-4 w-4 inline",
                  sortField === "title" ? "opacity-100" : "opacity-50"
                )}
              />
            </TableHead>
            <TableHead
              className="cursor-pointer"
              onClick={() => handleSort("createdAt")}
            >
              Date{" "}
              <ArrowUpDown
                className={cn(
                  "ml-2 h-4 w-4 inline",
                  sortField === "createdAt" ? "opacity-100" : "opacity-50"
                )}
              />
            </TableHead>
            <TableHead
              className="cursor-pointer"
              onClick={() => handleSort("category")}
            >
              Category{" "}
              <ArrowUpDown
                className={cn(
                  "ml-2 h-4 w-4 inline",
                  sortField === "category" ? "opacity-100" : "opacity-50"
                )}
              />
            </TableHead>
            <TableHead
              className="cursor-pointer text-right hidden md:table-cell"
              onClick={() => handleSort("viewCount")}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Eye
                      className={cn(
                        "ml-2 h-4 w-4 inline",
                        sortField === "viewCount" ? "opacity-100" : "opacity-50"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Views</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead
              className="cursor-pointer text-right hidden md:table-cell"
              onClick={() => handleSort("commentCount")}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <MessageSquare
                      className={cn(
                        "ml-2 h-4 w-4 inline",
                        sortField === "commentCount"
                          ? "opacity-100"
                          : "opacity-50"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Comments</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead
              className="cursor-pointer text-right hidden md:table-cell"
              onClick={() => handleSort("likeCount")}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <ThumbsUp
                      className={cn(
                        "ml-2 h-4 w-4 inline",
                        sortField === "likeCount" ? "opacity-100" : "opacity-50"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Likes</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(isDrafts ? drafts : sortedArticles)?.map((article) => (
            <TableRow key={article.id}>
              <TableCell>
                <Link
                  href={createSlugUrl(
                    "/articles/",
                    article.slug || "",
                    article.id.toString()
                  )}
                  className="hover:underline text-primary"
                >
                  {article.title}
                </Link>
                {isDrafts && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Draft)
                  </span>
                )}
              </TableCell>
              <TableCell>
                {formatDate(
                  article.createdAt || article.created_at || new Date()
                )}
              </TableCell>
              <TableCell>{capitalizeFirstLetter(article.category)}</TableCell>
              <TableCell className="text-right hidden md:table-cell">
                {article.viewCount || article.view_count || 0}
              </TableCell>
              <TableCell className="text-right hidden md:table-cell">
                {article.commentCount ||
                  article.comment_count ||
                  article._count?.comments ||
                  0}
              </TableCell>
              <TableCell className="text-right hidden md:table-cell">
                {article.likes || 0}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  if (
    loadingChannel ||
    loadingArticles ||
    (user && loadingUserChannels) ||
    (user && loadingSubscriptions) ||
    loadingOwner
  ) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="flex justify-center items-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="container mx-auto p-4 lg:p-8">
          <div className="text-center">Channel not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar selectedChannelId={id} />

      {/* Auth Dialog for non-logged in users */}
      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        description="You need to be logged in to view channel details."
      />

      {/* Only show channel content to logged in users */}
      {user && (
        <div className="w-full">
          {/* Banner Image */}
          <div className="relative w-full h-48 lg:h-64 bg-gradient-to-br from-primary/20 to-primary/5">
            {channel.bannerImage ? (
              <img
                src={channel.bannerImage}
                alt={`${channel.name} banner`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground/50">
                  <Image className="h-12 w-12 mx-auto mb-2" />
                  <p className="text-sm">No banner image</p>
                </div>
              </div>
            )}
            
            {/* Profile Image Overlay */}
            <div className="absolute -bottom-12 left-4 lg:left-8">
              <Avatar className="h-24 w-24 border-4 border-background shadow-xl">
                <AvatarImage src={channel.profileImage || undefined} alt={channel.name} />
                <AvatarFallback className="bg-primary/10 text-2xl font-bold">
                  {channel.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>

          {/* Content Container */}
          <div className="container mx-auto px-4 pt-16 pb-6">
          <div className="grid lg:grid-cols-[2fr_1fr] gap-8">
            <div>
              <div className="flex justify-between items-start mb-8">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-4 w-full max-w-[800px]">
                      <div>
                        <Label htmlFor="channel-name">Channel Name</Label>
                        <Input
                          id="channel-name"
                          type="text"
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <Label htmlFor="channel-description">Description</Label>
                        <Textarea
                          id="channel-description"
                          value={editedDescription}
                          onChange={(e) => setEditedDescription(e.target.value)}
                          className="w-full"
                          rows={12}
                          maxLength={800}
                        />
                        <div className="flex justify-end mt-1 text-xs">
                          <span
                            className={`${
                              editedDescription.length > 750
                                ? editedDescription.length >= 800
                                  ? "text-red-500 font-bold"
                                  : "text-amber-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {editedDescription.length}/800 chars
                          </span>
                        </div>
                      </div>
                      
                      {/* Profile Image Upload */}
                      <div>
                        <Label>Profile Image</Label>
                        <div className="flex items-center gap-4 mt-2">
                          <Avatar className="h-20 w-20">
                            <AvatarImage src={channel.profileImage || undefined} alt={channel.name} />
                            <AvatarFallback className="bg-primary/10">
                              {channel.name.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <input
                              ref={profileImageInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                              onChange={handleProfileImageUpload}
                              className="hidden"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => profileImageInputRef.current?.click()}
                              disabled={uploadingProfileImage}
                            >
                              {uploadingProfileImage ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <Camera className="h-4 w-4 mr-2" />
                              )}
                              Change Profile Image
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Banner Image Upload */}
                      <div>
                        <Label>Banner Image</Label>
                        <div className="mt-2">
                          <div className="relative w-full h-32 bg-gradient-to-br from-primary/20 to-primary/5 rounded-lg overflow-hidden">
                            {channel.bannerImage ? (
                              <img
                                src={channel.bannerImage}
                                alt="Banner preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <div className="text-center text-muted-foreground/50">
                                  <Image className="h-8 w-8 mx-auto mb-1" />
                                  <p className="text-xs">No banner image</p>
                                </div>
                              </div>
                            )}
                          </div>
                          <input
                            ref={bannerImageInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                            onChange={handleBannerImageUpload}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => bannerImageInputRef.current?.click()}
                            disabled={uploadingBannerImage}
                          >
                            {uploadingBannerImage ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Camera className="h-4 w-4 mr-2" />
                            )}
                            Change Banner Image
                          </Button>
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="channel-category">
                          Category (optional)
                        </Label>
                        <Input
                          id="channel-category"
                          type="text"
                          value={editedCategory}
                          onChange={(e) => setEditedCategory(e.target.value)}
                          className="w-full"
                          placeholder="e.g. Technology, Sports, News"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h1 className="text-4xl font-bold mb-2">
                        {channel.name}
                      </h1>
                      {channel.created_at && (
                        <p className="text-sm text-muted-foreground mb-2">
                          Created on {formatDate(channel.created_at)}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        {channel.description}
                      </p>
                      {channel.category && (
                        <div className="mt-2">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {channel.category}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-2">
                  {isOwner &&
                    (isEditing ? (
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          onClick={handleSaveChanges}
                          disabled={updateChannelMutation.isPending}
                        >
                          {updateChannelMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Check className="h-4 w-4 mr-2" />
                          )}
                          Save
                        </Button>
                        <Button variant="outline" onClick={handleCancelEdit}>
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => setIsEditing(true)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Channel
                      </Button>
                    ))}

                  {!isOwner &&
                    user &&
                    !isEditing &&
                    (!isSubscribed ? (
                      <Button
                        variant="default"
                        onClick={() => subscribeMutation.mutate()}
                        disabled={subscribeMutation.isPending}
                      >
                        {subscribeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Subscribe
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="flex items-center gap-1 bg-primary-foreground border-primary-foreground"
                          >
                            <span className="text-primary font-medium">
                              Subscribed
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive cursor-pointer"
                            onClick={() => unsubscribeMutation.mutate()}
                            disabled={unsubscribeMutation.isPending}
                          >
                            {unsubscribeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Unsubscribe
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ))}
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Articles</h2>
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <Link href={`/channels/${id}/articles/new`}>
                      <Button variant="default">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        New Article
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList>
                  <TabsTrigger value="published">Published</TabsTrigger>
                  {isOwner && <TabsTrigger value="drafts">Drafts</TabsTrigger>}
                </TabsList>

                <TabsContent
                  value="published"
                  className="rounded-lg border bg-card mt-2"
                >
                  {renderArticles(articles)}
                </TabsContent>

                {isOwner && (
                  <TabsContent
                    value="drafts"
                    className="rounded-lg border bg-card mt-2"
                  >
                    {renderArticles(drafts, true)}
                  </TabsContent>
                )}
              </Tabs>
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border bg-card p-6">
                <h2 className="text-xl font-semibold mb-4">Channel Stats</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold">
                      {articles?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Articles
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {channel?.subscriberCount || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Subscribers
                    </div>
                  </div>
                  <div className="col-span-2 mt-3 border-t pt-3">
                    <div className="text-sm mt-2">
                      <span className="text-muted-foreground">Created by</span>{" "}
                      {ownerInfo?.username ? (
                        <Link
                          href={`/users/${ownerInfo.username}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {ownerInfo.username}
                        </Link>
                      ) : loadingOwner ? (
                        <span className="text-muted-foreground">Loading...</span>
                      ) : (
                        <span className="text-muted-foreground">Unknown User</span>
                      )}
                    </div>
                    <div className="text-sm mt-1">
                      <span className="text-muted-foreground">
                        Creation date:
                      </span>{" "}
                      <span className="font-medium">
                        {channel && channel.created_at
                          ? formatDate(channel.created_at)
                          : "Not available"}
                      </span>
                    </div>
                    {isSubscribed && !isOwner && (
                      <div className="text-sm mt-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <span className="text-primary hover:underline cursor-pointer flex items-center gap-1">
                              Subscribed
                              <ChevronDown className="h-3 w-3 opacity-70" />
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive cursor-pointer"
                              onClick={() => unsubscribeMutation.mutate()}
                              disabled={unsubscribeMutation.isPending}
                            >
                              {unsubscribeMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : null}
                              Unsubscribe from channel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isOwner && (
                <div className="rounded-lg border bg-card p-6">
                  <h2 className="text-xl font-semibold mb-4">
                    Channel Settings
                  </h2>
                  <div className="flex flex-col space-y-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setLocation(`/channels/${id}/subscribers`)}
                    >
                      Manage Subscribers
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                      onClick={() =>
                        toast({
                          title: "Coming soon",
                          description:
                            "Channel analytics feature is coming soon!",
                        })
                      }
                    >
                      Channel Analytics
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to capitalize the first letter of a string
function capitalizeFirstLetter(string: string | undefined) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

import { useAuth } from "@/hooks/use-auth";
import { NavigationBar } from "@/components/navigation-bar";
import { Redirect, Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Channel, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Pencil,
  Check,
  Search,
  Filter,
  X,
  ArrowUpDown,
  Users,
  Calendar,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getQueryFn } from "../lib/queryClient";

// Extended User type to include created_at
type ExtendedUser = User & {
  created_at?: string | null;
  description?: string | null;
};

// Extended Channel type to include subscription info
type SubscribedChannel = Channel & {
  subscriberCount?: number;
  subscriptionDate?: string | null;
};

// Sort options
type SortField = "name" | "subscriberCount" | "subscriptionDate";
type SortDirection = "asc" | "desc";

// Define the type for the debug endpoint response
interface DebugChannelsResponse {
  success: boolean;
  message: string;
  count: number;
  channels: Channel[];
}

// Define a type for the debug subscriptions response
interface DebugSubscriptionsResponse {
  success: boolean;
  message: string;
  count: number;
  subscriptions: Array<{
    id: number;
    channel: Channel | null;
    channelId: number;
  }>;
}

// Helper function to format date safely
const formatDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return "N/A";
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (e) {
    return "Invalid date";
  }
};

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState("");
  const MAX_DESCRIPTION_LENGTH = 300;
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [sortField, setSortField] = useState<SortField>("subscriptionDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Initialize all hooks first, even if user is not logged in
  // This ensures consistent hook usage regardless of auth state

  // Determine if viewing own profile or another user's profile
  const isOwnProfile = user && (!userId || userId === user.id.toString());

  // Fetch profile data (either current user or another user)
  const { data: profileUser, isLoading: loadingProfile } =
    useQuery<ExtendedUser>({
      queryKey: ["/api/users", isOwnProfile ? user?.id : userId],
      initialData: isOwnProfile ? (user as ExtendedUser) : undefined,
      enabled: !!user && (!isOwnProfile || !!userId),
    });

  // Fetch user's subscribed channels
  const { data: subscribedChannels, isLoading: loadingSubscriptions } =
    useQuery<SubscribedChannel[]>({
      queryKey: [
        isOwnProfile
          ? "/api/user/subscriptions"
          : `/api/users/${userId}/subscriptions`,
      ],
      enabled: !!user && !!isOwnProfile, // Only fetch subscriptions for own profile when user is logged in
    });

  // Fetch all channels created by this user
  const { data: ownedChannels, isLoading: loadingOwnedChannels } = useQuery<
    Channel[]
  >({
    queryKey: ["/api/channels"],
    select: (channels) =>
      channels?.filter(
        (c) => c.userId === (isOwnProfile ? user?.id : parseInt(userId || "0"))
      ) || [],
    enabled: !!user && !!isOwnProfile, // Only fetch owned channels for own profile when user is logged in
  });

  // Add direct API query for owned channels (for debugging in Vercel)
  const { data: debugChannelsData, isLoading: loadingDebugChannels } =
    useQuery<DebugChannelsResponse>({
      queryKey: ["/api/debug/channels", user?.id],
      queryFn: async () => {
        const response = await fetch(`/api/debug/channels?userId=${user?.id}`);
        if (!response.ok) {
          throw new Error(`Error fetching debug channels: ${response.status}`);
        }
        return response.json() as Promise<DebugChannelsResponse>;
      },
      enabled: isOwnProfile && !!user ? true : false,
    });

  // Add direct API query for user subscriptions (for debugging in Vercel)
  const { data: debugSubscriptionsData, isLoading: loadingDebugSubscriptions } =
    useQuery<DebugSubscriptionsResponse>({
      queryKey: ["/api/debug/subscriptions", user?.id],
      queryFn: async () => {
        const response = await fetch(
          `/api/debug/subscriptions?userId=${user?.id}`
        );
        if (!response.ok) {
          throw new Error(
            `Error fetching debug subscriptions: ${response.status}`
          );
        }
        return response.json() as Promise<DebugSubscriptionsResponse>;
      },
      enabled: isOwnProfile && !!user ? true : false,
    });

  // Combine owned channels from both sources
  const combinedOwnedChannels = useMemo(() => {
    if (ownedChannels?.length) {
      return ownedChannels;
    }
    if (debugChannelsData && "channels" in debugChannelsData) {
      return debugChannelsData.channels || [];
    }
    return [];
  }, [ownedChannels, debugChannelsData]);

  // Combine subscriptions from both sources
  const combinedSubscribedChannels = useMemo(() => {
    if (subscribedChannels?.length) {
      return subscribedChannels;
    }

    // Add a type check for debugSubscriptionsData
    if (
      debugSubscriptionsData &&
      typeof debugSubscriptionsData === "object" &&
      "subscriptions" in debugSubscriptionsData &&
      Array.isArray(debugSubscriptionsData.subscriptions)
    ) {
      // Map the debug subscriptions to match the expected SubscribedChannel format
      // Filter out any invalid subscriptions or those without channel data
      return debugSubscriptionsData.subscriptions
        .filter(
          (sub: any) =>
            sub &&
            sub.channel !== null &&
            typeof sub.channel === "object" &&
            sub.channel.id
        )
        .map((sub: any) => ({
          ...sub.channel,
          subscriberCount: 0, // We don't have this info in the debug response
          subscriptionDate: sub.subscriptionDate || new Date().toISOString(), // Use provided date or current date as fallback
        })) as SubscribedChannel[];
    }

    return [];
  }, [subscribedChannels, debugSubscriptionsData]);

  // Initialize description state from user data when available
  useEffect(() => {
    if (profileUser?.description) {
      setDescription(profileUser.description);
    }
  }, [profileUser?.description]);

  // Update description mutation
  const updateDescriptionMutation = useMutation({
    mutationFn: async (newDescription: string) => {
      if (!user) throw new Error("Not authenticated");

      const res = await apiRequest("PATCH", `/api/users/${user.id}`, {
        description: newDescription,
      });

      if (!res.ok) {
        throw new Error("Failed to update description");
      }

      return await res.json();
    },
    onSuccess: () => {
      if (!user) return;

      queryClient.invalidateQueries({ queryKey: ["/api/users", user.id] });
      setIsEditingDescription(false);
      toast({
        title: "Profile updated",
        description: "Your description has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveDescription = () => {
    updateDescriptionMutation.mutate(description);
  };

  // Toggle sort direction or change sort field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new field and default to descending
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Update the filteredAndSortedChannels reference to use the combined data
  const filteredAndSortedChannels = useMemo(() => {
    if (!combinedSubscribedChannels.length) return [];

    // First filter by search query
    const filtered = combinedSubscribedChannels.filter((channel) => {
      return (
        !searchQuery ||
        channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        channel.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

    // Then sort by the selected field and direction
    return filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === "name") {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === "subscriberCount") {
        const countA = a.subscriberCount || 0;
        const countB = b.subscriberCount || 0;
        comparison = countA - countB;
      } else if (sortField === "subscriptionDate") {
        const dateA = a.subscriptionDate
          ? new Date(a.subscriptionDate).getTime()
          : 0;
        const dateB = b.subscriptionDate
          ? new Date(b.subscriptionDate).getTime()
          : 0;
        comparison = dateA - dateB;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [combinedSubscribedChannels, searchQuery, sortField, sortDirection]);

  // Add debug endpoint fallback for subscriptions
  useEffect(() => {
    const checkSubscriptionsAndChannels = async () => {
      if (!user || !isOwnProfile) return;

      if (!subscribedChannels && !loadingSubscriptions) {
        console.log("Subscriptions failed to load, try debug API instead");

        try {
          // Use the more precise debug subscriptions endpoint instead of channels
          const response = await fetch(
            `/api/debug/subscriptions?userId=${user.id}`
          );
          const data = await response.json();
          console.log("Debug subscriptions endpoint result:", data);

          if (data.success && data.subscriptions?.length) {
            toast({
              title: "Subscriptions found!",
              description: `Found ${data.subscriptions.length} subscription(s) via debug endpoint.`,
              variant: "default",
            });

            // We don't need to manually update the state since the useQuery for
            // debugSubscriptionsData will handle this data automatically
          } else if (data.diagnostic) {
            console.log(
              "Diagnostic info from debug endpoint:",
              data.diagnostic
            );
          }
        } catch (error) {
          console.error("Failed to fetch debug subscription data:", error);
        }
      }
    };

    checkSubscriptionsAndChannels();
  }, [user, isOwnProfile, subscribedChannels, loadingSubscriptions, toast]);

  // Now the redirect - after all hooks are defined
  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Check for loading state
  const isLoading =
    loadingProfile ||
    (isOwnProfile &&
      (loadingSubscriptions ||
        loadingOwnedChannels ||
        loadingDebugSubscriptions));

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!profileUser && !isOwnProfile) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="text-center">User not found</div>
        </div>
      </div>
    );
  }

  const displayUser = profileUser || (user as ExtendedUser);

  // Add error handling
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              Error Loading Profile
            </h2>
            <p className="text-red-600">{error.message}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setLocation("/")}
            >
              Return to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Check if we need to show the "My Channels" section
  const showMyChannelsSection =
    isOwnProfile && combinedOwnedChannels.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      <div className="container max-w-4xl mx-auto py-8 px-4">
        {/* Profile Header Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{displayUser.username}</h1>
          <p className="text-muted-foreground mb-6">
            Member since{" "}
            {displayUser.created_at
              ? formatDate(displayUser.created_at)
              : "Date not available"}
          </p>

          <div className="mt-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-1">
              About
            </h2>
            {isEditingDescription ? (
              <div className="space-y-2">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="resize-none"
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  placeholder="Write a short bio about yourself..."
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {description.length}/{MAX_DESCRIPTION_LENGTH} characters
                  </span>
                  <div className="space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDescription(displayUser.description || "");
                        setIsEditingDescription(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveDescription}
                      disabled={updateDescriptionMutation.isPending}
                    >
                      {updateDescriptionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative group">
                <p className="text-base">
                  {displayUser.description || "No description provided"}
                </p>
                {isOwnProfile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setIsEditingDescription(true)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Only show Subscriptions section on own profile */}
          {isOwnProfile && (
            <Card>
              <CardHeader>
                <CardTitle>Channel Subscriptions</CardTitle>
                <CardDescription>
                  You are currently subscribed to{" "}
                  {combinedSubscribedChannels?.length || 0} channel
                  {combinedSubscribedChannels?.length !== 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!combinedSubscribedChannels?.length ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Not yet subscribed to any channels
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Search channels..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="max-w-sm"
                        />
                      </div>

                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead
                              className="w-[45%] cursor-pointer hover:bg-gray-50"
                              onClick={() => handleSort("name")}
                            >
                              <div className="flex items-center">
                                Channel Name
                                {sortField === "name" && (
                                  <ArrowUpDown
                                    className={`ml-1 h-4 w-4 ${
                                      sortDirection === "asc"
                                        ? "rotate-180"
                                        : ""
                                    }`}
                                  />
                                )}
                              </div>
                            </TableHead>
                            <TableHead className="w-[40%]">
                              Description
                            </TableHead>
                            <TableHead
                              className="w-[8%] cursor-pointer hover:bg-gray-50 text-center"
                              onClick={() => handleSort("subscriberCount")}
                            >
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center">
                                      <Users className="h-4 w-4" />
                                      {sortField === "subscriberCount" && (
                                        <ArrowUpDown
                                          className={`ml-1 h-4 w-4 ${
                                            sortDirection === "asc"
                                              ? "rotate-180"
                                              : ""
                                          }`}
                                        />
                                      )}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Number of subscribers</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableHead>
                            <TableHead className="w-[7%]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredAndSortedChannels.map((channel) => (
                            <TableRow key={channel.id}>
                              <TableCell className="font-medium">
                                {channel.name}
                              </TableCell>
                              <TableCell className="truncate max-w-[200px]">
                                {channel.description}
                              </TableCell>
                              <TableCell className="text-center">
                                {channel.subscriberCount || 0}
                              </TableCell>
                              <TableCell className="text-right">
                                <Link href={`/channels/${channel.id}`}>
                                  <Button variant="outline" size="sm">
                                    View
                                  </Button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {filteredAndSortedChannels.length === 0 &&
                        searchQuery && (
                          <div className="text-center py-4 text-muted-foreground">
                            No channels match your search criteria
                          </div>
                        )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Always show My Channels section for logged in users */}
          {isOwnProfile && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>My Channels</CardTitle>
                  <CardDescription>
                    {combinedOwnedChannels.length > 0 ? (
                      <>
                        Channels you have created{" "}
                        <span className="font-medium">
                          {combinedOwnedChannels.length} out of 10
                        </span>{" "}
                        <span className="text-xs text-muted-foreground">
                          (max 10)
                        </span>
                      </>
                    ) : (
                      <>
                        Want to become a journalist or share interesting news?
                        Create your own channel!
                      </>
                    )}
                  </CardDescription>
                </div>
                <div className="flex space-x-2">
                  <Link href="/channels/new">
                    <Button
                      disabled={Boolean(
                        combinedOwnedChannels &&
                          combinedOwnedChannels.length >= 10
                      )}
                    >
                      Create{combinedOwnedChannels.length > 0 ? " Another" : ""}{" "}
                      Channel
                    </Button>
                  </Link>
                  <Link href="/articles/new">
                    <Button>Write Article</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {combinedOwnedChannels.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Channel Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-[8%] text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center justify-center">
                                  <Users className="h-4 w-4" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Number of subscribers</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinedOwnedChannels.map((channel: Channel) => (
                        <TableRow key={channel.id}>
                          <TableCell className="font-medium">
                            <Link href={`/channels/${channel.id}`}>
                              {channel.name}
                            </Link>
                          </TableCell>
                          <TableCell className="truncate max-w-[200px]">
                            {channel.description}
                          </TableCell>
                          <TableCell className="text-center">
                            {(channel as any).subscriberCount || 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/channels/${channel.id}/edit`}>
                              <Button variant="ghost" size="icon">
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit Channel</span>
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="mb-4">
                      Create your first channel to start sharing news and
                      stories that matter to you.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useAuth } from "@/hooks/use-auth";
import { NavigationBar } from "@/components/navigation-bar";
import { useParams, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { User, Channel } from "@shared/schema";
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
  ArrowLeft,
  Search,
  UserRound,
  Calendar,
  ArrowUpDown,
  Users,
  RefreshCw,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { fetchChannelSubscribers } from "@/queries/channel-queries";
import { useToast } from "@/hooks/use-toast";

// Subscriber type that includes subscription date and channel count
type Subscriber = User & {
  subscription_date?: string;
  subscriptionDate?: string;
  email?: string;
  channelCount?: number;
};

// Extended Channel type to handle legacy/inconsistent properties
type ExtendedChannel = Channel & {
  user_id?: number; // Add user_id for legacy compatibility
};

// Sort options
type SortField = "username" | "subscriptionDate" | "channelCount";
type SortDirection = "asc" | "desc";

export default function ManageSubscribersPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("subscriptionDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const { toast } = useToast();

  console.log(`Manage Subscribers Page - Channel ID: ${id}`);

  // Fetch channel data
  const {
    data: channel,
    isLoading: channelLoading,
    error: channelError,
  } = useQuery<ExtendedChannel>({
    queryKey: [`/api/channels/${id}`],
  });

  useEffect(() => {
    if (channel) {
      console.log("Channel data loaded:", channel);
    }
    if (channelError) {
      console.error("Error loading channel:", channelError);
    }
  }, [channel, channelError]);

  // Fetch channel subscribers
  const {
    data: subscribers,
    isLoading: subscribersLoading,
    error: subscribersError,
    refetch: refetchSubscribers,
  } = useQuery<Subscriber[]>({
    queryKey: ["channelSubscribers", id],
    queryFn: () => fetchChannelSubscribers(id!),
    enabled:
      !!id &&
      !!user &&
      (channel?.userId === user.id || channel?.user_id === user.id),
    staleTime: 60000, // 1 minute
  });

  useEffect(() => {
    if (subscribers) {
      console.log("Subscribers data loaded:", subscribers);
    }
    if (subscribersError) {
      console.error("Error loading subscribers:", subscribersError);
      toast({
        title: "Error loading subscribers",
        description: "There was a problem fetching the subscriber data.",
        variant: "destructive",
      });
    }
  }, [subscribers, subscribersError, toast]);

  // Check if user is the channel owner
  const isOwner =
    channel &&
    user &&
    (channel.userId === user.id || channel.user_id === user.id);

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

  // Filter and sort subscribers
  const filteredAndSortedSubscribers = useMemo(() => {
    if (!subscribers?.length) {
      console.log("No subscribers data to process");
      return [];
    }

    console.log(`Processing ${subscribers.length} subscribers`);

    // First filter by search query
    const filtered = subscribers.filter((subscriber) => {
      if (!searchQuery) return true;

      const query = searchQuery.toLowerCase();
      return (
        subscriber.username.toLowerCase().includes(query) ||
        (subscriber.email && subscriber.email.toLowerCase().includes(query))
      );
    });

    // Then sort by the selected field
    return filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === "username") {
        comparison = a.username.localeCompare(b.username);
      } else if (sortField === "subscriptionDate") {
        const dateA = a.subscription_date || a.subscriptionDate || "";
        const dateB = b.subscription_date || b.subscriptionDate || "";
        comparison = dateA.localeCompare(dateB);
      } else if (sortField === "channelCount") {
        const countA = a.channelCount || 0;
        const countB = b.channelCount || 0;
        comparison = countA - countB;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [subscribers, searchQuery, sortField, sortDirection]);

  // Format subscription date
  const formatSubDate = (date?: string) => {
    if (!date) return "Unknown";
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch (e) {
      return "Invalid date";
    }
  };

  const handleRefresh = () => {
    refetchSubscribers();
    toast({
      title: "Refreshing subscribers",
      description: "Getting the latest subscriber data...",
    });
  };

  // If user is not logged in
  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Loading state
  if (channelLoading || subscribersLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // If channel doesn't exist
  if (!channel) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="text-center">Channel not found</div>
        </div>
      </div>
    );
  }

  // If user is not the owner
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar />
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="text-center">
            You don't have permission to view this page
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(`/channels/${id}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Manage Subscribers</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              title="Refresh subscriber data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <span className="text-muted-foreground">{channel.name}</span>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Subscribers</CardTitle>
              <CardDescription>
                {subscribers?.length || 0}{" "}
                {subscribers?.length === 1 ? "person" : "people"} subscribed to
                this channel
              </CardDescription>
            </div>
            {subscribersError && (
              <Button variant="outline" onClick={handleRefresh}>
                Retry
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search subscribers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {subscribersError ? (
              <div className="text-center py-8 text-muted-foreground">
                Error loading subscribers. Please try again.
              </div>
            ) : filteredAndSortedSubscribers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {subscribers?.length === 0
                  ? "No subscribers yet"
                  : "No subscribers match your search"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="w-[30%] cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort("username")}
                    >
                      <div className="flex items-center">
                        User
                        {sortField === "username" && (
                          <ArrowUpDown
                            className={`ml-1 h-4 w-4 ${
                              sortDirection === "asc" ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[40%] cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort("subscriptionDate")}
                    >
                      <div className="flex items-center">
                        Subscribed Since
                        {sortField === "subscriptionDate" && (
                          <ArrowUpDown
                            className={`ml-1 h-4 w-4 ${
                              sortDirection === "asc" ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="w-[30%] cursor-pointer hover:bg-gray-50 text-center"
                      onClick={() => handleSort("channelCount")}
                    >
                      <div className="flex items-center justify-center">
                        Channels Subscribed
                        {sortField === "channelCount" && (
                          <ArrowUpDown
                            className={`ml-1 h-4 w-4 ${
                              sortDirection === "asc" ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedSubscribers.map((subscriber) => (
                    <TableRow key={subscriber.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserRound className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">
                            {subscriber.username}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {formatSubDate(
                              subscriber.subscriptionDate ||
                                subscriber.subscription_date
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{subscriber.channelCount || 1}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

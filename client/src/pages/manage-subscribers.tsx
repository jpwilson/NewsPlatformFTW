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
  username: string;
  id: number;
};

// Extended Channel type to handle legacy/inconsistent properties
type ExtendedChannel = Channel & {
  user_id?: number; // Add user_id for legacy compatibility
  subscriberCount?: number; // Add subscriberCount property
};

export default function ManageSubscribersPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
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
    retry: 2,
    retryDelay: 1000,
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

  // Filter subscribers
  const filteredSubscribers = useMemo(() => {
    if (!subscribers?.length) {
      console.log("No subscribers data to process");
      return [];
    }

    console.log(`Processing ${subscribers.length} subscribers`);

    // Filter by search query
    return subscribers.filter((subscriber) => {
      if (!searchQuery) return true;

      const query = searchQuery.toLowerCase();
      return subscriber.username.toLowerCase().includes(query);
    });
  }, [subscribers, searchQuery]);

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
        <div className="mb-6 flex items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation(`/channels/${id}`)}
              title="Return to Channel Profile"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Return to Channel Profile</h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Subscribers</CardTitle>
              <CardDescription>
                {channel.subscriberCount || 0}{" "}
                {channel.subscriberCount === 1 ? "person" : "people"} subscribed
                to this channel
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {subscribersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : subscribersError ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Error loading subscribers. Please try again later.</p>
              </div>
            ) : !subscribers || subscribers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {channel.subscriberCount === 0
                  ? "No subscribers yet"
                  : "Unable to load subscriber details"}
              </div>
            ) : (
              <>
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

                {filteredSubscribers?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No subscribers match your search
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <div className="flex items-center">User</div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(filteredSubscribers) &&
                        filteredSubscribers.map((subscriber) => (
                          <TableRow key={subscriber?.id || "unknown"}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <UserRound className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium">
                                  {subscriber?.username || "Unknown user"}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

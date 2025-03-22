import { Channel } from "@shared/schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Users, UserRound, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { AuthDialog } from "./auth-dialog";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

// Extended Channel type that includes subscriberCount
type ExtendedChannel = Channel & {
  subscriberCount?: number;
  subscriber_count?: number;
  subscribers?: any[];
  created_at?: string;
  createdAt?: string;
  user_id?: number;
};

export function ChannelCard({ channel }: { channel: ExtendedChannel }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  // Fetch user's subscriptions to determine if already subscribed
  const { data: subscriptions } = useQuery<Channel[]>({
    queryKey: ["/api/user/subscriptions"],
    enabled: !!user, // Only run if user is logged in
  });

  // Check if user is already subscribed to this channel
  const isSubscribed = useMemo(() => {
    if (!subscriptions?.length || !user) return false;
    return subscriptions.some((sub) => sub.id === Number(channel.id));
  }, [subscriptions, channel.id, user]);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/channels/${channel.id}/subscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/channels/${channel.id}`],
      });
      toast({
        title: "Subscribed",
        description: `You are now subscribed to ${channel.name}`,
      });
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/channels/${channel.id}/subscribe`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/subscriptions"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/channels/${channel.id}`],
      });
      toast({
        title: "Unsubscribed",
        description: `You have unsubscribed from ${channel.name}`,
      });
    },
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on a button
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }

    if (user) {
      navigate(`/channels/${channel.id}`);
    } else {
      setAuthDialogOpen(true);
    }
  };

  const handleSubscribe = () => {
    if (user) {
      // Prevent multiple subscriptions
      if (isSubscribed) {
        toast({
          title: "Already subscribed",
          description: `You are already subscribed to ${channel.name}`,
        });
        return;
      }
      subscribeMutation.mutate();
    } else {
      setAuthDialogOpen(true);
    }
  };

  const handleUnsubscribe = () => {
    if (user) {
      unsubscribeMutation.mutate();
    }
  };

  // Get the most accurate subscriber count from various sources
  const getSubscriberCount = () => {
    if (typeof channel.subscriberCount === "number") {
      return channel.subscriberCount;
    } else if (typeof channel.subscriber_count === "number") {
      return channel.subscriber_count;
    } else if (Array.isArray(channel.subscribers)) {
      return channel.subscribers.length;
    } else {
      return 0;
    }
  };

  // Format the creation date
  const formatCreationDate = () => {
    const dateStr = channel.created_at || channel.createdAt;
    if (!dateStr) return "Unknown date";
    try {
      return `${formatDistanceToNow(new Date(dateStr))} ago`;
    } catch (e) {
      return "Unknown date";
    }
  };

  return (
    <>
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={handleCardClick}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{channel.name}</h3>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-sm">
                {getSubscriberCount()} subscribers
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {channel.description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-3 overflow-hidden">
              {channel.description}
            </p>
          )}

          {user &&
          (user.id === channel.userId || user.id === channel.user_id) ? (
            // Channel owner can't subscribe to their own channel
            <div className="text-xs text-muted-foreground text-center p-2">
              Your channel
            </div>
          ) : isSubscribed ? (
            // User is already subscribed - show subscribed state
            <div className="text-center text-sm text-muted-foreground">
              Subscribed
            </div>
          ) : (
            // User is not subscribed - show subscribe button
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click event
                handleSubscribe();
              }}
              disabled={subscribeMutation.isPending}
            >
              Subscribe
            </Button>
          )}
        </CardContent>
      </Card>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </>
  );
}

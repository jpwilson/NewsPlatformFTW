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
import { Users, UserRound, Calendar, FileText } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { AuthDialog } from "./auth-dialog";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { createSlugUrl } from "@/lib/slug-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Extended Channel type that includes subscriberCount and article count
type ExtendedChannel = Channel & {
  subscriberCount?: number;
  subscriber_count?: number;
  subscribers?: any[];
  created_at?: string;
  createdAt?: string;
  user_id?: number;
  articleCount?: number;
  article_count?: number;
  bannerImage?: string | null;
  banner_image?: string | null;
  profileImage?: string | null;
  profile_image?: string | null;
  _count?: {
    articles?: number;
  };
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
      // Use slug if available, fallback to ID
      const channelSlug = channel.slug || "";
      navigate(createSlugUrl("/channels/", channelSlug, channel.id));
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

  // Get the article count from various sources
  const getArticleCount = () => {
    if (typeof channel.articleCount === "number") {
      return channel.articleCount;
    } else if (typeof channel.article_count === "number") {
      return channel.article_count;
    } else if (channel._count?.articles !== undefined) {
      return channel._count.articles;
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

  const bannerUrl = channel.bannerImage || channel.banner_image;
  const profileUrl = channel.profileImage || channel.profile_image;

  return (
    <>
      <Card
        className="mb-4 cursor-pointer hover:shadow-lg transition-all duration-200 shadow-sm dark:shadow-md dark:shadow-white/10 dark:border-white/20 overflow-hidden flex flex-col"
        onClick={handleCardClick}
      >
        {/* Banner Image Strip */}
        {bannerUrl && (
          <div
            className="w-full h-32 bg-gradient-to-br from-primary/20 to-primary/5"
            style={{
              backgroundImage: `url(${bannerUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />
        )}

        <CardHeader className="pb-3 flex-shrink-0">
          <div className="flex items-start gap-3">
            {/* Profile Image */}
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarImage src={profileUrl || undefined} alt={channel.name} />
              <AvatarFallback className="bg-primary/10">
                {channel.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            {/* Channel Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-semibold text-lg leading-tight truncate">
                {channel.name}
              </h3>
              
              {/* Stats Row */}
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{getSubscriberCount().toLocaleString()}</span>
                  <span className="hidden sm:inline">subscribers</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{getArticleCount()}</span>
                  <span className="hidden sm:inline">articles</span>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col flex-grow">
          {channel.description && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
              {channel.description}
            </p>
          )}

          <div className="mt-auto">
          {user &&
          (user.id === channel.userId || user.id === channel.user_id) ? (
            // Channel owner can't subscribe to their own channel
            <div className="text-xs text-muted-foreground text-center p-2 bg-muted/30 rounded-md">
              Your channel
            </div>
          ) : isSubscribed ? (
            // User is already subscribed - show subscribed state
            <div className="text-center text-sm text-muted-foreground p-2 bg-primary/5 rounded-md font-medium">
              ✓ Subscribed
            </div>
          ) : (
            // User is not subscribed - show subscribe button
            <Button
              variant="default"
              size="sm"
              className="w-full dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90 font-medium"
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click event
                handleSubscribe();
              }}
              disabled={subscribeMutation.isPending}
            >
              Subscribe
            </Button>
          )}
          </div>
        </CardContent>
      </Card>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </>
  );
}

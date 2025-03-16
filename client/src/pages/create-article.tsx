import { NavigationBar } from "@/components/navigation-bar";
import { ArticleEditor } from "@/components/article-editor";
import { Channel } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSelectedChannel } from "@/hooks/use-selected-channel";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

export default function CreateArticle() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const { selectedChannelId } = useSelectedChannel();

  // Directly use React Query to fetch channels - more reliable
  const { data: allChannels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: !!user,
  });

  // Filter channels owned by the current user
  const userChannels = user
    ? allChannels.filter(
        (c: Channel) =>
          // Check both camelCase and snake_case versions of the user ID property
          c.userId === user.id || (c as any).user_id === user.id
      )
    : [];

  // Determine which channel ID to use by default in the editor - prioritize the selected channel
  const defaultChannelId =
    selectedChannelId ||
    (userChannels.length > 0 ? userChannels[0].id : undefined);

  // Log state for debugging
  useEffect(() => {
    if (user) {
      console.log("User ID:", user.id);
      console.log("All channels:", allChannels.length);
      console.log("User's channels:", userChannels.length);
      console.log("Selected channel ID:", selectedChannelId);
      console.log("Default channel ID for editor:", defaultChannelId);
    }

    // Set loading to false once we have the channel data
    if (user && allChannels) {
      setIsLoading(false);
    }
  }, [user, allChannels, userChannels, selectedChannelId, defaultChannelId]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationBar selectedChannelId={selectedChannelId} />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Handle authentication
  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Only redirect to channel creation if user has NO channels
  if (userChannels.length === 0) {
    console.log("User has no channels, redirecting to channel creation");
    return <Redirect to="/channels/new" />;
  }

  // If we reach here, the user is authenticated and has at least one channel
  return (
    <div className="min-h-screen pb-16">
      <NavigationBar selectedChannelId={selectedChannelId} />

      <div className="container mx-auto p-4 lg:p-8 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Create Article</h1>
        <ArticleEditor
          channels={userChannels}
          defaultChannelId={defaultChannelId}
        />
      </div>
    </div>
  );
}

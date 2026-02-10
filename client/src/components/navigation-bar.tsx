import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Newspaper,
  LogOut,
  ChevronDown,
  PlusCircle,
  Menu,
  Users,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Channel } from "@shared/schema";
import { useEffect, useState, useMemo } from "react";
import { useSelectedChannel } from "@/hooks/use-selected-channel";
import { ThemeToggle } from "@/components/theme-toggle";
import { ImageToggle } from "@/components/image-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { createSlugUrl } from "@/lib/slug-utils";

// Define type for the debug endpoint response
interface DebugChannelsResponse {
  success: boolean;
  message: string;
  channels: Channel[];
  count: number;
}

export function NavigationBar({
  hideAuthButtons = false,
  selectedChannelId = undefined,
}: {
  hideAuthButtons?: boolean;
  selectedChannelId?: string | number;
}) {
  const { user, logoutMutation } = useAuth();
  const { isAdmin } = useAdminAuth();
  const [location, setLocation] = useLocation();
  const { selectedChannelId: contextChannelId, setSelectedChannelId } =
    useSelectedChannel();

  // Get the last selected channel from localStorage
  const getLastSelectedChannel = (userId: number) => {
    try {
      const stored = localStorage.getItem(`navbarChannel-${userId}`);
      return stored ? Number(stored) : undefined;
    } catch (e) {
      console.error("Error reading from localStorage:", e);
      return undefined;
    }
  };

  // Save the last selected channel to localStorage
  const saveLastSelectedChannel = (userId: number, channelId: number) => {
    try {
      localStorage.setItem(`navbarChannel-${userId}`, channelId.toString());
    } catch (e) {
      console.error("Error writing to localStorage:", e);
    }
  };

  // Initialize currentChannelId from localStorage or first available channel
  const [currentChannelId, setCurrentChannelId] = useState<number | undefined>(
    undefined
  );

  // Fetch user's owned channels if the user is logged in
  const { data: userChannels, isLoading: isUserChannelsLoading } = useQuery<
    Channel[]
  >({
    queryKey: ["/api/channels", user?.id],
    select: (channels) => channels?.filter((c) => c.userId === user?.id) || [],
    enabled: !!user,
  });

  // Use debug endpoint as fallback for channels
  const { data: debugChannelsData, isLoading: isDebugChannelsLoading } =
    useQuery<DebugChannelsResponse>({
      queryKey: ["/api/debug/channels", user?.id],
      queryFn: async () => {
        const response = await fetch(`/api/debug/channels?userId=${user?.id}`);
        if (!response.ok) {
          throw new Error(`Error fetching debug channels: ${response.status}`);
        }
        return response.json();
      },
      enabled: !!user && (!userChannels || userChannels.length === 0),
    });

  // Combine channels from both sources
  const combinedUserChannels = useMemo(() => {
    if (userChannels?.length) {
      return userChannels;
    }
    if (debugChannelsData?.channels) {
      return debugChannelsData.channels.filter((channel: Channel) => {
        const channelUserId = (channel as any).user_id || channel.userId;
        return channelUserId === user?.id;
      });
    }
    return [];
  }, [userChannels, debugChannelsData, user?.id]);

  // Initialize the navbar channel selection when channels are loaded
  useEffect(() => {
    if (!user?.id || !combinedUserChannels?.length) return;

    // If we already have a selection, keep it
    if (
      currentChannelId &&
      combinedUserChannels.some((c) => c.id === currentChannelId)
    ) {
      return;
    }

    // Try to get the last selected channel from localStorage
    const lastSelected = getLastSelectedChannel(user.id);
    if (
      lastSelected &&
      combinedUserChannels.some((c) => c.id === lastSelected)
    ) {
      setCurrentChannelId(lastSelected);
      setSelectedChannelId(lastSelected);
      return;
    }

    // If no stored selection, use the first channel
    const firstChannelId = combinedUserChannels[0].id;
    setCurrentChannelId(firstChannelId);
    setSelectedChannelId(firstChannelId);
    saveLastSelectedChannel(user.id, firstChannelId);
  }, [user?.id, combinedUserChannels, currentChannelId, setSelectedChannelId]);

  // Get the selected channel for navbar display
  const selectedChannel = useMemo(() => {
    if (!combinedUserChannels?.length || !currentChannelId) return null;
    return (
      combinedUserChannels.find((c) => c.id === currentChannelId) ||
      combinedUserChannels[0]
    );
  }, [combinedUserChannels, currentChannelId]);

  // The displayed channel should always be the selected channel
  const displayedChannel = selectedChannel;

  const hasMultipleChannels =
    combinedUserChannels && combinedUserChannels.length > 1;

  const navigateToChannel = (channelId: number, channel?: any) => {
    if (!isNaN(channelId) && user?.id) {
      // Update the navbar selection
      setCurrentChannelId(channelId);
      setSelectedChannelId(channelId);
      saveLastSelectedChannel(user.id, channelId);

      // Navigate to the channel profile
      const channelSlug = channel?.slug || "";
      setLocation(createSlugUrl("/channels/", channelSlug, channelId));
    }
  };

  // Check if we're on the auth page to hide login button when already on it
  const isAuthPage = location === "/auth";

  // Get popular channels for mobile menu
  const { data: popularChannels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
  });

  // Add debugging to track channel changes
  useEffect(() => {
    console.log("Current Channel ID:", currentChannelId);
    console.log("Selected Channel:", selectedChannel);
    console.log("Combined User Channels:", combinedUserChannels);
  }, [currentChannelId, selectedChannel, combinedUserChannels]);

  const handleLogout = () => {
    // Reset theme appearance to light mode on logout, but don't clear the preference
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");

    // Don't clear lastSelectedChannel so it persists for next login

    logoutMutation.mutate();
    // Force redirect to the home page after logout
    setLocation("/");
  };

  return (
    <header className="border-b sticky top-0 z-50 bg-background">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Hamburger menu for mobile */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="py-4">
                <div className="pb-4">
                  <Link href="/" className="flex items-center gap-2 py-2">
                    <Newspaper className="h-5 w-5" />
                    <span>Home</span>
                  </Link>
                </div>

                {user && (
                  <div className="pb-4">
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 py-2"
                    >
                      <span>Profile</span>
                    </Link>
                    <Link
                      href="/api"
                      className="flex items-center gap-2 py-2"
                    >
                      <Zap className="h-5 w-5" />
                      <span>API</span>
                    </Link>
                  </div>
                )}

                {/* Admin link in mobile menu - only for admin users */}
                {user && isAdmin && (
                  <div className="pb-4">
                    <Link
                      href="/admin"
                      className="flex items-center gap-2 py-2"
                    >
                      <span>Admin</span>
                    </Link>
                  </div>
                )}

                {/* Add theme toggle to mobile menu for logged-in users */}
                {user && (
                  <div className="pb-4 flex items-center gap-2 py-2">
                    <span>Theme:</span>
                    <ThemeToggle />
                    <ImageToggle />
                  </div>
                )}

                {/* Display channel info in mobile menu if user has a channel */}
                {user && displayedChannel && (
                  <div className="pb-4">
                    <Collapsible defaultOpen={true}>
                      <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
                        <div className="font-medium flex items-center gap-2">
                          <span>
                            Channel:{" "}
                            <span className="font-medium">
                              {displayedChannel.name}
                            </span>
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {hasMultipleChannels && (
                          <div className="pl-7 space-y-2 mt-1">
                            {combinedUserChannels?.map((channel) => (
                              <div
                                key={channel.id}
                                className={`text-sm py-1 cursor-pointer ${
                                  channel.id === currentChannelId
                                    ? "font-medium"
                                    : ""
                                }`}
                                onClick={() =>
                                  navigateToChannel(channel.id, channel)
                                }
                              >
                                {channel.name}
                              </div>
                            ))}
                            <Link
                              href="/channels/new"
                              className="text-sm py-1 flex items-center gap-1 text-primary"
                            >
                              <PlusCircle className="h-3 w-3" />
                              Create Channel
                            </Link>
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}

                {/* Popular Channels Section for Mobile */}
                <div className="pt-4 border-t">
                  <Collapsible defaultOpen={true}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
                      <div className="font-medium flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Popular Channels
                      </div>
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-7 space-y-2 mt-2">
                        {popularChannels?.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No channels available
                          </p>
                        ) : (
                          <>
                            {popularChannels?.slice(0, 5).map((channel) => (
                              <Link
                                key={channel.id}
                                href={createSlugUrl(
                                  "/channels/",
                                  channel.slug || "",
                                  channel.id
                                )}
                                className="block py-1 text-sm"
                              >
                                {channel.name}
                              </Link>
                            ))}
                          </>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="mt-3 pl-7">
                    <Link href="/channels">
                      <Button size="sm" className="w-full">
                        Explore Channels
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Newspaper className="h-6 w-6" />
            <span className="font-bold text-lg">NewsPlatform</span>
          </button>

        </div>

        <div className="flex items-center gap-4">
          {/* Show channel info if user is logged in and has created at least one channel */}
          {user && displayedChannel && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sm text-muted-foreground hidden md:flex items-center gap-1"
                >
                  Channel:{" "}
                  <span className="font-medium">{displayedChannel.name}</span>
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* List all user channels */}
                {combinedUserChannels &&
                  combinedUserChannels.map((channel) => (
                    <DropdownMenuItem
                      key={channel.id}
                      onClick={() => navigateToChannel(channel.id, channel)}
                      className={
                        channel.id === currentChannelId ? "font-medium" : ""
                      }
                    >
                      {channel.name}
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/channels/new" className="flex items-center">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Create Channel
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <nav>
            {!hideAuthButtons &&
              !isAuthPage &&
              (user ? (
                <>
                  {/* Dark mode toggle - only shown for logged in users */}
                  <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <ImageToggle />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          className="relative h-8 bg-background"
                        >
                          {user.username}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-56"
                        align="end"
                        forceMount
                      >
                        <DropdownMenuItem asChild>
                          <Link href="/profile">Profile</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/api" className="flex items-center">
                            <Zap className="h-4 w-4 mr-2" />
                            API
                          </Link>
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem asChild>
                              <Link href="/admin">Admin</Link>
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleLogout}>
                          <LogOut className="h-4 w-4 mr-2" />
                          Logout
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              ) : (
                <Link href="/auth">
                  <Button size="sm">Login</Button>
                </Link>
              ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

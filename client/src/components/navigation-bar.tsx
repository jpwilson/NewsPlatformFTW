import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Channel } from "@shared/schema";
import { useEffect, useState, useMemo } from "react";
import { useSelectedChannel } from "@/hooks/use-selected-channel";
import { ThemeToggle } from "@/components/theme-toggle";
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
  const [location, setLocation] = useLocation();
  const { selectedChannelId: contextChannelId, setSelectedChannelId } =
    useSelectedChannel();

  // Check if we're on the auth page to hide login button when already on it
  const isAuthPage = location === "/auth";

  // Get popular channels for mobile menu
  const { data: popularChannels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    enabled: true,
  });

  // Use the prop value if provided (for explicit page-level control), otherwise use the context value
  const effectiveChannelId =
    selectedChannelId !== undefined
      ? Number(selectedChannelId)
      : contextChannelId;

  useEffect(() => {
    console.log(
      "NavigationBar - Selected Channel ID from prop:",
      selectedChannelId
    );
    console.log(
      "NavigationBar - Selected Channel ID from context:",
      contextChannelId
    );
    console.log("NavigationBar - Effective Channel ID:", effectiveChannelId);
  }, [selectedChannelId, contextChannelId, effectiveChannelId]);

  // When selectedChannelId prop changes and it's defined, update the context
  useEffect(() => {
    if (selectedChannelId !== undefined) {
      setSelectedChannelId(Number(selectedChannelId));
    }
  }, [selectedChannelId, setSelectedChannelId]);

  // Fetch user's owned channels if the user is logged in
  const { data: userChannels } = useQuery<Channel[]>({
    queryKey: ["/api/channels"],
    select: (channels) => channels?.filter((c) => c.userId === user?.id) || [],
    enabled: !!user,
  });

  // Use debug endpoint as fallback for channels
  const { data: debugChannelsData } = useQuery<DebugChannelsResponse>({
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

    if (debugChannelsData && "channels" in debugChannelsData) {
      return debugChannelsData.channels.filter((channel: Channel) => {
        const channelUserId = (channel as any).user_id || channel.userId;
        return channelUserId === user?.id;
      });
    }

    return [];
  }, [userChannels, debugChannelsData, user?.id]);

  useEffect(() => {
    if (combinedUserChannels?.length) {
      console.log(
        "NavigationBar - User Channels:",
        combinedUserChannels.map((c) => ({ id: c.id, name: c.name }))
      );
    }
  }, [combinedUserChannels]);

  // Get the selected channel or default to the first one
  const selectedChannel =
    combinedUserChannels && effectiveChannelId
      ? combinedUserChannels.find((c) => c.id === effectiveChannelId)
      : null;

  // Get the user's primary channel (first one they created)
  const displayedChannel =
    selectedChannel ||
    (combinedUserChannels && combinedUserChannels.length > 0
      ? combinedUserChannels[0]
      : null);

  const hasMultipleChannels =
    combinedUserChannels && combinedUserChannels.length > 1;

  useEffect(() => {
    console.log("NavigationBar - Selected Channel:", selectedChannel);
    console.log("NavigationBar - Displayed Channel:", displayedChannel);
  }, [selectedChannel, displayedChannel]);

  const handleLogout = () => {
    // Reset theme appearance to light mode on logout, but don't clear the preference
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");

    // Don't clear theme preference so it persists for next login
    // localStorage.removeItem("newsPlatform-theme");

    logoutMutation.mutate();
    // Force redirect to the home page after logout
    setLocation("/");
  };

  const navigateToChannel = (channelId: number, channel?: any) => {
    console.log("NavigationBar - Navigating to channel:", channelId);
    setSelectedChannelId(channelId);

    // Use slug if available (if the channel object has a slug property)
    const channelSlug = channel?.slug || "";
    setLocation(createSlugUrl("/channels/", channelSlug, channelId));
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
                  </div>
                )}

                {/* Add theme toggle to mobile menu for logged-in users */}
                {user && (
                  <div className="pb-4 flex items-center gap-2 py-2">
                    <span>Theme:</span>
                    <ThemeToggle />
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
                                  channel.id === effectiveChannelId
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
                        channel.id === effectiveChannelId ? "font-medium" : ""
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

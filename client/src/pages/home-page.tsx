import { useQuery } from "@tanstack/react-query";
import { Article, Channel } from "@shared/schema";
import { ArticleCard } from "@/components/article-card";
import { ChannelCard } from "@/components/channel-card";
import { NavigationBar } from "@/components/navigation-bar";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Loader2,
  PlusCircle,
  SlidersHorizontal,
  Filter,
  Search,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSelectedChannel } from "@/hooks/use-selected-channel";

// Define ordering options
type OrderField = "createdAt" | "viewCount" | "comments" | "likes" | "dislikes";
type OrderDirection = "asc" | "desc";

// Define a more flexible type for article that accommodates both camelCase and snake_case
type ArticleWithSnakeCase = Article & {
  created_at?: string | Date;
  channel_id?: number;
  channel?: { id: number; name: string };
  likes?: number;
  dislikes?: number;
  viewCount?: number;
  view_count?: number;
  userReaction?: boolean | null;
  _count?: {
    comments?: number;
  };
};

// Define a more flexible type for channel that accommodates both camelCase and snake_case
type ChannelWithSnakeCase = Channel & {
  user_id?: number;
  created_at?: string;
  createdAt?: string;
  subscriber_count?: number;
  subscriberCount?: number;
  subscribers?: any[];
};

interface OrderOption {
  field: OrderField;
  label: string;
  direction: OrderDirection;
}

export default function HomePage() {
  const { user } = useAuth();
  const { selectedChannelId } = useSelectedChannel();
  const [orderField, setOrderField] = useState<OrderField>("createdAt");
  const [orderDirection, setOrderDirection] = useState<OrderDirection>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [filterChannels, setFilterChannels] = useState<number[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<
    ArticleWithSnakeCase[]
  >([]);
  const [filteredChannels, setFilteredChannels] = useState<
    ChannelWithSnakeCase[]
  >([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableLocations, setAvailableLocations] = useState<string[]>([]);

  // Get all articles
  const { data: articles, isLoading: loadingArticles } = useQuery<
    ArticleWithSnakeCase[]
  >({
    queryKey: ["/api/articles"],
  });

  // Get all channels
  const { data: channels, isLoading: loadingChannels } = useQuery<
    ChannelWithSnakeCase[]
  >({
    queryKey: ["/api/channels"],
  });

  // Filter out user's own channels
  useEffect(() => {
    if (channels && user) {
      // Filter channels to exclude user's own channels
      const filtered = channels.filter((channel) => {
        // Check both camelCase and snake_case versions of userId
        if (channel.userId === user.id || channel.user_id === user.id) {
          return false;
        }
        return true;
      });

      setFilteredChannels(filtered);
    } else if (channels) {
      setFilteredChannels(channels);
    }
  }, [channels, user]);

  // Extract available categories and locations from articles
  useEffect(() => {
    if (articles && articles.length > 0) {
      const categories = Array.from(
        new Set(
          articles
            .map((article) => article.category)
            .filter((category): category is string => !!category)
        )
      );

      const locations = Array.from(
        new Set(
          articles
            .map((article) => article.location)
            .filter((location): location is string => !!location)
        )
      );

      setAvailableCategories(categories);
      setAvailableLocations(locations);
    }
  }, [articles]);

  // Filter and sort articles
  useEffect(() => {
    if (!articles) return;

    let filtered = [...articles];

    // Apply search filter
    if (searchTerm) {
      const lowercaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(lowercaseSearch) ||
          article.content.toLowerCase().includes(lowercaseSearch)
      );
    }

    // Apply category filter
    if (filterCategories.length > 0) {
      filtered = filtered.filter((article) =>
        filterCategories.includes(article.category)
      );
    }

    // Apply location filter
    if (filterLocations.length > 0) {
      filtered = filtered.filter(
        (article) =>
          article.location && filterLocations.includes(article.location)
      );
    }

    // Apply channel filter
    if (filterChannels.length > 0) {
      filtered = filtered.filter((article) =>
        filterChannels.includes(article.channelId || article.channel_id || 0)
      );
    }

    // Sort articles
    filtered.sort((a, b) => {
      let aValue: number = 0;
      let bValue: number = 0;

      // Determine values to compare based on selected field
      switch (orderField) {
        case "createdAt":
          aValue = new Date(
            a.createdAt || a.created_at || new Date()
          ).getTime();
          bValue = new Date(
            b.createdAt || b.created_at || new Date()
          ).getTime();
          break;
        case "viewCount":
          aValue = a.viewCount || a.view_count || 0;
          bValue = b.viewCount || b.view_count || 0;
          break;
        case "comments":
          aValue = a._count?.comments || 0;
          bValue = b._count?.comments || 0;
          break;
        case "likes":
          aValue = a.likes || 0;
          bValue = b.likes || 0;
          break;
        case "dislikes":
          aValue = a.dislikes || 0;
          bValue = b.dislikes || 0;
          break;
        default:
          aValue = new Date(
            a.createdAt || a.created_at || new Date()
          ).getTime();
          bValue = new Date(
            b.createdAt || b.created_at || new Date()
          ).getTime();
      }

      // Apply sort direction
      if (orderDirection === "asc") {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    setFilteredArticles(filtered);
  }, [
    articles,
    orderField,
    orderDirection,
    searchTerm,
    filterCategories,
    filterLocations,
    filterChannels,
  ]);

  // Handle category toggle
  const toggleCategory = (category: string) => {
    setFilterCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  // Handle location toggle
  const toggleLocation = (location: string) => {
    setFilterLocations((prev) =>
      prev.includes(location)
        ? prev.filter((l) => l !== location)
        : [...prev, location]
    );
  };

  // Handle channel toggle
  const toggleChannel = (channelId: number) => {
    setFilterChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  };

  // Toggle ordering direction
  const toggleDirection = () => {
    setOrderDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm("");
    setFilterCategories([]);
    setFilterLocations([]);
    setFilterChannels([]);
  };

  // Get human-readable order field name
  const getOrderFieldLabel = (field: OrderField): string => {
    switch (field) {
      case "createdAt":
        return "Published Date";
      case "viewCount":
        return "View Count";
      case "comments":
        return "Comment Count";
      case "likes":
        return "Likes";
      case "dislikes":
        return "Dislikes";
      default:
        return "Published Date";
    }
  };

  // Calculate number of active filters
  const activeFilterCount =
    (searchTerm ? 1 : 0) +
    filterCategories.length +
    filterLocations.length +
    filterChannels.length;

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar selectedChannelId={user ? selectedChannelId : undefined} />

      <div className="container mx-auto p-4 lg:p-8">
        {/* Main content area with Articles and Channels - moved up to wrap headers too */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Articles section with header - takes up 2/3 on large screens */}
          <div className="lg:col-span-2 space-y-4">
            {/* Header section */}
            <div>
              <h1 className="text-4xl font-bold">
                {user ? "Your Feed" : "Popular Articles"}
              </h1>
              <div className="flex justify-between items-center mt-2">
                <p className="text-muted-foreground">
                  {user
                    ? "Latest articles from your favorite channels"
                    : "Log in to see articles from your favorite channels"}
                </p>

                {/* Article control buttons - now contained in article column */}
                <div className="flex items-center gap-3">
                  {/* Order Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        Sort
                        {orderDirection === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Sort Articles By</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={orderField}
                        onValueChange={(value) =>
                          setOrderField(value as OrderField)
                        }
                      >
                        <DropdownMenuRadioItem value="createdAt">
                          Published Date
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="viewCount">
                          View Count
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="comments">
                          Comment Count
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="likes">
                          Likes
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dislikes">
                          Dislikes
                        </DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={toggleDirection}>
                        {orderDirection === "asc"
                          ? "Ascending ↑"
                          : "Descending ↓"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Filter Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="gap-2 relative">
                        <Filter className="h-4 w-4" />
                        Filter
                        {activeFilterCount > 0 && (
                          <Badge
                            className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center"
                            variant="destructive"
                          >
                            {activeFilterCount}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80">
                      <div className="space-y-4">
                        <h4 className="font-medium">Filter Articles</h4>

                        {/* Search */}
                        <div className="space-y-2">
                          <Label htmlFor="search">Search</Label>
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="search"
                              placeholder="Search in title or content..."
                              className="pl-8"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Categories */}
                        <div className="space-y-2">
                          <Label>Categories</Label>
                          <ScrollArea className="h-32">
                            <div className="space-y-2">
                              {availableCategories.map((category) => (
                                <div
                                  key={category}
                                  className="flex items-center space-x-2"
                                >
                                  <Checkbox
                                    id={`category-${category}`}
                                    checked={filterCategories.includes(
                                      category
                                    )}
                                    onCheckedChange={() =>
                                      toggleCategory(category)
                                    }
                                  />
                                  <Label
                                    htmlFor={`category-${category}`}
                                    className="capitalize"
                                  >
                                    {category}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>

                        {/* Locations */}
                        {availableLocations.length > 0 && (
                          <div className="space-y-2">
                            <Label>Locations</Label>
                            <ScrollArea className="h-32">
                              <div className="space-y-2">
                                {availableLocations.map((location) => (
                                  <div
                                    key={location}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      id={`location-${location}`}
                                      checked={filterLocations.includes(
                                        location
                                      )}
                                      onCheckedChange={() =>
                                        toggleLocation(location)
                                      }
                                    />
                                    <Label htmlFor={`location-${location}`}>
                                      {location}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        {/* Channels */}
                        {channels && channels.length > 0 && (
                          <div className="space-y-2">
                            <Label>Channels</Label>
                            <ScrollArea className="h-32">
                              <div className="space-y-2">
                                {channels.map((channel) => (
                                  <div
                                    key={channel.id}
                                    className="flex items-center space-x-2"
                                  >
                                    <Checkbox
                                      id={`channel-${channel.id}`}
                                      checked={filterChannels.includes(
                                        channel.id
                                      )}
                                      onCheckedChange={() =>
                                        toggleChannel(channel.id)
                                      }
                                    />
                                    <Label htmlFor={`channel-${channel.id}`}>
                                      {channel.name}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}

                        {/* Clear filters button */}
                        {activeFilterCount > 0 && (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={clearFilters}
                          >
                            Clear All Filters
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Write Article Button */}
                  {user && (
                    <Link
                      href={
                        selectedChannelId
                          ? `/channels/${selectedChannelId}/articles/new`
                          : "/articles/new"
                      }
                    >
                      <Button>
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Write an Article
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Display active filters */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {orderField !== "createdAt" && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    Sorted by: {getOrderFieldLabel(orderField)}
                    {orderDirection === "asc" ? " (Asc)" : " (Desc)"}
                  </Badge>
                )}

                {searchTerm && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    Search: {searchTerm}
                    <button
                      className="ml-1 hover:text-destructive"
                      onClick={() => setSearchTerm("")}
                    >
                      ×
                    </button>
                  </Badge>
                )}

                {filterCategories.map((category) => (
                  <Badge
                    key={category}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    Category: {category}
                    <button
                      className="ml-1 hover:text-destructive"
                      onClick={() => toggleCategory(category)}
                    >
                      ×
                    </button>
                  </Badge>
                ))}

                {filterLocations.map((location) => (
                  <Badge
                    key={location}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    Location: {location}
                    <button
                      className="ml-1 hover:text-destructive"
                      onClick={() => toggleLocation(location)}
                    >
                      ×
                    </button>
                  </Badge>
                ))}

                {filterChannels.map((channelId) => {
                  const channel = channels?.find((c) => c.id === channelId);
                  return (
                    <Badge
                      key={channelId}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      Channel: {channel?.name || channelId}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() => toggleChannel(channelId)}
                      >
                        ×
                      </button>
                    </Badge>
                  );
                })}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={clearFilters}
                >
                  Clear All
                </Button>
              </div>
            )}

            {/* Articles list */}
            {loadingArticles ? (
              <div className="flex justify-center my-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {articles && articles.length > 0
                  ? "No articles match your filters"
                  : "No articles yet"}
              </div>
            ) : (
              filteredArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))
            )}
          </div>

          {/* Popular Channels section - 1/3 on large screens, hidden on smaller screens */}
          <div className="hidden lg:block space-y-6">
            <div className="pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-[1.16em] font-[520]">
                  Popular Channels
                </h2>
                <Link href="/channels">
                  <Button size="sm" className="text-xs h-7">
                    Explore Channels
                  </Button>
                </Link>
              </div>
            </div>

            {loadingChannels ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredChannels?.length === 0 ? (
              <div className="text-center p-4 text-muted-foreground">
                No channels yet
              </div>
            ) : (
              filteredChannels?.map((channel) => (
                <ChannelCard key={channel.id} channel={channel} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

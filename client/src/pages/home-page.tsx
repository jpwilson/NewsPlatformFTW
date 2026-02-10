import { useQuery } from "@tanstack/react-query";
import { Article, Channel } from "@shared/schema";
import { ArticleCard } from "@/components/article-card";
import { ChannelCard } from "@/components/channel-card";
import { NavigationBar } from "@/components/navigation-bar";
import { CategoryRibbon } from "@/components/category-ribbon";
import { MarketTicker } from "@/components/market-ticker";
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
  MapPin,
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
import { createSlugUrl } from "@/lib/slug-utils";

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
  categoryId?: number;
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
  const [filterChannels, setFilterChannels] = useState<number[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<
    ArticleWithSnakeCase[]
  >([]);
  const [filteredChannels, setFilteredChannels] = useState<
    ChannelWithSnakeCase[]
  >([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [ribbonCategory, setRibbonCategory] = useState<string | null>(null);
  const [ribbonCategoryIds, setRibbonCategoryIds] = useState<number[]>([]);
  const [userLocation, setUserLocation] = useState<{ city?: string; country?: string } | undefined>();
  const [locationSearchTerm, setLocationSearchTerm] = useState("");
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
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

  // Get all categories for mapping
  const { data: categoriesData } = useQuery<
    { id: number; name: string; parentId: number | null }[]
  >({
    queryKey: ["/api/categories"],
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

      // Sort channels by subscriber count (highest first)
      filtered.sort((a, b) => {
        const aSubscribers =
          a.subscriberCount || a.subscriber_count || a.subscribers?.length || 0;
        const bSubscribers =
          b.subscriberCount || b.subscriber_count || b.subscribers?.length || 0;
        return bSubscribers - aSubscribers;
      });

      setFilteredChannels(filtered);
    } else if (channels) {
      // Sort all channels by subscriber count if user is not logged in
      const sorted = [...channels].sort((a, b) => {
        const aSubscribers =
          a.subscriberCount || a.subscriber_count || a.subscribers?.length || 0;
        const bSubscribers =
          b.subscriberCount || b.subscriber_count || b.subscribers?.length || 0;
        return bSubscribers - aSubscribers;
      });

      setFilteredChannels(sorted);
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
      ).sort(); // Sort alphabetically for better UX

      setAvailableCategories(categories);
      setAvailableLocations(locations);
    }
  }, [articles]);

  // Filter and sort articles
  useEffect(() => {
    if (!articles) return;

    let filtered = [...articles];

    // Apply ribbon category filter first (if selected)
    if (ribbonCategory && ribbonCategoryIds.length > 0 && categoriesData) {
      // Get all category IDs including children
      const allCategoryIds = new Set<number>();
      
      const addCategoryAndChildren = (categoryId: number) => {
        allCategoryIds.add(categoryId);
        // Find all children of this category
        categoriesData
          .filter(cat => cat.parentId === categoryId)
          .forEach(child => addCategoryAndChildren(child.id));
      };
      
      ribbonCategoryIds.forEach(id => addCategoryAndChildren(id));
      
      // Filter articles by these category IDs
      filtered = filtered.filter((article) => {
        // First check if article has a category ID
        if (article.categoryId) {
          return allCategoryIds.has(article.categoryId);
        }
        // Otherwise check by category name
        const categoryName = article.category;
        const category = categoriesData.find(cat => cat.name === categoryName);
        return category && allCategoryIds.has(category.id);
      });

      // Special handling for "politics" filter - filter News & Politics articles
      if (ribbonCategory === "politics") {
        filtered = filtered.filter((article) =>
          article.title.toLowerCase().includes("politic") ||
          article.content.toLowerCase().includes("politic") ||
          article.category.toLowerCase().includes("politic")
        );
      }
    }

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
    if (locationSearchTerm) {
      const searchLower = locationSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (article) =>
          article.location && 
          article.location.toLowerCase().includes(searchLower)
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
    locationSearchTerm,
    filterChannels,
    ribbonCategory,
    ribbonCategoryIds,
    categoriesData,
  ]);

  // Handle category toggle
  const toggleCategory = (category: string) => {
    setFilterCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
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
    setLocationSearchTerm("");
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
    (locationSearchTerm ? 1 : 0) +
    filterChannels.length;

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar selectedChannelId={user ? selectedChannelId : undefined} />

      {/* Market Ticker */}
      <MarketTicker />

      <CategoryRibbon
        selectedCategory={ribbonCategory ?? undefined}
        onCategorySelect={(categoryId, dbIds) => {
          setRibbonCategory(categoryId);
          setRibbonCategoryIds(dbIds);
          // Clear other filters when selecting a ribbon category
          if (categoryId) {
            setFilterCategories([]);
            setSearchTerm("");
          }
        }}
        userLocation={userLocation}
        onLocationClick={() => {
          // TODO: Implement location picker
          console.log("Location picker not yet implemented");
        }}
      />

      <div className="container mx-auto p-4 lg:p-8">
        {/* Main content area with Articles and Channels - moved up to wrap headers too */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Articles section with header - takes up 2/3 on large screens */}
          <div className="lg:col-span-2 space-y-4">
            {/* Header section */}
            <div>
              <h1 className="text-4xl font-bold">
                {ribbonCategory 
                  ? ribbonCategory.charAt(0).toUpperCase() + ribbonCategory.slice(1) + " News"
                  : user 
                    ? "Your Feed" 
                    : "Popular Articles"}
              </h1>
              <div className="flex justify-between items-center mt-2">
                <p className="text-muted-foreground">
                  {ribbonCategory
                    ? `Showing ${ribbonCategory} articles`
                    : user
                      ? "Latest articles from your favorite channels"
                      : "Want to interact or write your own articles? Sign up or log in!"}
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
                        <div className="space-y-2">
                          <Label htmlFor="location-search">Location</Label>
                          <div className="relative">
                            <MapPin className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="location-search"
                              placeholder="Search by location..."
                              className="pl-8"
                              value={locationSearchTerm}
                              onChange={(e) => {
                                setLocationSearchTerm(e.target.value);
                                setShowLocationSuggestions(true);
                              }}
                              onFocus={() => setShowLocationSuggestions(true)}
                              onBlur={() => {
                                // Delay to allow clicking on suggestions
                                setTimeout(() => setShowLocationSuggestions(false), 200);
                              }}
                            />
                            
                            {/* Typeahead suggestions */}
                            {showLocationSuggestions && locationSearchTerm && (
                              <div className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md z-50">
                                {availableLocations
                                  .filter(location => 
                                    location.toLowerCase().includes(locationSearchTerm.toLowerCase())
                                  )
                                  .slice(0, 8) // Show max 8 suggestions
                                  .map((location) => (
                                    <button
                                      key={location}
                                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                                      onClick={() => {
                                        setLocationSearchTerm(location);
                                        setShowLocationSuggestions(false);
                                      }}
                                    >
                                      <MapPin className="h-3 w-3" />
                                      {location}
                                    </button>
                                  ))
                                }
                                {availableLocations.filter(location => 
                                  location.toLowerCase().includes(locationSearchTerm.toLowerCase())
                                ).length === 0 && (
                                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                                    No locations found
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          {locationSearchTerm && (
                            <p className="text-xs text-muted-foreground">
                              Filtering articles from "{locationSearchTerm}"
                            </p>
                          )}
                        </div>

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

                {locationSearchTerm && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    Location: {locationSearchTerm}
                    <button
                      className="ml-1 hover:text-destructive"
                      onClick={() => setLocationSearchTerm("")}
                    >
                      ×
                    </button>
                  </Badge>
                )}

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

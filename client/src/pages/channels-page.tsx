import { useQuery } from "@tanstack/react-query";
import { Channel } from "@shared/schema";
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
import { AuthDialog } from "@/components/auth-dialog";

// Define ordering options
type OrderField = "createdAt" | "subscriberCount" | "articleCount";
type OrderDirection = "asc" | "desc";

// Define a more flexible type for channel that accommodates both camelCase and snake_case
type ChannelWithStats = Channel & {
  created_at?: string;
  createdAt?: string;
  subscriberCount?: number;
  subscriber_count?: number;
  subscribers?: any[];
  article_count?: number;
  user_id?: number; // Add snake_case version of userId
  _count?: {
    subscribers?: number;
    articles?: number;
  };
};

interface OrderOption {
  field: OrderField;
  label: string;
  direction: OrderDirection;
}

export default function ChannelsPage() {
  const { user } = useAuth();
  const [orderField, setOrderField] = useState<OrderField>("createdAt");
  const [orderDirection, setOrderDirection] = useState<OrderDirection>("desc");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filteredChannels, setFilteredChannels] = useState<ChannelWithStats[]>(
    []
  );
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Get all channels
  const { data: channels, isLoading: loadingChannels } = useQuery<
    ChannelWithStats[]
  >({
    queryKey: ["/api/channels"],
  });

  // Extract available categories from channels
  useEffect(() => {
    if (channels && channels.length > 0) {
      const categories = Array.from(
        new Set(
          channels
            .map((channel) => channel.category)
            .filter((category): category is string => !!category)
        )
      );
      setAvailableCategories(categories);
    }
  }, [channels]);

  // Apply filters and ordering to channels
  useEffect(() => {
    if (channels) {
      let filtered = [...channels];

      // Filter out user's own channels
      if (user) {
        filtered = filtered.filter((channel) => {
          // Filter out channels owned by current user - check both camelCase and snake_case
          return channel.userId !== user.id && channel.user_id !== user.id;
        });
      }

      // Apply search filter
      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (channel) =>
            (channel.name &&
              channel.name.toLowerCase().includes(lowerSearchTerm)) ||
            (channel.description &&
              channel.description.toLowerCase().includes(lowerSearchTerm))
        );
      }

      // Apply category filter
      if (filterCategories.length > 0) {
        filtered = filtered.filter(
          (channel) =>
            channel.category && filterCategories.includes(channel.category)
        );
      }

      // Apply ordering
      filtered.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (orderField === "createdAt") {
          aValue = new Date(a.created_at || 0).getTime();
          bValue = new Date(b.created_at || 0).getTime();
        } else if (orderField === "subscriberCount") {
          aValue =
            a.subscriberCount ||
            a.subscriber_count ||
            a._count?.subscribers ||
            0;
          bValue =
            b.subscriberCount ||
            b.subscriber_count ||
            b._count?.subscribers ||
            0;
        } else if (orderField === "articleCount") {
          aValue = a.article_count || a._count?.articles || 0;
          bValue = b.article_count || b._count?.articles || 0;
        } else {
          aValue = 0;
          bValue = 0;
        }

        return orderDirection === "asc" ? aValue - bValue : bValue - aValue;
      });

      setFilteredChannels(filtered);
    }
  }, [
    channels,
    searchTerm,
    filterCategories,
    orderField,
    orderDirection,
    user,
  ]);

  const toggleCategory = (category: string) => {
    setFilterCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const toggleDirection = () => {
    setOrderDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilterCategories([]);
    setOrderField("createdAt");
    setOrderDirection("desc");
  };

  const getOrderFieldLabel = (field: OrderField): string => {
    switch (field) {
      case "createdAt":
        return "Date Created";
      case "subscriberCount":
        return "Subscriber Count";
      case "articleCount":
        return "Article Count";
      default:
        return field;
    }
  };

  // Count active filters
  const activeFilterCount =
    (orderField !== "createdAt" ? 1 : 0) +
    (searchTerm ? 1 : 0) +
    filterCategories.length;

  return (
    <div className="min-h-screen bg-background">
      <NavigationBar />
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <div className="mb-6">
              <h1 className="text-3xl font-bold">Explore Channels</h1>
              <p className="text-muted-foreground mt-2">
                Discover and subscribe to channels that interest you
              </p>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* Channel controls */}
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
                      <DropdownMenuLabel>Sort Channels By</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup
                        value={orderField}
                        onValueChange={(value) =>
                          setOrderField(value as OrderField)
                        }
                      >
                        <DropdownMenuRadioItem value="createdAt">
                          Date Created
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="subscriberCount">
                          Subscriber Count
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="articleCount">
                          Article Count
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
                        <h4 className="font-medium">Filter Channels</h4>

                        {/* Search */}
                        <div className="space-y-2">
                          <Label htmlFor="search">Search</Label>
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="search"
                              placeholder="Search by name or description..."
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
                                    className="text-sm cursor-pointer"
                                  >
                                    {category}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {user && (
                <Link href="/channels/new">
                  <Button size="sm" className="whitespace-nowrap">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Create Channel
                  </Button>
                </Link>
              )}
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

            {/* Channels list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {loadingChannels ? (
                <div className="col-span-full flex justify-center my-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  {channels && channels.length > 0
                    ? "No channels match your filters"
                    : "No channels yet"}
                </div>
              ) : (
                filteredChannels.map((channel) => (
                  <ChannelCard key={channel.id} channel={channel} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useForm } from "react-hook-form";
import {
  insertArticleSchema,
  type InsertArticle,
  Channel,
  Article,
} from "@shared/schema";
import { ArticleWithSnakeCase } from "@/types/article";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, ChevronRight, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Define extended types for hierarchical structures
interface CategoryWithChildren {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string | null;
  children?: CategoryWithChildren[];
}

interface LocationWithChildren {
  id: number;
  name: string;
  parent_id: number | null;
  type: string;
  created_at: string | null;
  children?: LocationWithChildren[];
}

// Enhanced Autocomplete component for categories and locations
function EnhancedAutocomplete({
  items,
  placeholder,
  onSelect,
  value,
  isLoading,
  showSelectedValueInSearch = false,
  className,
}: {
  items: { id: number; label: string }[];
  placeholder: string;
  onSelect: (id: number) => void;
  value?: number | string;
  isLoading?: boolean;
  showSelectedValueInSearch?: boolean;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Find selected item when value changes
  useEffect(() => {
    if (value && items.length > 0) {
      const found = items.find(
        (item) =>
          item.id === (typeof value === "string" ? parseInt(value) : value)
      );
      if (found) {
        setSelectedItem(found);
        if (showSelectedValueInSearch) {
          setSearch(found.label);
        }
      }
    } else {
      setSelectedItem(null);
      if (!showResults) {
        setSearch("");
      }
    }
  }, [value, items, showSelectedValueInSearch]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!search) {
      // When no search term, show recent or top items
      return items.slice(0, 10);
    }

    // Add fuzzy search for better matching
    const searchLower = search.toLowerCase();
    return items
      .filter((item) => {
        const labelLower = item.label.toLowerCase();
        return labelLower.includes(searchLower);
      })
      .sort((a, b) => {
        // Sort with exact matches first, then by starts with, then contains
        const aLower = a.label.toLowerCase();
        const bLower = b.label.toLowerCase();

        const aExact = aLower === searchLower;
        const bExact = bLower === searchLower;

        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        const aStarts = aLower.startsWith(searchLower);
        const bStarts = bLower.startsWith(searchLower);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return aLower.localeCompare(bLower);
      })
      .slice(0, 10); // Limit to 10 results
  }, [items, search]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className={`relative mb-2 ${className || ""}`}>
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="pl-8"
        />
        {!isLoading && selectedItem && (
          <div className="absolute right-2 top-2 flex items-center text-xs text-muted-foreground">
            <span className="mr-1">Selected:</span>
            <span className="max-w-[150px] truncate">{selectedItem.label}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-input bg-popover p-2 text-center shadow-md">
          <Loader2 className="inline-block h-4 w-4 animate-spin mr-2" />
          Loading...
        </div>
      ) : (
        showResults && (
          <div
            ref={resultsRef}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-input bg-popover shadow-md"
          >
            {filteredItems.length > 0 ? (
              <div className="p-1">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                      selectedItem?.id === item.id ? "bg-accent/50" : ""
                    }`}
                    onClick={() => {
                      onSelect(item.id);
                      setSelectedItem(item);
                      if (!showSelectedValueInSearch) {
                        setSearch("");
                      } else {
                        setSearch(item.label);
                      }
                      setShowResults(false);
                    }}
                  >
                    <div className="flex-grow truncate">{item.label}</div>
                    {selectedItem?.id === item.id && (
                      <div className="ml-2 text-primary">✓</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2 text-center text-sm text-muted-foreground">
                No results found
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}

export function ArticleEditor({
  channels,
  existingArticle,
  defaultChannelId,
}: {
  channels: Channel[];
  existingArticle?: ArticleWithSnakeCase;
  defaultChannelId?: number;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [isDraft, setIsDraft] = useState(
    existingArticle
      ? existingArticle.status === "draft" ||
          existingArticle.published === false
      : false
  );

  // Fetch categories from API
  const { data: categories, isLoading: isLoadingCategories } = useQuery<
    CategoryWithChildren[]
  >({
    queryKey: ["/api/categories"],
  });

  // Fetch locations from API
  const { data: locations, isLoading: isLoadingLocations } = useQuery<
    LocationWithChildren[]
  >({
    queryKey: ["/api/locations"],
  });

  const form = useForm<InsertArticle>({
    defaultValues: {
      title: existingArticle?.title || "",
      content: existingArticle?.content || "",
      channelId:
        existingArticle?.channelId ||
        existingArticle?.channel_id ||
        defaultChannelId ||
        (channels && channels.length > 0 ? channels[0].id : undefined),
      category: existingArticle?.category || "",
      location: existingArticle?.location || "",
      locationId: existingArticle?.locationId || undefined,
      categoryId: existingArticle?.categoryId || undefined,
      published: existingArticle ? existingArticle.published !== false : true,
      status: existingArticle
        ? existingArticle.status ||
          (existingArticle.published === false ? "draft" : "published")
        : isDraft
        ? "draft"
        : "published",
    },
    resolver: zodResolver(
      z.object({
        title: z.string().min(1, "Title is required"),
        content: z.string().min(1, "Content is required"),
        channelId: z.number({ required_error: "Please select a channel" }),
        // Other fields can remain optional or have their own validation
        categoryId: z.any().optional(),
        locationId: z.any().optional(),
        category: z.string().optional(),
        location: z.string().optional(),
        published: z.boolean().optional(),
        status: z.string().optional(),
      })
    ),
  });

  // Update status when isDraft changes
  useEffect(() => {
    form.setValue("status", isDraft ? "draft" : "published");
    form.setValue("published", !isDraft);
  }, [isDraft, form]);

  // Set default channelId when channels are loaded or defaultChannelId changes
  useEffect(() => {
    if (defaultChannelId) {
      form.setValue("channelId", defaultChannelId);
    } else if (
      channels &&
      channels.length > 0 &&
      !form.getValues("channelId")
    ) {
      form.setValue("channelId", channels[0].id);
    }
  }, [channels, form, defaultChannelId]);

  // Extract all categories into a flat list for search
  const flatCategories = useMemo(() => {
    const flattenCategories = (
      items: CategoryWithChildren[] = [],
      path = ""
    ): { id: number; label: string }[] => {
      return items.flatMap((item) => {
        const label = path ? `${path} > ${item.name}` : item.name;
        return [
          { id: item.id, label },
          ...(item.children ? flattenCategories(item.children, label) : []),
        ];
      });
    };

    return categories ? flattenCategories(categories) : [];
  }, [categories]);

  // Extract all locations into a flat list for search
  const flatLocations = useMemo(() => {
    const flattenLocations = (
      items: LocationWithChildren[] = [],
      path = ""
    ): { id: number; label: string }[] => {
      return items.flatMap((item) => {
        const label = path
          ? `${path} > ${item.name}${item.type ? ` (${item.type})` : ""}`
          : `${item.name}${item.type ? ` (${item.type})` : ""}`;
        return [
          { id: item.id, label },
          ...(item.children ? flattenLocations(item.children, label) : []),
        ];
      });
    };

    return locations ? flattenLocations(locations) : [];
  }, [locations]);

  // Handle form submission
  const onSubmit = async (data: InsertArticle) => {
    console.log("Form submitted with data:", data);
    if (!user) {
      console.error("No user found");
      toast({
        title: "Error",
        description: "You must be logged in to create an article",
        variant: "destructive",
      });
      return;
    }

    // Validate that channel is selected
    if (!data.channelId) {
      toast({
        title: "Error",
        description: "Please select a channel for this article",
        variant: "destructive",
      });
      return;
    }

    // Get the location name if locationId is provided
    let locationName = "";
    if (data.locationId && locations) {
      // Helper function to find a location by ID in the nested structure
      const findLocation = (
        items: LocationWithChildren[],
        id: number
      ): LocationWithChildren | undefined => {
        for (const item of items) {
          if (item.id === id) return item;
          if (item.children) {
            const found = findLocation(item.children, id);
            if (found) return found;
          }
        }
        return undefined;
      };

      const location = findLocation(
        locations,
        typeof data.locationId === "string"
          ? parseInt(data.locationId)
          : data.locationId
      );

      if (location) {
        locationName = location.name;
      }
    }

    // Process special values for categoryId and locationId
    const processedData = {
      ...data,
      userId: user.id,
      channelId: data.channelId,
      // Don't set a default category if none is selected
      category: data.category === "Other" ? "" : data.category,
      categoryId:
        data.categoryId &&
        typeof data.categoryId === "string" &&
        (data.categoryId === "no-categories" ||
          isNaN(parseInt(data.categoryId)))
          ? undefined
          : data.categoryId,
      locationId:
        data.locationId &&
        typeof data.locationId === "string" &&
        (data.locationId === "no-location" ||
          data.locationId === "no-locations" ||
          isNaN(parseInt(data.locationId)))
          ? undefined
          : data.locationId,
      // Set the location name based on the selected locationId
      location: locationName || data.location || "",
    };

    console.log("Submitting article with data:", processedData);

    if (existingArticle) {
      // Update existing article
      await updateArticleMutation.mutate(processedData);
    } else {
      // Create new article
      await createArticleMutation.mutate(processedData);
    }
  };

  const createArticleMutation = useMutation({
    mutationFn: async (data: InsertArticle) => {
      console.log("Making API request with data:", data);
      const res = await apiRequest("POST", "/api/articles", data);
      if (!res.ok) {
        const error = await res.json();
        console.error("API error:", error);
        throw new Error(error.message || "Failed to create article");
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate the articles query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });

      toast({
        title: "Success",
        description: isDraft
          ? "Article saved as draft"
          : "Article published successfully",
      });

      // Navigate to the individual article page instead of the listing page
      setTimeout(() => {
        window.location.href = `/articles/${data.id}`;
      }, 1500);
    },
    onError: (error: Error) => {
      console.error("Mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create article",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating an article
  const updateArticleMutation = useMutation({
    mutationFn: async (data: InsertArticle) => {
      console.log("Making API request to update article:", data);
      const res = await apiRequest(
        "PATCH",
        `/api/articles/${existingArticle!.id}`,
        data
      );
      if (!res.ok) {
        const error = await res.json();
        console.error("API error:", error);
        throw new Error(error.message || "Failed to update article");
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate the articles query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${existingArticle!.id}`],
      });

      toast({
        title: "Success",
        description: isDraft
          ? "Article saved as draft"
          : "Article updated successfully",
      });

      // Navigate to the individual article page
      setTimeout(() => {
        window.location.href = `/articles/${data.id}`;
      }, 1500);
    },
    onError: (error: Error) => {
      console.error("Mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update article",
        variant: "destructive",
      });
    },
  });

  // Helper function to render nested categories
  const renderCategoryOptions = (
    categoryList: CategoryWithChildren[] = [],
    level = 0
  ): JSX.Element[] => {
    return categoryList.map((category) => (
      <React.Fragment key={category.id}>
        <SelectItem
          value={category.id.toString()}
          className={`pl-${level * 4}`}
        >
          {level > 0 && <span className="mr-2">↳</span>}
          {category.name}
        </SelectItem>
        {category.children &&
          category.children.length > 0 &&
          renderCategoryOptions(category.children, level + 1)}
      </React.Fragment>
    ));
  };

  // Helper function to render location dropdown options
  const renderLocationOptions = (
    locationList: LocationWithChildren[] = [],
    level = 0
  ): JSX.Element[] => {
    return locationList.map((location) => (
      <React.Fragment key={location.id}>
        <SelectItem
          value={location.id.toString()}
          className={`pl-${level * 4}`}
        >
          {level > 0 && <span className="mr-2">↳</span>}
          {location.name}{" "}
          {location.type && (
            <span className="text-muted-foreground">({location.type})</span>
          )}
        </SelectItem>
        {location.children &&
          location.children.length > 0 &&
          renderLocationOptions(location.children, level + 1)}
      </React.Fragment>
    ));
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          console.log("Form submitted!");
          form.handleSubmit(onSubmit)(e);
        }}
        className="space-y-6"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Article title" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="channelId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Channel</FormLabel>
              {channels && channels.length > 0 ? (
                channels.length === 1 ? (
                  // When there's only one channel, just show its name without a dropdown
                  // Set the field value to the only channel's ID and show the name
                  <div className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {(() => {
                      // Update the field value to ensure it's set to the only channel
                      if (field.value !== channels[0].id) {
                        field.onChange(channels[0].id);
                      }
                      return channels[0].name;
                    })()}
                  </div>
                ) : (
                  // Multiple channels - show dropdown
                  <Select
                    value={field.value?.toString() || ""}
                    onValueChange={(value) => {
                      if (value) {
                        field.onChange(parseInt(value));
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a channel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {channels.map((channel) => (
                        <SelectItem
                          key={channel.id}
                          value={channel.id.toString()}
                        >
                          {channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div className="text-red-500 text-sm">
                  No channels available. Please create a channel first.
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                {!isLoadingCategories && (
                  <EnhancedAutocomplete
                    items={flatCategories}
                    placeholder="Search for a category or select from dropdown..."
                    value={field.value}
                    isLoading={isLoadingCategories}
                    onSelect={(id) => {
                      field.onChange(id);

                      // Also set the text category field for backwards compatibility
                      const findCategory = (
                        cats: CategoryWithChildren[]
                      ): CategoryWithChildren | undefined => {
                        for (const cat of cats) {
                          if (cat.id === id) return cat;
                          if (cat.children) {
                            const found = findCategory(cat.children);
                            if (found) return found;
                          }
                        }
                        return undefined;
                      };

                      if (categories) {
                        const selectedCategory = findCategory(categories);
                        if (selectedCategory) {
                          form.setValue("category", selectedCategory.name);
                        }
                      }
                    }}
                  />
                )}
                <Select
                  value={field.value?.toString() || ""}
                  onValueChange={(value) => {
                    field.onChange(value ? parseInt(value) : undefined);

                    // Also set the text category field for backwards compatibility
                    if (value && categories) {
                      const selectedCategory =
                        categories.find((c) => c.id.toString() === value) ||
                        categories
                          .flatMap((c) => c.children || [])
                          .find((c) => c.id.toString() === value);

                      if (selectedCategory) {
                        form.setValue("category", selectedCategory.name);
                      }
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-80">
                    {isLoadingCategories ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading categories...
                      </div>
                    ) : categories ? (
                      renderCategoryOptions(categories)
                    ) : (
                      <SelectItem value="no-categories">
                        No categories available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="locationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location (optional)</FormLabel>
                {!isLoadingLocations && (
                  <EnhancedAutocomplete
                    items={flatLocations}
                    placeholder="Search for a location or select from dropdown..."
                    value={field.value}
                    isLoading={isLoadingLocations}
                    onSelect={(id) => {
                      field.onChange(id);

                      // Also set the text location field for backwards compatibility
                      const findLocation = (
                        locs: LocationWithChildren[]
                      ): LocationWithChildren | undefined => {
                        for (const loc of locs) {
                          if (loc.id === id) return loc;
                          if (loc.children) {
                            const found = findLocation(loc.children);
                            if (found) return found;
                          }
                        }
                        return undefined;
                      };

                      if (locations) {
                        const selectedLocation = findLocation(locations);
                        if (selectedLocation) {
                          form.setValue("location", selectedLocation.name);
                          console.log(
                            `Set location name to: ${selectedLocation.name}`
                          );
                        }
                      }
                    }}
                  />
                )}
                <Select
                  value={field.value?.toString() || ""}
                  onValueChange={(value) => {
                    field.onChange(
                      value === "no-location"
                        ? undefined
                        : value
                        ? parseInt(value)
                        : undefined
                    );

                    // Also set the text location field for backwards compatibility
                    if (value && value !== "no-location" && locations) {
                      const findLocation = (
                        locs: LocationWithChildren[]
                      ): LocationWithChildren | undefined => {
                        for (const loc of locs) {
                          if (loc.id.toString() === value) return loc;
                          if (loc.children) {
                            const found = findLocation(loc.children);
                            if (found) return found;
                          }
                        }
                        return undefined;
                      };

                      const selectedLocation = findLocation(locations);
                      if (selectedLocation) {
                        form.setValue("location", selectedLocation.name);
                        console.log(
                          `Set location name to: ${selectedLocation.name}`
                        );
                      }
                    } else if (value === "no-location") {
                      form.setValue("location", "");
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a location" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-80">
                    <SelectItem value="no-location">
                      No specific location
                    </SelectItem>
                    {isLoadingLocations ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading locations...
                      </div>
                    ) : locations ? (
                      renderLocationOptions(locations)
                    ) : (
                      <SelectItem value="no-locations">
                        No locations available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Select a location to help readers find geographically relevant
                  content
                </FormDescription>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={`Write your article content here...
Use blank lines to create paragraphs.
Your formatting will be preserved.`}
                  className="min-h-[300px] max-h-[300px] overflow-y-auto font-sans"
                  {...field}
                  // Ensure proper handling of line breaks
                  onChange={(e) => {
                    // Use the raw value to preserve all line breaks
                    field.onChange(e.target.value);
                  }}
                />
              </FormControl>
              <p className="text-sm text-muted-foreground mt-1">
                Tip: Use blank lines to create paragraphs. Your formatting will
                be preserved.
              </p>
            </FormItem>
          )}
        />

        <div className="flex items-center space-x-2 mb-4">
          <Switch
            id="draft-mode"
            checked={isDraft}
            onCheckedChange={setIsDraft}
          />
          <Label htmlFor="draft-mode">Save as draft</Label>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={
            createArticleMutation.isPending || updateArticleMutation?.isPending
          }
        >
          {createArticleMutation.isPending ||
          updateArticleMutation?.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {existingArticle
                ? isDraft
                  ? "Saving..."
                  : "Updating..."
                : isDraft
                ? "Saving..."
                : "Publishing..."}
            </>
          ) : existingArticle ? (
            isDraft ? (
              "Save Draft"
            ) : (
              "Update Article"
            )
          ) : isDraft ? (
            "Save Draft"
          ) : (
            "Publish Article"
          )}
        </Button>
      </form>
    </Form>
  );
}

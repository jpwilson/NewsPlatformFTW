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
import {
  MapboxLocationPicker as BaseMapboxLocationPicker,
  type MapboxLocation,
} from "@/components/ui/MapboxLocationPicker";
import { StandaloneLocationPicker } from "@/components/ui/StandaloneLocationPicker";
import { ImageUpload } from "@/components/image-upload";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import imageCompression from "browser-image-compression";
import { useQueryClient } from "@tanstack/react-query";
import { supabase as defaultSupabase } from "@/lib/supabase"; // Import the default client
import { RichTextEditor } from "./rich-text-editor";

// Re-export the MapboxLocationPicker, StandaloneLocationPicker, and MapboxLocation for use in other components
export { MapboxLocation };
export { StandaloneLocationPicker };
export const MapboxLocationPicker = BaseMapboxLocationPicker;

// Define extended types for hierarchical structures
export interface CategoryWithChildren {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string | null;
  children?: CategoryWithChildren[];
}

export interface LocationWithChildren {
  id: number;
  name: string;
  parent_id: number | null;
  type: string;
  created_at: string | null;
  children?: LocationWithChildren[];
}

// New component for hierarchical category selection
export function HierarchicalCategorySelect({
  categories,
  value,
  onChange,
  isLoading,
  onSelectMultiple,
  multipleSelections = [],
}: {
  categories: CategoryWithChildren[];
  value?: number | string;
  onChange: (value: number) => void;
  isLoading?: boolean;
  onSelectMultiple?: (selections: { id: number; path: string }[]) => void;
  multipleSelections?: { id: number; path: string }[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [level, setLevel] = useState<number>(0);
  const [selectedParent, setSelectedParent] =
    useState<CategoryWithChildren | null>(null);
  const [selectedSecondLevel, setSelectedSecondLevel] =
    useState<CategoryWithChildren | null>(null);
  const [selections, setSelections] = useState<{ id: number; path: string }[]>(
    multipleSelections || []
  );

  // Update local selections when props change
  useEffect(() => {
    if (multipleSelections && multipleSelections.length > 0) {
      setSelections(multipleSelections);
    }
  }, [multipleSelections]);

  // Reset the selection when categories change
  useEffect(() => {
    if (value && categories.length > 0) {
      // Find the category matching the selected value
      const findCategory = (
        cats: CategoryWithChildren[],
        id: number
      ):
        | {
            category: CategoryWithChildren;
            level: number;
            parent?: CategoryWithChildren;
            secondLevel?: CategoryWithChildren;
          }
        | undefined => {
        // Check top level
        for (const cat of cats) {
          if (cat.id === id) {
            return { category: cat, level: 0 };
          }

          // Check second level
          if (cat.children) {
            for (const child of cat.children) {
              if (child.id === id) {
                return { category: child, level: 1, parent: cat };
              }

              // Check third level
              if (child.children) {
                for (const grandchild of child.children) {
                  if (grandchild.id === id) {
                    return {
                      category: grandchild,
                      level: 2,
                      parent: cat,
                      secondLevel: child,
                    };
                  }
                }
              }
            }
          }
        }
        return undefined;
      };

      const found = findCategory(
        categories,
        typeof value === "string" ? parseInt(value) : value
      );

      if (found) {
        if (found.level === 0) {
          setSelectedParent(found.category);
          setSelectedSecondLevel(null);
          setLevel(1); // Show second level
        } else if (found.level === 1) {
          setSelectedParent(found.parent || null);
          setSelectedSecondLevel(found.category);
          setLevel(2); // Show third level
        } else if (found.level === 2) {
          setSelectedParent(found.parent || null);
          setSelectedSecondLevel(found.secondLevel || null);
          setLevel(2); // Keeping at third level
        }
      }
    }
  }, [value, categories]);

  const handleSelectCategory = (
    category: CategoryWithChildren,
    currentLevel: number
  ) => {
    // Always set the value to the selected category ID
    onChange(category.id);

    // Create a path string for this category selection
    let path = "";
    if (currentLevel === 0) {
      path = category.name;
    } else if (currentLevel === 1) {
      path = `${selectedParent?.name} > ${category.name}`;
    } else if (currentLevel === 2) {
      path = `${selectedParent?.name} > ${selectedSecondLevel?.name} > ${category.name}`;
    }

    // Add to selections if this is a leaf node (level 2 or no children)
    if (
      currentLevel === 2 ||
      !category.children ||
      category.children.length === 0
    ) {
      // Check if we already have this category ID
      if (!selections.some((s) => s.id === category.id)) {
        // Limit to 3 selections
        const newSelections = [...selections, { id: category.id, path }].slice(
          -3
        );
        setSelections(newSelections);
        if (onSelectMultiple) {
          onSelectMultiple(newSelections);
        }
      }
    }

    if (currentLevel === 0) {
      // Selected from top level
      setSelectedParent(category);
      setSelectedSecondLevel(null);
      if (category.children && category.children.length > 0) {
        setLevel(1); // Show second level
      } else {
        setLevel(0); // Stay at top level if no children
        setIsExpanded(false); // Close dropdown after selection if no children
      }
    } else if (currentLevel === 1) {
      // Selected from second level
      setSelectedSecondLevel(category);
      if (category.children && category.children.length > 0) {
        setLevel(2); // Show third level
      } else {
        setLevel(1); // Stay at second level if no children
        setIsExpanded(false); // Close dropdown after selection if no children
      }
    } else {
      // Selected from third level
      setIsExpanded(false); // Close dropdown after selection
    }
  };

  const goBack = () => {
    if (level === 2) {
      setLevel(1);
      setSelectedSecondLevel(null);
    } else if (level === 1) {
      setLevel(0);
      setSelectedParent(null);
    }
  };

  // Remove a selection by ID
  const removeSelection = (id: number) => {
    const newSelections = selections.filter((s) => s.id !== id);
    setSelections(newSelections);
    if (onSelectMultiple) {
      onSelectMultiple(newSelections);
    }
  };

  // Get the current list of categories to display based on level
  const currentCategories = useMemo(() => {
    if (level === 0) {
      return categories;
    } else if (level === 1 && selectedParent && selectedParent.children) {
      return selectedParent.children;
    } else if (
      level === 2 &&
      selectedSecondLevel &&
      selectedSecondLevel.children
    ) {
      return selectedSecondLevel.children;
    }
    return [];
  }, [categories, level, selectedParent, selectedSecondLevel]);

  // Get the current path display
  const categoryPath = useMemo(() => {
    const path = [];
    if (selectedParent) {
      path.push(selectedParent.name);
    }
    if (selectedSecondLevel) {
      path.push(selectedSecondLevel.name);
    }
    return path.join(" > ");
  }, [selectedParent, selectedSecondLevel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 border rounded-md">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading categories...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="border rounded-md cursor-pointer p-2 flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {categoryPath ? (
          <div className="text-sm">
            <span className="font-medium">Browsing:</span>
            <span className="ml-1">{categoryPath}</span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Select a category</div>
        )}
        <ChevronRight
          className={`h-4 w-4 transform transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </div>

      {isExpanded && (
        <div className="relative border rounded-md shadow-sm">
          {level > 0 && (
            <button
              type="button"
              className="absolute left-2 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-accent rounded-full bg-primary/20"
              onClick={(e) => {
                e.stopPropagation();
                goBack();
              }}
            >
              <ChevronRight className="h-5 w-5 transform rotate-180 text-primary font-bold" />
            </button>
          )}

          <div className="py-2 px-2">
            <div className="font-medium text-sm mb-2 pl-6">
              {level === 0
                ? "Select a category"
                : level === 1
                ? `Select subcategory for ${selectedParent?.name}`
                : `Select option for ${selectedSecondLevel?.name}`}
            </div>

            <div className="space-y-1 max-h-40 overflow-y-auto">
              {currentCategories.length > 0 ? (
                currentCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm flex items-center justify-between ${
                      selections.some((s) => s.id === category.id)
                        ? "bg-primary/10"
                        : ""
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectCategory(category, level);
                    }}
                  >
                    <span>{category.name}</span>
                    {category.children &&
                    category.children.length > 0 &&
                    level < 2 ? (
                      <ChevronRight className="h-5 w-5 text-primary font-bold" />
                    ) : selections.some((s) => s.id === category.id) ? (
                      <div className="text-primary text-sm">✓</div>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground px-3 py-2">
                  No categories available at this level
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Display selected categories */}
      {selections.length > 0 && (
        <div className="mt-2 mb-3">
          <div className="text-sm font-medium mb-1">
            Selected Categories ({selections.length}/3):
          </div>
          <div className="flex flex-wrap gap-2">
            {selections.map((selection) => (
              <div
                key={selection.id}
                className="inline-flex items-center bg-primary/10 text-primary text-xs rounded-full px-3 py-1"
              >
                <span className="mr-1">{selection.path}</span>
                <button
                  type="button"
                  className="hover:bg-primary/20 rounded-full p-0.5"
                  onClick={() => removeSelection(selection.id)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced Autocomplete component for categories and locations
export function EnhancedAutocomplete({
  items,
  placeholder,
  onSelect,
  value,
  isLoading,
  className,
}: {
  items: { id: number; label: string }[];
  placeholder: string;
  onSelect: (id: number) => void;
  value?: number | string;
  isLoading?: boolean;
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
      }
    } else {
      setSelectedItem(null);
      if (!showResults) {
        setSearch("");
      }
    }
  }, [value, items]);

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
                      setSearch("");
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

// New component for hierarchical location selection
/**
 * @deprecated Use MapboxLocationPicker instead for better location selection with coordinates
 */
export function HierarchicalLocationSelect({
  locations,
  value,
  onChange,
  isLoading,
}: {
  locations: LocationWithChildren[];
  value?: number | string;
  onChange: (value: number) => void;
  isLoading?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [level, setLevel] = useState<number>(0);
  const [selectedParent, setSelectedParent] =
    useState<LocationWithChildren | null>(null);
  const [selectedSecondLevel, setSelectedSecondLevel] =
    useState<LocationWithChildren | null>(null);

  // Reset the selection when locations change
  useEffect(() => {
    if (value && locations.length > 0) {
      // Find the location matching the selected value
      const findLocation = (
        locs: LocationWithChildren[],
        id: number
      ):
        | {
            location: LocationWithChildren;
            level: number;
            parent?: LocationWithChildren;
            secondLevel?: LocationWithChildren;
          }
        | undefined => {
        // Check top level
        for (const loc of locs) {
          if (loc.id === id) {
            return { location: loc, level: 0 };
          }

          // Check second level
          if (loc.children) {
            for (const child of loc.children) {
              if (child.id === id) {
                return { location: child, level: 1, parent: loc };
              }

              // Check third level
              if (child.children) {
                for (const grandchild of child.children) {
                  if (grandchild.id === id) {
                    return {
                      location: grandchild,
                      level: 2,
                      parent: loc,
                      secondLevel: child,
                    };
                  }
                }
              }
            }
          }
        }
        return undefined;
      };

      const found = findLocation(
        locations,
        typeof value === "string" ? parseInt(value) : value
      );

      if (found) {
        if (found.level === 0) {
          setSelectedParent(found.location);
          setSelectedSecondLevel(null);
          setLevel(1); // Show second level
        } else if (found.level === 1) {
          setSelectedParent(found.parent || null);
          setSelectedSecondLevel(found.location);
          setLevel(2); // Show third level
        } else if (found.level === 2) {
          setSelectedParent(found.parent || null);
          setSelectedSecondLevel(found.secondLevel || null);
          setLevel(2); // Keeping at third level
        }
      }
    }
  }, [value, locations]);

  const handleSelectLocation = (
    location: LocationWithChildren,
    currentLevel: number
  ) => {
    // Always set the value to the selected location ID
    onChange(location.id);

    if (currentLevel === 0) {
      // Selected from top level
      setSelectedParent(location);
      setSelectedSecondLevel(null);
      if (location.children && location.children.length > 0) {
        setLevel(1); // Show second level
      } else {
        setLevel(0); // Stay at top level if no children
        setIsExpanded(false); // Close dropdown after selection if no children
      }
    } else if (currentLevel === 1) {
      // Selected from second level
      setSelectedSecondLevel(location);
      if (location.children && location.children.length > 0) {
        setLevel(2); // Show third level
      } else {
        setLevel(1); // Stay at second level if no children
        setIsExpanded(false); // Close dropdown after selection if no children
      }
    } else {
      // Selected from third level
      setIsExpanded(false); // Close dropdown after selection
    }
  };

  const goBack = () => {
    if (level === 2) {
      setLevel(1);
      setSelectedSecondLevel(null);
    } else if (level === 1) {
      setLevel(0);
      setSelectedParent(null);
    }
  };

  // Get the current list of locations to display based on level
  const currentLocations = useMemo(() => {
    if (level === 0) {
      return locations;
    } else if (level === 1 && selectedParent && selectedParent.children) {
      return selectedParent.children;
    } else if (
      level === 2 &&
      selectedSecondLevel &&
      selectedSecondLevel.children
    ) {
      return selectedSecondLevel.children;
    }
    return [];
  }, [locations, level, selectedParent, selectedSecondLevel]);

  // Get the current path display
  const locationPath = useMemo(() => {
    const path = [];
    if (selectedParent) {
      path.push(
        selectedParent.name +
          (selectedParent.type ? ` (${selectedParent.type})` : "")
      );
    }
    if (selectedSecondLevel) {
      path.push(
        selectedSecondLevel.name +
          (selectedSecondLevel.type ? ` (${selectedSecondLevel.type})` : "")
      );
    }
    return path.join(" > ");
  }, [selectedParent, selectedSecondLevel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4 border rounded-md">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading locations...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        className="border rounded-md cursor-pointer p-2 flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {locationPath ? (
          <div className="text-sm">
            <span className="font-medium">Browsing:</span>
            <span className="ml-1">{locationPath}</span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Select a location</div>
        )}
        <ChevronRight
          className={`h-4 w-4 transform transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </div>

      {isExpanded && (
        <div className="relative border rounded-md shadow-sm">
          {level > 0 && (
            <button
              type="button"
              className="absolute left-2 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-accent rounded-full bg-primary/20"
              onClick={(e) => {
                e.stopPropagation();
                goBack();
              }}
            >
              <ChevronRight className="h-5 w-5 transform rotate-180 text-primary font-bold" />
            </button>
          )}

          <div className="py-2 px-2">
            <div className="font-medium text-sm mb-2 pl-6">
              {level === 0
                ? "Select a location"
                : level === 1
                ? `Select location in ${selectedParent?.name}`
                : `Select specific location in ${selectedSecondLevel?.name}`}
            </div>

            <div className="space-y-1 max-h-40 overflow-y-auto">
              {currentLocations.length > 0 ? (
                currentLocations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm flex items-center justify-between"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectLocation(location, level);
                    }}
                  >
                    <span>
                      {location.name}
                      {location.type && (
                        <span className="text-muted-foreground ml-1">
                          ({location.type})
                        </span>
                      )}
                    </span>
                    {location.children && location.children.length > 0 && (
                      <ChevronRight className="h-5 w-5 text-primary font-bold" />
                    )}
                  </button>
                ))
              ) : (
                <div className="text-sm text-muted-foreground px-3 py-2">
                  No locations available at this level
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {value && (
        <div className="mt-2 mb-3">
          <div className="text-sm font-medium mb-1">Selected Location:</div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex items-center bg-primary/10 text-primary text-xs rounded-full px-3 py-1">
              {locationPath}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Modified form type to include new location fields
export interface ArticleFormData extends InsertArticle {
  location_name?: string;
  location_lat?: number;
  location_lng?: number;
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
  const queryClient = useQueryClient();
  const supabaseFromHook = useSupabaseClient();
  const supabase = supabaseFromHook?.storage
    ? supabaseFromHook
    : defaultSupabase;
  const [images, setImages] = useState<{ file: File; caption: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraft, setIsDraft] = useState(
    existingArticle ? existingArticle.published === false : false
  );
  const [selectedCategories, setSelectedCategories] = useState<
    { id: number; path: string }[]
  >([]);

  // Fetch categories from API
  const { data: categories, isLoading: isLoadingCategories } = useQuery<
    CategoryWithChildren[]
  >({
    queryKey: ["/api/categories"],
  });

  // Deduplicate and process categories
  const processedCategories = useMemo(() => {
    if (!categories) return [];

    // Create a map to track seen category names at each level
    const seenCategories = new Map<string, Set<string>>();

    // Process the categories to eliminate duplicates
    const processCategories = (
      cats: CategoryWithChildren[],
      parentPath = ""
    ): CategoryWithChildren[] => {
      const result: CategoryWithChildren[] = [];
      const seenNamesAtLevel = new Set<string>();

      for (const cat of cats) {
        // Create a path key to identify this category's position in the hierarchy
        const pathKey = parentPath ? `${parentPath}/${cat.name}` : cat.name;

        // Skip if we've already seen this category name at this level
        if (seenNamesAtLevel.has(cat.name.toLowerCase())) {
          continue;
        }

        // Mark this category name as seen at this level
        seenNamesAtLevel.add(cat.name.toLowerCase());

        // Process children if any
        let processedChildren: CategoryWithChildren[] = [];
        if (cat.children && cat.children.length > 0) {
          processedChildren = processCategories(cat.children, pathKey);
        }

        // Add this category with processed children
        result.push({
          ...cat,
          children:
            processedChildren.length > 0 ? processedChildren : undefined,
        });
      }

      return result;
    };

    return processCategories(categories);
  }, [categories]);

  // Fetch locations from API
  const { data: locations, isLoading: isLoadingLocations } = useQuery<
    LocationWithChildren[]
  >({
    queryKey: ["/api/locations"],
  });

  const form = useForm<ArticleFormData>({
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
      location_name:
        existingArticle?.location_name || existingArticle?.location || "",
      location_lat: existingArticle?.location_lat || undefined,
      location_lng: existingArticle?.location_lng || undefined,
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
        category: z.string().optional(),
        location: z.string().optional(),
        location_name: z.string().optional(),
        location_lat: z.number().optional(),
        location_lng: z.number().optional(),
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

    return processedCategories ? flattenCategories(processedCategories) : [];
  }, [processedCategories]);

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

  const handleImageUpload = async (file: File) => {
    try {
      console.log("Starting image upload process");

      if (!supabase?.storage) {
        console.error("Supabase storage is not initialized");
        throw new Error("Storage service is not available");
      }

      // Compress image if it's larger than 5MB
      let imageFile = file;
      if (file.size > 5 * 1024 * 1024) {
        const options = {
          maxSizeMB: 5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        };
        imageFile = await imageCompression(file, options);
      }

      // Create a sanitized filename
      const timestamp = Date.now();
      const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filename = `${timestamp}_${sanitizedFilename}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("article-images")
        .upload(filename, imageFile);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      // Get public URL with download token
      const { data: urlData } = await supabase.storage
        .from("article-images")
        .createSignedUrl(uploadData.path, 31536000); // URL valid for 1 year

      if (!urlData?.signedUrl) {
        // Fallback to regular public URL if signed URL fails
        const {
          data: { publicUrl },
        } = supabase.storage
          .from("article-images")
          .getPublicUrl(uploadData.path);

        return publicUrl;
      }

      return urlData.signedUrl;
    } catch (error) {
      console.error("Error in handleImageUpload:", error);
      throw error;
    }
  };

  const onSubmit = async (data: ArticleFormData) => {
    setIsSubmitting(true);
    try {
      if (!user) {
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

      // Upload images first
      const imageUploads = await Promise.all(
        images.map(async (img) => {
          try {
            if (img.file) {
              const imageUrl = await handleImageUpload(img.file);
              return {
                imageUrl,
                caption: img.caption || "", // Ensure caption is never undefined
              };
            }
            return null;
          } catch (error) {
            console.error("Error uploading image:", error);
            toast({
              title: "Error",
              description: `Failed to upload image: ${img.file?.name}`,
              variant: "destructive",
            });
            return null;
          }
        })
      );

      // Filter out failed uploads and ensure caption is never undefined
      const successfulUploads = imageUploads.filter(
        (img): img is { imageUrl: string; caption: string } => img !== null
      );

      // Create the article data
      const processedData = {
        ...data,
        userId: user.id,
        channelId: data.channelId,
        category: data.category === "Other" ? "" : data.category,
        categoryId:
          data.categoryId &&
          typeof data.categoryId === "string" &&
          (data.categoryId === "no-categories" ||
            isNaN(parseInt(data.categoryId)))
            ? undefined
            : data.categoryId,
        categoryIds:
          selectedCategories.length > 0
            ? selectedCategories.map((cat) => cat.id)
            : undefined,
        location: data.location_name || data.location || "",
        location_name: data.location_name || data.location || "",
        location_lat: data.location_lat,
        location_lng: data.location_lng,
      };

      let articleId: number;
      if (existingArticle) {
        // Update existing article
        const result = await updateArticleMutation.mutateAsync(processedData);
        articleId = result.id;
      } else {
        // Create new article
        const result = await createArticleMutation.mutateAsync(processedData);
        articleId = result.id;
      }

      // Save image metadata to database
      if (successfulUploads.length > 0) {
        console.log("Saving image metadata to database:", successfulUploads);
        try {
          const response = await apiRequest(
            "POST",
            `/api/articles/${articleId}/images`,
            successfulUploads.map((img, index) => ({
              article_id: articleId,
              image_url: img.imageUrl,
              caption: img.caption,
              order: index,
            }))
          );

          if (!response.ok) {
            const error = await response.json();
            console.error("Error saving image metadata:", error);
            toast({
              title: "Warning",
              description:
                "Article was published but there was an error saving the images. Please try adding them again.",
              variant: "destructive",
            });
            return;
          }

          const imageData = await response.json();
          console.log("Image metadata saved successfully:", imageData);
        } catch (error) {
          console.error("Error saving image metadata:", error);
          toast({
            title: "Warning",
            description:
              "Article was published but there was an error saving the images. Please try adding them again.",
            variant: "destructive",
          });
          return;
        }
      }

      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      if (existingArticle) {
        queryClient.invalidateQueries({
          queryKey: [`/api/articles/${existingArticle.id}`],
        });
      }

      toast({
        title: "Success",
        description: isDraft
          ? "Article saved as draft"
          : existingArticle
          ? "Article updated successfully"
          : "Article published successfully",
      });

      // Navigate to the article page
      setTimeout(() => {
        window.location.href = `/articles/${articleId}`;
      }, 1500);
    } catch (error) {
      console.error("Error submitting article:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to submit article",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                {!isLoadingCategories && (
                  <HierarchicalCategorySelect
                    categories={processedCategories || []}
                    value={field.value}
                    onChange={(id) => {
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

                      if (processedCategories) {
                        const selectedCategory =
                          findCategory(processedCategories);
                        if (selectedCategory) {
                          form.setValue("category", selectedCategory.name);
                        }
                      }
                    }}
                    isLoading={isLoadingCategories}
                    onSelectMultiple={(selections) => {
                      setSelectedCategories(selections);

                      // Set the primary categoryId to the first selection
                      if (selections.length > 0) {
                        field.onChange(selections[0].id);

                        // Set category name from path
                        const pathParts = selections[0].path.split(" > ");
                        if (pathParts.length > 0) {
                          form.setValue(
                            "category",
                            pathParts[pathParts.length - 1]
                          );
                        }
                      }
                    }}
                    multipleSelections={selectedCategories}
                  />
                )}

                <div className="mt-4">
                  <FormLabel className="text-sm text-muted-foreground">
                    Search Categories
                  </FormLabel>
                  <EnhancedAutocomplete
                    items={flatCategories}
                    placeholder="Search for a category..."
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

                      if (processedCategories) {
                        const selectedCategory =
                          findCategory(processedCategories);
                        if (selectedCategory) {
                          form.setValue("category", selectedCategory.name);

                          // Find the full path for the selected category
                          const findPath = (
                            cats: CategoryWithChildren[],
                            id: number,
                            currentPath: string[] = []
                          ): string[] | null => {
                            for (const cat of cats) {
                              if (cat.id === id) {
                                return [...currentPath, cat.name];
                              }

                              if (cat.children) {
                                const path = findPath(cat.children, id, [
                                  ...currentPath,
                                  cat.name,
                                ]);
                                if (path) return path;
                              }
                            }
                            return null;
                          };

                          const path = findPath(processedCategories, id);
                          if (path) {
                            const pathString = path.join(" > ");
                            // Add to selected categories if not already there
                            if (!selectedCategories.some((s) => s.id === id)) {
                              const newSelections = [
                                ...selectedCategories,
                                { id, path: pathString },
                              ].slice(-3);
                              setSelectedCategories(newSelections);
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <MapboxLocationPicker
                field={field}
                label="Location (optional)"
                placeholder="Search for a location..."
                description="Select a location to help readers find geographically relevant content"
                onLocationSelected={(location: MapboxLocation) => {
                  // When a location is selected, update all related fields
                  form.setValue("location_name", location.place_name);
                  form.setValue("location_lat", location.center[1]); // latitude
                  form.setValue("location_lng", location.center[0]); // longitude

                  // For backward compatibility
                  form.setValue("location", location.place_name);
                }}
              />
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
                <RichTextEditor
                  content={field.value}
                  onChange={field.onChange}
                  placeholder="Write your article content here..."
                />
              </FormControl>
              <FormDescription>
                Write your article content. Use formatting tools to structure
                your article.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Images</FormLabel>
          <FormDescription>
            Upload up to 5 images with captions. The first image will be
            displayed at the top of the article.
          </FormDescription>
          <FormControl>
            <ImageUpload onImagesChange={setImages} maxFiles={5} />
          </FormControl>
        </FormItem>

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
            createArticleMutation.isPending ||
            updateArticleMutation?.isPending ||
            isSubmitting
          }
        >
          {createArticleMutation.isPending ||
          updateArticleMutation?.isPending ||
          isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isSubmitting
                ? "Submitting..."
                : existingArticle
                ? isDraft
                  ? "Saving draft..."
                  : "Updating..."
                : isDraft
                ? "Saving draft..."
                : "Publishing..."}
            </>
          ) : (
            <>
              {existingArticle ? "Update" : isDraft ? "Save draft" : "Publish"}
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}

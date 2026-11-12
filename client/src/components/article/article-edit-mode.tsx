import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Channel } from "@shared/schema";
import { Loader2, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/components/image-upload";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  HierarchicalCategorySelect,
  CategoryWithChildren,
  EnhancedAutocomplete,
  LocationWithChildren,
  StandaloneLocationPicker,
} from "@/components/article-editor";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { ArticleWithSnakeCase } from "./article-types";

/**
 * The owner's inline edit mode for an article, moved verbatim out of
 * pages/article-page.tsx and loaded lazily (only owners who press Edit download it,
 * together with the TipTap editor and the category/location pickers).
 *
 * `chrome` carries the read-only parts of the page shown around the editor,
 * so the edit screen looks as it did before the move.
 */
export interface ArticleEditChrome {
  channelBlock?: ReactNode;
  datesRow?: ReactNode;
  metricsBar?: ReactNode;
  imagesSection?: ReactNode;
  afterBody?: ReactNode;
}

export default function ArticleEditMode({
  article,
  articleId,
  isOwner,
  isDraft,
  chrome,
  onExit,
}: {
  article: ArticleWithSnakeCase;
  articleId: string;
  isOwner: boolean;
  isDraft: boolean;
  chrome: ArticleEditChrome;
  /** Leave edit mode (after a save or a cancel). */
  onExit: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();

  // This component is only mounted while editing.
  const isEditing = true;
  const setIsEditing = (editing: boolean) => {
    if (!editing) onExit();
  };

  const [isSaving, setIsSaving] = useState(false);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableContent, setEditableContent] = useState("");
  const [editableCategory, setEditableCategory] = useState("");
  const [editableLocation, setEditableLocation] = useState("");
  const [editableCategoryId, setEditableCategoryId] = useState<
    number | undefined
  >(undefined);
  const [editableLocationId, setEditableLocationId] = useState<
    number | undefined
  >();
  const [editableLocationName, setEditableLocationName] = useState("");
  const [editableLocationLat, setEditableLocationLat] = useState<
    number | undefined
  >();
  const [editableLocationLng, setEditableLocationLng] = useState<
    number | undefined
  >();
  const [selectedCategories, setSelectedCategories] = useState<
    { id: number; path: string }[]
  >([]);

  // New state for image editing
  const [newImages, setNewImages] = useState<{ file: File; caption: string }[]>(
    []
  );
  const [existingImages, setExistingImages] = useState<
    { imageUrl: string; caption: string; toKeep: boolean }[]
  >([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // Fetch user's channels if needed for editing
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ["/api/user/channels"],
    enabled: !!user && !!isEditing,
  });

  // Fetch categories and locations when in edit mode
  const { data: categories, isLoading: isLoadingCategories } = useQuery<
    CategoryWithChildren[]
  >({
    queryKey: ["/api/categories"],
    enabled: isEditing,
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

  // Fetch locations when in edit mode
  const { data: locations, isLoading: isLoadingLocations } = useQuery<
    LocationWithChildren[]
  >({
    queryKey: ["/api/locations"],
    enabled: isEditing,
  });

  // Initialize editable fields when article data is loaded
  useEffect(() => {
    if (article) {
      setEditableTitle(article.title || "");
      setEditableContent(article.content || "");
      setEditableCategory(article.category || "");
      setEditableLocation(article.location || "");
      setEditableLocationName(article.location_name || article.location || "");
      setEditableLocationLat(article.location_lat);
      setEditableLocationLng(article.location_lng);

      // Initialize existing images if available
      if (article.images?.length) {
        setExistingImages(
          article.images.map((img) => ({
            imageUrl: img.imageUrl,
            caption: img.caption || "",
            toKeep: true,
          }))
        );
      } else {
        setExistingImages([]);
      }
      setNewImages([]);

      // We still use categoryId and locationId for the UI component display
      // but don't send them to the API
      if (article.category) {
        // Find the category ID if possible by searching the categories
        const findCategoryId = (
          catName: string,
          cats: CategoryWithChildren[] = []
        ): number | undefined => {
          for (const cat of cats) {
            if (cat.name.toLowerCase() === catName.toLowerCase()) {
              return cat.id;
            }
            if (cat.children) {
              const childId: number | undefined = findCategoryId(
                catName,
                cat.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        if (processedCategories && processedCategories.length > 0) {
          const foundId = findCategoryId(article.category, processedCategories);
          if (foundId) {
            setEditableCategoryId(foundId);
            setSelectedCategories([
              {
                id: foundId,
                path: article.category,
              },
            ]);
          }
        }
      }

      // Similar for locations
      if (article.location && locations) {
        const findLocationId = (
          locName: string,
          locs: LocationWithChildren[] = []
        ): number | undefined => {
          for (const loc of locs) {
            if (loc.name.toLowerCase() === locName.toLowerCase()) {
              return loc.id;
            }
            if (loc.children) {
              const childId: number | undefined = findLocationId(
                locName,
                loc.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        const foundId = findLocationId(article.location, locations);
        if (foundId) {
          setEditableLocationId(foundId);
        }
      }
    }
  }, [article, processedCategories, locations]);

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

  // New mutation for updating the article
  const updateArticleMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "PATCH",
        `/api/articles/${articleId}`,
        data
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${articleId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setIsEditing(false);
      setIsSaving(false);
      toast({
        title: "Article updated",
        description: "Your article has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      setIsSaving(false);
      toast({
        title: "Error",
        description: error.message || "Failed to update the article.",
        variant: "destructive",
      });
    },
  });

  // Handle image upload to Supabase storage
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

  // Enhanced handleSaveChanges to include image editing
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // First update the article details
      const updateData = {
        title: editableTitle,
        content: editableContent,
        category: editableCategory,
        location: editableLocationName,
        location_name: editableLocationName,
        location_lat: editableLocationLat,
        location_lng: editableLocationLng,
        ...(selectedCategories.length > 0
          ? {
              categoryIds: selectedCategories.map((cat) => cat.id),
            }
          : {}),
      };

      // Update article
      await updateArticleMutation.mutateAsync(updateData);

      // Handle image updates if there are new images or changes to existing ones
      if (
        newImages.length > 0 ||
        existingImages.some((img) => !img.toKeep) ||
        existingImages.some((img) => img.toKeep)
      ) {
        setIsUploadingImages(true);

        // Step 1: Upload new images
        const uploadedImages = await Promise.all(
          newImages.map(async (img, index) => {
            try {
              if (img.file) {
                const imageUrl = await handleImageUpload(img.file);
                return {
                  image_url: imageUrl,
                  caption: img.caption || "",
                  order:
                    existingImages.filter((ei) => ei.toKeep).length + index,
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

        // Filter out failed uploads
        const successfulUploads = uploadedImages.filter((img) => img !== null);

        // Step 2: Prepare existing images that are kept with their captions (even if unchanged)
        const keptImages = existingImages
          .filter((img) => img.toKeep)
          .map((img, index) => ({
            image_url: img.imageUrl,
            caption: img.caption || "", // Ensure caption is never undefined
            order: index,
          }));

        // Debug
        console.log("Kept images with captions:", keptImages);
        console.log("New uploads:", successfulUploads);

        // Step 3: Combine kept existing images with new uploads
        const allImages = [...keptImages, ...successfulUploads];

        // Step 4: Update the article's images via the API
        // Critical fix: Use the actual article.id (numeric) instead of the URL parameter which is a slug
        if (allImages.length > 0 || existingImages.some((img) => !img.toKeep)) {
          if (!article || !article.id) {
            console.error("Article or article ID is missing");
            toast({
              title: "Error",
              description: "Could not update images: article ID is missing",
              variant: "destructive",
            });
            setIsSaving(false);
            setIsUploadingImages(false);
            return;
          }

          console.log(`Updating images for article ID ${article.id}`);
          const response = await apiRequest(
            "PUT",
            `/api/articles/${article.id}/images`, // Use numeric article.id instead of URL slug
            { images: allImages }
          );

          if (!response.ok) {
            const error = await response.json();
            console.error("Error updating article images:", error);
            toast({
              title: "Warning",
              description:
                "There was an error updating the images. Some changes may not have been saved.",
              variant: "destructive",
            });
          } else {
            const result = await response.json();
            console.log("Images updated successfully:", result);
          }
        }
      }

      // Successfully updated
      queryClient.invalidateQueries({
        queryKey: [`/api/articles/${articleId}`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      setIsEditing(false);
      setIsSaving(false);
      setIsUploadingImages(false);
      toast({
        title: "Article updated",
        description: "Your article has been updated successfully.",
      });
    } catch (error) {
      console.error("Error saving article:", error);
      setIsSaving(false);
      setIsUploadingImages(false);
      toast({
        title: "Error",
        description: "Failed to update the article. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    // Reset to original values
    if (article) {
      setEditableTitle(article.title || "");
      setEditableContent(article.content || "");
      setEditableCategory(article.category || "");
      setEditableLocation(article.location || "");
      setEditableLocationName(article.location_name || article.location || "");
      setEditableLocationLat(article.location_lat);
      setEditableLocationLng(article.location_lng);

      // Reset image states
      if (article.images?.length) {
        setExistingImages(
          article.images.map((img) => ({
            imageUrl: img.imageUrl,
            caption: img.caption || "",
            toKeep: true,
          }))
        );
      } else {
        setExistingImages([]);
      }
      setNewImages([]);

      // We still use categoryId and locationId for the UI component display
      // but don't send them to the API
      if (article.category) {
        // Find the category ID if possible by searching the categories
        const findCategoryId = (
          catName: string,
          cats: CategoryWithChildren[] = []
        ): number | undefined => {
          for (const cat of cats) {
            if (cat.name.toLowerCase() === catName.toLowerCase()) {
              return cat.id;
            }
            if (cat.children) {
              const childId: number | undefined = findCategoryId(
                catName,
                cat.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        if (processedCategories && processedCategories.length > 0) {
          const foundId = findCategoryId(article.category, processedCategories);
          if (foundId) {
            setEditableCategoryId(foundId);
            setSelectedCategories([
              {
                id: foundId,
                path: article.category,
              },
            ]);
          }
        }
      }

      // Similar for locations
      if (article.location && locations) {
        const findLocationId = (
          locName: string,
          locs: LocationWithChildren[] = []
        ): number | undefined => {
          for (const loc of locs) {
            if (loc.name.toLowerCase() === locName.toLowerCase()) {
              return loc.id;
            }
            if (loc.children) {
              const childId: number | undefined = findLocationId(
                locName,
                loc.children
              );
              if (childId) return childId;
            }
          }
          return undefined;
        };

        const foundId = findLocationId(article.location, locations);
        if (foundId) {
          setEditableLocationId(foundId);
        }
      }
    }
    setIsEditing(false);
  };

  // Function to handle removing an existing image
  const removeExistingImage = (index: number) => {
    const updatedImages = [...existingImages];
    updatedImages[index].toKeep = false;
    setExistingImages(updatedImages);
  };

  // Function to update caption for an existing image
  const updateExistingImageCaption = (index: number, caption: string) => {
    const updatedImages = [...existingImages];
    updatedImages[index].caption = caption;
    setExistingImages(updatedImages);
  };

  return (
    <article className="container mx-auto p-4 lg:p-8 max-w-4xl">
      <header className="mb-8 border-b pb-6 relative">
        <div className="flex justify-between items-start">
          <div className="flex-1 pr-4">
            <input
              type="text"
              value={editableTitle}
              onChange={(e) => setEditableTitle(e.target.value)}
              className="text-4xl font-bold mb-4 w-full p-2 border border-input bg-background rounded-md"
            />
          </div>

          {chrome.channelBlock}
        </div>

        <div className="flex justify-between items-start mt-4">
          {/* Owner actions */}
          {isOwner && (
            <div className="flex gap-2">
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveChanges}
                  disabled={
                    updateArticleMutation.isPending || isUploadingImages
                  }
                >
                  {updateArticleMutation.isPending ||
                  isUploadingImages ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {isUploadingImages ? "Uploading Images..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={
                    updateArticleMutation.isPending || isUploadingImages
                  }
                >
                  Cancel
                </Button>
              </>
            </div>
          )}
        </div>

        {/* Draft indicator */}
        {isDraft && (
          <div className="inline-block mb-4 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-2 py-1 rounded text-sm font-medium">
            Draft
          </div>
        )}

        <div className="flex flex-col gap-3 text-muted-foreground mt-4">
          {chrome.datesRow}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {/* Show categories from either the categories array or fallback to the legacy category field */}
            {((article.categories && article.categories.length > 0) ||
              (article.category &&
                article.category.trim() !== "" &&
                article.category.toLowerCase() !== "uncategorized")) && (
              <>
                <span className="font-medium">Categories:</span>{" "}
                  <div className="flex-1 max-w-md">
                    <HierarchicalCategorySelect
                      categories={processedCategories || []}
                      value={editableCategoryId}
                      onChange={(id) => {
                        setEditableCategoryId(id);

                        // Find the category to set the text name for compatibility
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
                            setEditableCategory(selectedCategory.name);
                          }
                        }
                      }}
                      isLoading={isLoadingCategories}
                      onSelectMultiple={(selections) => {
                        setSelectedCategories(selections);

                        // Set the primary categoryId to the first selection
                        if (selections.length > 0) {
                          setEditableCategoryId(selections[0].id);

                          // Set category name from path
                          const pathParts = selections[0].path.split(" > ");
                          if (pathParts.length > 0) {
                            setEditableCategory(
                              pathParts[pathParts.length - 1]
                            );
                          }
                        }
                      }}
                      multipleSelections={selectedCategories}
                    />

                    <div className="mt-2">
                      <EnhancedAutocomplete
                        items={flatCategories}
                        placeholder="Search for a category..."
                        value={editableCategoryId}
                        isLoading={isLoadingCategories}
                        onSelect={(id) => {
                          setEditableCategoryId(id);

                          // Find the category
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
                              setEditableCategory(selectedCategory.name);

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
                                    const path = findPath(
                                      cat.children,
                                      id,
                                      [...currentPath, cat.name]
                                    );
                                    if (path) return path;
                                  }
                                }
                                return null;
                              };

                              const path = findPath(
                                processedCategories,
                                id
                              );
                              if (path) {
                                const pathString = path.join(" > ");
                                // Add to selected categories if not already there
                                if (
                                  !selectedCategories.some(
                                    (s) => s.id === id
                                  )
                                ) {
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
                  </div>
              </>
            )}

            <div className="flex-1 mt-4 w-full">
              <div className="border border-input rounded-md p-4 bg-card">
                <span className="font-medium block mb-3">
                  Location (optional):
                </span>
                <StandaloneLocationPicker
                  value={
                    editableLocationName
                      ? {
                          location_name: editableLocationName,
                          location_lat: editableLocationLat,
                          location_lng: editableLocationLng,
                        }
                      : null
                  }
                  onChange={(value) => {
                    if (value) {
                      setEditableLocationName(value.location_name || "");
                      setEditableLocationLat(value.location_lat);
                      setEditableLocationLng(value.location_lng);
                      // For backward compatibility
                      setEditableLocation(value.location_name || "");
                    } else {
                      // Clear all location data
                      setEditableLocationName("");
                      setEditableLocationLat(undefined);
                      setEditableLocationLng(undefined);
                      setEditableLocation("");
                      setEditableLocationId(undefined);
                    }
                  }}
                  onLocationSelected={(location) => {
                    if (location) {
                      setEditableLocationName(location.place_name);
                      setEditableLocationLat(location.center[1]); // latitude
                      setEditableLocationLng(location.center[0]); // longitude
                      setEditableLocation(location.place_name);
                    }
                  }}
                  label=""
                  description="Select a location to help readers find geographically relevant content"
                />
              </div>
            </div>
          </div>

          {chrome.metricsBar}
        </div>
      </header>

      {chrome.imagesSection}

      <div className="prose dark:prose-invert max-w-none">
        <>
          <RichTextEditor
            content={editableContent}
            onChange={setEditableContent}
          />

          {/* Image editing section */}
          <div className="mt-8 border-t pt-8">
            <h3 className="text-lg font-semibold mb-4">Article Images</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You can add up to 5 images. The first image will be
              displayed as the article preview.
            </p>

            {/* Existing images */}
            {existingImages.length > 0 && (
              <div className="space-y-4 mb-6">
                <h4 className="text-md font-medium">Current Images</h4>
                <div className="space-y-4">
                  {existingImages.map(
                    (image, index) =>
                      image.toKeep && (
                        <div
                          key={`existing-${index}`}
                          className="relative border rounded-lg p-4 flex items-start space-x-4"
                        >
                          <div className="relative w-24 h-24 flex-shrink-0">
                            <img
                              src={image.imageUrl}
                              alt={`Image ${index + 1}`}
                              className="w-full h-full object-cover object-[50%_25%] rounded-md"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6"
                              onClick={() => removeExistingImage(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex-grow">
                            <p className="text-sm font-medium mb-1">
                              Image {index + 1}
                            </p>
                            <Input
                              type="text"
                              placeholder="Add a caption (optional)"
                              value={image.caption}
                              onChange={(e) =>
                                updateExistingImageCaption(
                                  index,
                                  e.target.value
                                )
                              }
                              className="mt-2 w-full"
                            />
                          </div>
                        </div>
                      )
                  )}
                </div>
              </div>
            )}

            {/* Upload new images */}
            <div className="mt-4">
              <h4 className="text-md font-medium mb-2">Add New Images</h4>
              <ImageUpload
                onImagesChange={setNewImages}
                maxFiles={
                  5 - existingImages.filter((img) => img.toKeep).length
                }
              />
            </div>
          </div>
        </>
      </div>

      <div className="flex items-center gap-4 my-8 border-t border-b py-6">
        <div className="w-full flex justify-end gap-2">
          <Button
            variant="default"
            onClick={handleSaveChanges}
            disabled={
              updateArticleMutation.isPending || isUploadingImages
            }
          >
            {updateArticleMutation.isPending || isUploadingImages ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {isUploadingImages ? "Uploading Images..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleCancelEdit}
            disabled={
              updateArticleMutation.isPending || isUploadingImages
            }
          >
            Cancel
          </Button>
        </div>
      </div>

      {chrome.afterBody}
    </article>
  );
}

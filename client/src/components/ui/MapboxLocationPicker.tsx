import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { ControllerRenderProps } from "react-hook-form";
import { X } from "lucide-react";

export interface MapboxLocation {
  id: string;
  text: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
}

interface MapboxLocationPickerProps {
  field: ControllerRenderProps<any, any>;
  description?: string;
  label?: string;
  placeholder?: string;
  onLocationSelected?: (location: MapboxLocation) => void;
}

export function MapboxLocationPicker({
  field,
  description = "Select a location to help readers find geographically relevant content",
  label = "Location (optional)",
  placeholder = "Search for a location...",
  onLocationSelected,
}: MapboxLocationPickerProps) {
  const [query, setQuery] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [results, setResults] = useState<MapboxLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Get token from environment variable
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

  // Initialize display value from existing field data
  useEffect(() => {
    if (
      field.value &&
      typeof field.value === "object" &&
      field.value.place_name
    ) {
      setDisplayValue(field.value.place_name);
    } else if (
      field.value &&
      typeof field.value === "object" &&
      field.value.location_name
    ) {
      // Handle existing location data with location_name property
      setDisplayValue(field.value.location_name);
    } else if (
      field.value &&
      typeof field.value === "string" &&
      field.value.trim() !== ""
    ) {
      setDisplayValue(field.value);
      setQuery(field.value);
    }
  }, [field.value]);

  // Debounce function to limit API calls
  useEffect(() => {
    const handler = setTimeout(() => {
      if (query.length >= 2) {
        searchLocations(query);
      } else {
        setResults([]);
      }
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        resultsContainerRef.current &&
        !resultsContainerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const searchLocations = async (searchText: string) => {
    if (!searchText || searchText.length < 2) return;

    setLoading(true);
    setError(null);

    try {
      if (!mapboxToken) {
        throw new Error(
          "Mapbox token not found. Please check your environment variables."
        );
      }

      console.log("[MapboxLocationPicker] Using Mapbox Token:", mapboxToken);

      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        searchText
      )}.json`;
      const response = await fetch(
        `${endpoint}?access_token=${mapboxToken}&types=place,region,country`
      );

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      setResults(data.features);
      setIsOpen(data.features.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLocation = (result: MapboxLocation) => {
    setDisplayValue(result.place_name);
    setQuery(result.place_name);
    setIsOpen(false);

    // Update form field with the selected location
    field.onChange({
      location_name: result.place_name,
      location_lat: result.center[1], // latitude
      location_lng: result.center[0], // longitude
      place_name: result.place_name, // For backward compatibility
    });

    // Also call the callback if provided
    if (onLocationSelected) {
      onLocationSelected(result);
    }
  };

  const clearLocation = () => {
    setDisplayValue("");
    setQuery("");
    setResults([]);
    field.onChange(null);

    // Call the callback if provided with null
    if (onLocationSelected) {
      onLocationSelected(null as any);
    }
  };

  return (
    <FormItem>
      {label && <FormLabel>{label}</FormLabel>}
      <div className="relative" ref={resultsContainerRef}>
        <FormControl>
          <div className="relative">
            <Input
              placeholder={placeholder}
              className="w-full pr-8"
              onFocus={() => setIsOpen(results.length > 0)}
              value={displayValue}
              onChange={(e) => {
                setDisplayValue(e.target.value);
                setQuery(e.target.value);
                if (e.target.value === "") {
                  // Clear the location if input is cleared
                  field.onChange(null);
                }
              }}
            />
            {displayValue && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearLocation();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear location"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </FormControl>

        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            Loading...
          </div>
        )}

        {isOpen && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {results.map((result) => (
              <div
                key={result.id}
                className="p-2 hover:bg-muted cursor-pointer"
                onClick={() => handleSelectLocation(result)}
              >
                <div className="font-medium">{result.text}</div>
                <div className="text-sm text-muted-foreground">
                  {result.place_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  Coordinates: {result.center[1]}, {result.center[0]}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-red-500 p-2 rounded mt-2">Error: {error}</div>
        )}
      </div>
      {description && <FormDescription>{description}</FormDescription>}
    </FormItem>
  );
}

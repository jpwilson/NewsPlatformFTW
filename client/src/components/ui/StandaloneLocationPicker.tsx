import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { X, MapPin } from "lucide-react";

export interface MapboxLocation {
  id: string;
  text: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
}

interface StandaloneLocationPickerProps {
  value: {
    location_name?: string;
    location_lat?: number;
    location_lng?: number;
  } | null;
  onChange: (
    value: {
      location_name: string;
      location_lat: number;
      location_lng: number;
    } | null
  ) => void;
  description?: string;
  label?: string;
  placeholder?: string;
  onLocationSelected?: (location: MapboxLocation | null) => void;
}

export function StandaloneLocationPicker({
  value,
  onChange,
  description = "Select a location to help readers find geographically relevant content",
  label = "Location (optional)",
  placeholder = "Search for a location...",
  onLocationSelected,
}: StandaloneLocationPickerProps) {
  const [query, setQuery] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [results, setResults] = useState<MapboxLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Try to get token from environment first
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN;

  // Only fetch from API if needed
  useEffect(() => {
    if (!envToken && !apiToken) {
      fetch("/api/config/mapbox")
        .then((res) => res.json())
        .then((data) => setApiToken(data.token))
        .catch((err) => console.error("Error fetching token:", err));
    }
  }, [envToken, apiToken]);

  // Use either environment or API token
  const mapboxToken = envToken || apiToken;

  // Initialize display value from existing field data
  useEffect(() => {
    if (value && value.location_name) {
      setDisplayValue(value.location_name);
    } else {
      setDisplayValue("");
    }
  }, [value]);

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
    setQuery("");
    setDisplayValue("");
    setIsOpen(false);

    // Update location data
    onChange({
      location_name: result.place_name,
      location_lat: result.center[1], // latitude
      location_lng: result.center[0], // longitude
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
    onChange(null);

    // Call the callback if provided with null
    if (onLocationSelected) {
      onLocationSelected(null);
    }
  };

  return (
    <div className="space-y-2 w-full">
      {label && <div className="text-sm font-medium">{label}</div>}

      <div className="relative" ref={resultsContainerRef}>
        <Input
          placeholder={placeholder}
          className="w-full pr-8"
          onFocus={() => setIsOpen(results.length > 0)}
          value={displayValue}
          onChange={(e) => {
            setDisplayValue(e.target.value);
            setQuery(e.target.value);
            if (e.target.value === "") {
              setResults([]);
            }
          }}
        />

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

      {value && value.location_name && (
        <div className="mt-3 mb-2">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1 text-sm">
            <MapPin className="h-3.5 w-3.5 mr-1 text-primary" />
            <span>{value.location_name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                clearLocation();
              }}
              className="ml-2 text-muted-foreground hover:text-foreground"
              aria-label="Remove location"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {description && (
        <div className="text-sm text-muted-foreground">{description}</div>
      )}
    </div>
  );
}

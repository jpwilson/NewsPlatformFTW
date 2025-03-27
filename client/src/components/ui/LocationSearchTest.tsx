import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

export function LocationSearchTest() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // For Vite projects - Try multiple environment variable sources
  const mapboxToken =
    // In development with Vite
    import.meta.env.VITE_MAPBOX_TOKEN ||
    // Direct environment variable (some hosting platforms)
    import.meta.env.MAPBOX_TOKEN ||
    // Vercel might inject it as window.ENV variable
    (typeof window !== "undefined" && (window as any).ENV?.MAPBOX_TOKEN);

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

  const handleSelectLocation = (result: any) => {
    setQuery(result.place_name);
    setIsOpen(false);
    // Here you would typically handle storing the selected location's details
    console.log("Selected location:", result);
    console.log("Coordinates:", result.center);
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Location Search Test</h2>

      <div className="relative" ref={resultsContainerRef}>
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a location..."
          className="w-full"
          onFocus={() => setIsOpen(results.length > 0)}
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
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="text-red-500 p-2 rounded mt-2">Error: {error}</div>
        )}
      </div>
    </div>
  );
}

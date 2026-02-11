import { useRef, useEffect, useState } from "react";
import { MapPin, ChevronDown, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// All categories in order
const ALL_CATEGORIES: Array<{
  id: string;
  label: string;
  dbIds: number[];
  special?: string;
  icon?: React.ComponentType<{ className?: string }>;
}> = [
  { 
    id: "politics",
    label: "Politics", 
    dbIds: [1],
  },
  { 
    id: "business",
    label: "Business", 
    dbIds: [2],
  },
  { 
    id: "tech",
    label: "Tech", 
    dbIds: [3],
  },
  { 
    id: "science",
    label: "Science", 
    dbIds: [4, 5],
  },
  { 
    id: "sports",
    label: "Sports", 
    dbIds: [6],
  },
  { 
    id: "culture",
    label: "Culture", 
    dbIds: [7, 8],
  },
  { 
    id: "lifestyle",
    label: "Lifestyle", 
    dbIds: [9, 10, 11, 324], // Includes Lifestyle, Food & Cooking, Travel, and Hobbies
  },
  { 
    id: "education",
    label: "Education", 
    dbIds: [12]
  },
  { 
    id: "environment",
    label: "Environment", 
    dbIds: [13]
  },
  { 
    id: "opinion",
    label: "Opinion", 
    dbIds: [14]
  },
  { 
    id: "law",
    label: "Law", 
    dbIds: [259]
  },
  { 
    id: "ai",
    label: "AI", 
    dbIds: [25]
  },
  { 
    id: "everything-else",
    label: "Everything Else", 
    dbIds: [15]
  },
];

interface CategoryRibbonProps {
  selectedCategory?: string;
  onCategorySelect: (categoryId: string | null, dbIds: number[]) => void;
  userLocation?: { city?: string; country?: string };
  onLocationClick?: () => void;
}

export function CategoryRibbon({
  selectedCategory,
  onCategorySelect,
  userLocation,
  onLocationClick,
}: CategoryRibbonProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check if we can scroll and show/hide arrows
  const checkScrollButtons = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  };

  // Scroll by a certain amount
  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 200;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial check
    checkScrollButtons();

    // Check on scroll
    container.addEventListener('scroll', checkScrollButtons);
    
    // Check on resize
    const resizeObserver = new ResizeObserver(() => {
      checkScrollButtons();
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', checkScrollButtons);
      resizeObserver.disconnect();
    };
  }, []);

  const handleCategoryClick = (category: typeof ALL_CATEGORIES[0]) => {
    if (category.special === "location") {
      onLocationClick?.();
    } else {
      if (selectedCategory === category.id) {
        onCategorySelect(null, []); // Deselect
      } else {
        onCategorySelect(category.id, category.dbIds);
      }
    }
  };

  const renderCategory = (category: typeof ALL_CATEGORIES[0]) => {
    const isSelected = selectedCategory === category.id;
    const Icon = category.icon;

    if (category.special === "location" && Icon) {
      return (
        <Button
          key={category.id}
          variant={isSelected ? "default" : "ghost"}
          size="sm"
          className={cn(
            "whitespace-nowrap gap-1.5 font-medium category-pill-hover",
            !userLocation && "text-muted-foreground",
            isSelected && "category-pill-active"
          )}
          onClick={() => handleCategoryClick(category)}
        >
          <Icon className="h-3.5 w-3.5" />
          {userLocation?.city || userLocation?.country || "Set Location"}
        </Button>
      );
    }

    return (
      <Button
        key={category.id}
        variant={isSelected ? "default" : "ghost"}
        size="sm"
        className={cn(
          "whitespace-nowrap font-medium category-pill-hover",
          isSelected && "category-pill-active"
        )}
        onClick={() => handleCategoryClick(category)}
      >
        {category.label}
      </Button>
    );
  };

  return (
    <div className="sticky top-0 z-10 w-full bg-background border-b border-border">
      <div className="relative">
        {/* Container for centering on large screens */}
        <div className="mx-auto max-w-7xl">
          {/* Left scroll button */}
          {canScrollLeft && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 bg-background/90 shadow-sm hover:bg-background"
              onClick={() => scroll('left')}
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          
          {/* Right scroll button */}
          {canScrollRight && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 h-8 w-8 bg-background/90 shadow-sm hover:bg-background"
              onClick={() => scroll('right')}
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className={cn(
              "flex gap-1 px-4 py-2 overflow-x-auto scrollbar-hide",
              "scroll-smooth",
              // Add padding for scroll buttons when visible
              canScrollLeft && "pl-12",
              canScrollRight && "pr-12"
            )}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Render all categories */}
            <div className="flex gap-1 mx-auto">
              {ALL_CATEGORIES.map(category => renderCategory(category))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
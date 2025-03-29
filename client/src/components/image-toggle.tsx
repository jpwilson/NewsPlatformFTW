import { Image, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { create } from "zustand";

interface ImageVisibilityStore {
  showImages: boolean;
  toggleImageVisibility: () => void;
}

type SetState = (
  partial:
    | ImageVisibilityStore
    | Partial<ImageVisibilityStore>
    | ((
        state: ImageVisibilityStore
      ) => ImageVisibilityStore | Partial<ImageVisibilityStore>),
  replace?: boolean
) => void;

export const useImageVisibility = create<ImageVisibilityStore>(
  (set: SetState) => ({
    showImages: true,
    toggleImageVisibility: () =>
      set((state: ImageVisibilityStore) => ({ showImages: !state.showImages })),
  })
);

export function ImageToggle() {
  const { showImages, toggleImageVisibility } = useImageVisibility();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleImageVisibility}
            className="h-8 w-8"
            aria-label="Toggle image visibility"
          >
            {showImages ? (
              <Image className="h-4 w-4" />
            ) : (
              <ImageOff className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{showImages ? "Hide images" : "Show images"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

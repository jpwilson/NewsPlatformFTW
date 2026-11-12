import { useState } from "react";
import { Expand } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLightbox, type LightboxSlide } from "@/components/lightbox/lightbox-context";

type Shape = "landscape" | "portrait" | "small";

/**
 * The lead photo: edge to edge on phones (3:2), a rounded 16:9 frame from 640px.
 * Portrait photos are shown whole on a blurred copy of themselves instead of cropping a face;
 * photos narrower than 800px are kept to the body column so they are not blown up.
 * Tapping it opens the photo viewer at slide 0.
 */
export function ArticleHero({ slide, total }: { slide: LightboxSlide; total: number }) {
  const { open } = useLightbox();
  const [shape, setShape] = useState<Shape>("landscape");
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <figure
      className={cn(
        "mx-auto mt-6 lg:mt-8",
        shape === "small" ? "max-w-[720px] sm:px-4" : "max-w-[1040px] sm:px-4 lg:px-6"
      )}
    >
      <button
        type="button"
        onClick={(e) => open(0, e.currentTarget)}
        aria-label={`Open photo viewer${total > 1 ? ` (${total} photos)` : ""}`}
        className="group relative block w-full cursor-zoom-in overflow-hidden bg-[hsl(var(--edition-panel))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--edition-accent))] focus-visible:ring-offset-2 sm:rounded-xl"
      >
        {shape === "portrait" && (
          <img
            src={slide.src}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
          />
        )}
        <img
          src={slide.src}
          alt={slide.alt || slide.caption || ""}
          {...{ fetchpriority: "high" }}
          decoding="async"
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (h > w * 1.05) setShape("portrait");
            else if (w < 800) setShape("small");
          }}
          onError={() => setFailed(true)}
          className={cn(
            "relative block w-full transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.015]",
            shape === "portrait"
              ? "mx-auto aspect-[3/2] max-h-[70vh] object-contain sm:aspect-[16/9]"
              : "aspect-[3/2] object-cover object-[50%_25%] sm:aspect-[16/9] sm:max-h-[620px]"
          )}
        />
        <span className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
          <Expand className="h-3.5 w-3.5" aria-hidden />
          {total > 1 ? <span className="tabular-nums">1 / {total}</span> : <span className="sr-only">Enlarge</span>}
        </span>
      </button>
      {(slide.caption || slide.credit) && (
        <figcaption className="mt-2.5 max-w-[720px] px-4 text-[13px] leading-[1.45] sm:px-0">
          {slide.caption && (
            <span className="text-[hsl(var(--edition-text-muted))]">
              {slide.caption}
            </span>
          )}
          {slide.credit && (
            <span className="ml-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-[hsl(var(--edition-text-dim))]">
              {slide.credit}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

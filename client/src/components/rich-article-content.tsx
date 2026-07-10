import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ArticleChart } from "@/components/article-chart";

interface LightboxImage {
  src: string;
  caption: string;
}

/**
 * Renders rich article HTML (produced by the markdown pipeline — see
 * docs/article-format.md) and progressively enhances it:
 *  - hydrates <div data-chart> placeholders into live recharts charts
 *  - opens a full-screen lightbox (with prev/next + keyboard arrows) when any
 *    content figure/gallery image is clicked
 * Legacy plain-HTML articles render unchanged.
 */
export function RichArticleContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{
    images: LightboxImage[];
    index: number;
  } | null>(null);

  // Hydrate chart placeholders
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const roots: Root[] = [];
    container.querySelectorAll("[data-chart]").forEach((el) => {
      const raw = el.getAttribute("data-chart");
      if (!raw) return;
      try {
        const spec = JSON.parse(raw);
        const root = createRoot(el as HTMLElement);
        root.render(<ArticleChart spec={spec} />);
        roots.push(root);
      } catch {
        /* invalid spec — leave the empty div */
      }
    });
    return () => {
      // Deferred unmount avoids React warning about sync unmount during render
      setTimeout(() => roots.forEach((r) => r.unmount()), 0);
    };
  }, [html]);

  // Lightbox: event delegation over all content images
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== "IMG" || !containerRef.current) return;
    const imgs = Array.from(
      containerRef.current.querySelectorAll<HTMLImageElement>(
        ".article-figure img, .prose img, img"
      )
    ).filter((img, i, arr) => arr.indexOf(img) === i);
    const index = imgs.indexOf(target as HTMLImageElement);
    if (index < 0) return;
    e.preventDefault();
    setLightbox({
      images: imgs.map((img) => ({
        src: img.src,
        caption: img.getAttribute("alt") || "",
      })),
      index,
    });
  }, []);

  const step = useCallback(
    (delta: number) => {
      setLightbox((lb) =>
        lb
          ? {
              ...lb,
              index: (lb.index + delta + lb.images.length) % lb.images.length,
            }
          : lb
      );
    },
    []
  );

  const current = lightbox?.images[lightbox.index];

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent
          className="max-w-6xl border-none bg-black/95 p-2 shadow-2xl outline-none sm:p-4"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") step(1);
            if (e.key === "ArrowLeft") step(-1);
          }}
        >
          {lightbox && current && (
            <div className="relative flex flex-col items-center">
              <img
                src={current.src}
                alt={current.caption}
                className="max-h-[78vh] w-auto max-w-full rounded-md object-contain"
              />
              {(current.caption || lightbox.images.length > 1) && (
                <div className="mt-3 flex w-full items-center justify-between gap-4 px-2 text-sm text-white/80">
                  <span className="line-clamp-2">{current.caption}</span>
                  {lightbox.images.length > 1 && (
                    <span className="shrink-0 tabular-nums text-white/60">
                      {lightbox.index + 1} / {lightbox.images.length}
                    </span>
                  )}
                </div>
              )}
              {lightbox.images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous image"
                    className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next image"
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
                    onClick={() => step(1)}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Thin scroll-progress bar fixed to the top of the viewport. */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? Math.min(100, (el.scrollTop / total) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      aria-hidden
      className="fixed left-0 top-0 z-[60] h-[3px] bg-[hsl(var(--edition-accent))]"
      style={{ width: `${progress}%` }}
    />
  );
}

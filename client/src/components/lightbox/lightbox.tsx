import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import useEmblaCarousel from "embla-carousel-react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useZoomPan } from "./use-zoom-pan";
import type { LightboxSlide } from "./lightbox-context";

/**
 * The site's one full-screen photo viewer (hero, body figures and gallery all open it).
 *
 * Built on the Radix dialog primitives directly (focus trap, scroll lock, Escape, aria-modal),
 * NOT on the shadcn DialogContent, which injects its own close button: this viewer has exactly one.
 * Layout is a flex column so the caption panel can never be covered by the photo:
 *   top bar (counter, zoom, close) / stage (embla carousel) / caption + credit / thumbnails.
 */
export interface LightboxProps {
  slides: LightboxSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Called by Radix when focus would return; the provider refocuses the opener. */
  onCloseAutoFocus: (e: Event) => void;
}

export default function Lightbox({
  slides,
  index,
  onIndexChange,
  onClose,
  onCloseAutoFocus,
}: LightboxProps) {
  const count = slides.length;
  const multi = count > 1;
  const reduceMotion = useReducedMotion();
  const zoomedRef = useRef(false);

  const [emblaRef, embla] = useEmblaCarousel({
    loop: multi,
    startIndex: index,
    duration: reduceMotion ? 1 : 24,
    // No carousel dragging while zoomed (one finger pans the photo instead) or for a single photo.
    watchDrag: () => multi && !zoomedRef.current,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const setViewport = useCallback(
    (el: HTMLDivElement | null) => {
      viewportRef.current = el;
      emblaRef(el);
    },
    [emblaRef]
  );
  const imageRefs = useRef<Array<HTMLImageElement | null>>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Swipe down to close: the photo follows the finger and the backdrop fades with distance.
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [-400, 0, 400], [0.2, 1, 0.2]);

  const [barsHidden, setBarsHidden] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);

  const zoom = useZoomPan({
    viewportRef,
    getImage: () => imageRefs.current[index] ?? null,
    enabled: true,
    onTap: ({ onImage }) => {
      if (zoomedRef.current) setBarsHidden((h) => !h);
      else if (!onImage) onClose();
    },
    onSwipeMove: (dy) => dragY.set(dy),
    onSwipeEnd: (dy, velocity) => {
      if (Math.abs(dy) > 100 || Math.abs(velocity) > 0.6) onClose();
      else animate(dragY, 0, reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 });
    },
  });
  zoomedRef.current = zoom.zoomed;

  useEffect(() => {
    if (!zoom.zoomed) setBarsHidden(false);
  }, [zoom.zoomed]);

  // Keep React's index in step with the carousel.
  useEffect(() => {
    if (!embla) return;
    const onSelect = () => onIndexChange(embla.selectedScrollSnap());
    embla.on("select", onSelect);
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla, onIndexChange]);

  // Any change of slide resets zoom, caption expansion and swipe offset.
  const { reset } = zoom;
  useEffect(() => {
    reset();
    setCaptionOpen(false);
    dragY.set(0);
    if (embla && embla.selectedScrollSnap() !== index) embla.scrollTo(index, !!reduceMotion);
  }, [index, embla, reset, dragY, reduceMotion]);

  const go = useCallback(
    (to: number) => {
      if (!count) return;
      const next = multi ? (to + count) % count : 0;
      if (embla) embla.scrollTo(next, !!reduceMotion);
      else onIndexChange(next);
    },
    [count, multi, embla, onIndexChange, reduceMotion]
  );

  // Photos load lazily: the current one and its neighbours, plus any already seen.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    setLoaded((prev) => {
      const want = [index, (index + 1) % count, (index - 1 + count) % count];
      if (want.every((i) => prev.has(i))) return prev;
      const next = new Set(prev);
      want.forEach((i) => next.add(i));
      return next;
    });
  }, [index, count]);

  const [failed, setFailed] = useState<Set<number>>(() => new Set());

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    const k = e.key;
    if (k === "ArrowRight") go(index + 1);
    else if (k === "ArrowLeft") go(index - 1);
    else if (k === "Home") go(0);
    else if (k === "End") go(count - 1);
    else if (k === "+" || k === "=") zoom.zoomBy(1.5);
    else if (k === "-" || k === "_") zoom.zoomBy(1 / 1.5);
    else if (k === "0") zoom.reset();
    else return;
    e.preventDefault();
  };

  const slide = slides[index];
  const caption = slide?.caption?.trim() || "";
  const credit = slide?.credit?.trim() || "";

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-[100] bg-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
            style={{ opacity: backdropOpacity }}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            closeRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          onKeyDown={onKeyDown}
          className="fixed inset-0 z-[100] flex flex-col text-white outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-200"
        >
          <DialogPrimitive.Title className="sr-only">Photo viewer</DialogPrimitive.Title>

          {/* Top bar */}
          <div
            className={cn(
              "flex h-14 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)] transition-opacity duration-200 sm:px-4",
              barsHidden && "pointer-events-none opacity-0"
            )}
          >
            <p className="pl-2 text-sm font-medium tabular-nums text-white/80" aria-hidden={!multi}>
              {multi ? (
                <>
                  <span className="text-white">{index + 1}</span>
                  <span className="text-white/50"> / {count}</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => zoom.toggleZoom()}
                aria-label={zoom.zoomed ? "Zoom out" : "Zoom in"}
                aria-pressed={zoom.zoomed}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {zoom.zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
              </button>
              <DialogPrimitive.Close
                ref={closeRef}
                aria-label="Close photo viewer"
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-6 w-6" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Stage */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={setViewport}
              className="h-full touch-none select-none overflow-hidden"
              aria-roledescription="carousel"
            >
              <div className="flex h-full">
                {slides.map((s, i) => {
                  const current = i === index;
                  const t = current ? zoom.state : { scale: 1, x: 0, y: 0 };
                  return (
                    <div
                      key={`${s.src}-${i}`}
                      role="group"
                      aria-roledescription="slide"
                      aria-label={`Photo ${i + 1} of ${count}`}
                      aria-hidden={!current}
                      className="flex h-full min-w-0 shrink-0 grow-0 basis-full items-center justify-center px-0 sm:px-16"
                    >
                      <motion.div
                        className="flex h-full w-full items-center justify-center"
                        style={current ? { y: dragY } : undefined}
                      >
                        {failed.has(i) ? (
                          <p className="px-6 text-center text-sm text-white/60">
                            This photo could not be loaded.
                          </p>
                        ) : loaded.has(i) ? (
                          <img
                            ref={(el) => {
                              imageRefs.current[i] = el;
                            }}
                            src={s.src}
                            alt={s.alt || s.caption || ""}
                            draggable={false}
                            decoding="async"
                            onError={() => setFailed((f) => new Set(f).add(i))}
                            className={cn(
                              "max-h-full max-w-full select-none object-contain",
                              zoom.zoomed && current ? "cursor-grab" : "cursor-zoom-in",
                              !zoom.gesturing && !reduceMotion && "transition-transform duration-200 ease-out"
                            )}
                            style={{
                              transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`,
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" aria-hidden />
                        )}
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>

            {multi && (
              <>
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  aria-label="Previous photo"
                  className={cn(
                    "absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [@media(hover:hover)]:flex",
                    barsHidden && "pointer-events-none opacity-0"
                  )}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  aria-label="Next photo"
                  className={cn(
                    "absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [@media(hover:hover)]:flex",
                    barsHidden && "pointer-events-none opacity-0"
                  )}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {/* Caption and credit: always visible, never on top of the photo */}
          <div
            className={cn(
              "shrink-0 px-4 pb-3 pt-3 transition-opacity duration-200 sm:px-6",
              !multi && "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              barsHidden && "pointer-events-none opacity-0"
            )}
          >
            <Caption
              key={index}
              caption={caption}
              credit={credit}
              open={captionOpen}
              onToggle={() => setCaptionOpen((o) => !o)}
            />
          </div>

          {/* Thumbnails */}
          {multi && (
            <Thumbnails
              slides={slides}
              index={index}
              onSelect={go}
              hidden={barsHidden}
            />
          )}

          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {`Photo ${index + 1} of ${count}${caption ? `. ${caption}` : ""}${credit ? `. ${credit}` : ""}`}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Caption({
  caption,
  credit,
  open,
  onToggle,
}: {
  caption: string;
  credit: string;
  open: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [caption, open]);

  if (!caption && !credit) return <div className="h-1" aria-hidden />;

  return (
    <div className="mx-auto max-w-3xl">
      <div className={cn(open && "max-h-[30vh] overflow-y-auto overscroll-contain pr-1")}>
        {caption && (
          <p
            ref={ref}
            className={cn(
              "text-[15px] leading-relaxed text-white/95",
              !open && "line-clamp-3"
            )}
          >
            {caption}
          </p>
        )}
        {credit && (
          <p className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-white/60">
            {credit}
          </p>
        )}
      </div>
      {caption && (overflows || open) && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="mt-1 text-[13px] font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Thumbnails({
  slides,
  index,
  onSelect,
  hidden,
}: {
  slides: LightboxSlide[];
  index: number;
  onSelect: (i: number) => void;
  hidden: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    refs.current[index]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  return (
    <div
      className={cn(
        "shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-opacity duration-200 [@media(max-height:479px)]:hidden",
        hidden && "pointer-events-none opacity-0"
      )}
    >
      <div className="scrollbar-hide overflow-x-auto">
        <div className="mx-auto flex w-max gap-2 px-4 py-2">
          {slides.map((s, i) => (
            <button
              key={`${s.src}-${i}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Show photo ${i + 1} of ${slides.length}`}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                i === index
                  ? "opacity-100 ring-2 ring-white ring-offset-2 ring-offset-black"
                  : "opacity-50 hover:opacity-90"
              )}
            >
              <img
                src={s.src}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

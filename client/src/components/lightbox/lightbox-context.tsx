import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** One photo in the viewer. Same shape as `Slide` from shared/article-media.js. */
export interface LightboxSlide {
  src: string;
  caption: string;
  credit: string;
  alt: string;
  origin: "hero" | "body" | "gallery";
}

interface LightboxApi {
  slides: LightboxSlide[];
  /** Open the viewer at `index`; focus returns to `opener` (default: the focused element) on close. */
  open: (index: number, opener?: HTMLElement | null) => void;
}

const LightboxContext = createContext<LightboxApi | null>(null);

const loadLightbox = () => import("./lightbox");
const Lightbox = lazy(loadLightbox);

const HISTORY_MARK = "npLightbox";

/**
 * One photo viewer per page. Everything that shows a photo (hero, body figures, gallery strip)
 * calls `open(index)` with an index into `slides`, which the page computes once.
 *
 * Back button: opening pushes a history entry with the same URL and a marker; `popstate` closes
 * the viewer, and closing any other way pops that entry again. wouter routes on the pathname,
 * which does not change, so no navigation happens.
 */
export function LightboxProvider({
  slides,
  children,
}: {
  slides: LightboxSlide[];
  children: ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pushedRef = useRef(false);

  // Fetch the viewer's code while the reader is reading, so the first tap opens instantly.
  useEffect(() => {
    if (!slides.length) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const run = () => void loadLightbox().catch(() => {});
    if (w.requestIdleCallback) w.requestIdleCallback(run);
    else setTimeout(run, 1500);
  }, [slides.length]);

  const open = useCallback(
    (i: number, opener?: HTMLElement | null) => {
      if (!slides.length) return;
      openerRef.current =
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      setIndex(Math.min(Math.max(i, 0), slides.length - 1));
      if (!pushedRef.current) {
        window.history.pushState({ ...(window.history.state || {}), [HISTORY_MARK]: true }, "");
        pushedRef.current = true;
      }
    },
    [slides.length]
  );

  const close = useCallback(() => {
    setIndex(null);
    if (pushedRef.current) {
      pushedRef.current = false;
      if (window.history.state?.[HISTORY_MARK]) window.history.back();
    }
  }, []);

  // Back button / swipe-back gesture closes the viewer instead of leaving the article.
  useEffect(() => {
    if (index === null) return;
    const onPop = () => {
      pushedRef.current = false;
      setIndex(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [index === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the page with the viewer open must not leave our history entry behind.
  useEffect(
    () => () => {
      if (pushedRef.current && window.history.state?.[HISTORY_MARK]) {
        const { [HISTORY_MARK]: _drop, ...rest } = window.history.state;
        window.history.replaceState(rest, "");
      }
    },
    []
  );

  const onCloseAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    const el = openerRef.current;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  }, []);

  const api = useMemo(() => ({ slides, open }), [slides, open]);

  return (
    <LightboxContext.Provider value={api}>
      {children}
      {index !== null && slides.length > 0 && (
        <Suspense fallback={null}>
          <Lightbox
            slides={slides}
            index={Math.min(index, slides.length - 1)}
            onIndexChange={setIndex}
            onClose={close}
            onCloseAutoFocus={onCloseAutoFocus}
          />
        </Suspense>
      )}
    </LightboxContext.Provider>
  );
}

/** `open(index)` for photos inside a LightboxProvider; a no-op outside one. */
export function useLightbox(): LightboxApi {
  return useContext(LightboxContext) ?? { slides: [], open: () => {} };
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { sanitizeArticleHtml } from "@/lib/sanitize-article-html";

/**
 * Renders rich article HTML (produced by the markdown pipeline — see
 * docs/article-format.md) and progressively enhances it:
 *  - hydrates <div data-chart> placeholders into live recharts charts
 *    (the chart code is only downloaded when the article has a chart)
 *  - makes every content image a button that opens the page's photo viewer
 *    through `onImageActivate` (the viewer itself lives in components/lightbox)
 * Legacy plain-HTML articles render unchanged.
 */
export function RichArticleContent({
  html,
  className,
  onImageActivate,
}: {
  html: string;
  className?: string;
  /** Called with the activated <img> and its position among the body's images. */
  onImageActivate?: (img: HTMLImageElement, indexInBody: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Article bodies are author-supplied, so they go through the same allowlist
  // the crawler prerenderer uses (shared/article-html-policy.js).
  const safeHtml = useMemo(() => sanitizeArticleHtml(html), [html]);

  // Hydrate chart placeholders (recharts is loaded on demand).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const placeholders = Array.from(container.querySelectorAll<HTMLElement>("[data-chart]"));
    if (!placeholders.length) return;
    let cancelled = false;
    const roots: Root[] = [];
    import("@/components/article-chart").then(({ ArticleChart }) => {
      if (cancelled) return;
      placeholders.forEach((el) => {
        const raw = el.getAttribute("data-chart");
        if (!raw) return;
        try {
          const spec = JSON.parse(raw);
          const root = createRoot(el);
          root.render(<ArticleChart spec={spec} />);
          roots.push(root);
        } catch {
          /* invalid spec — leave the empty div */
        }
      });
    });
    return () => {
      cancelled = true;
      // Deferred unmount avoids React warning about sync unmount during render
      setTimeout(() => roots.forEach((r) => r.unmount()), 0);
    };
  }, [safeHtml]);

  const bodyImages = useCallback(
    () =>
      containerRef.current
        ? Array.from(containerRef.current.querySelectorAll<HTMLImageElement>("img"))
        : [],
    []
  );

  // Images become keyboard- and screen-reader-operable buttons.
  useEffect(() => {
    if (!onImageActivate) return;
    bodyImages().forEach((img) => {
      img.setAttribute("role", "button");
      img.setAttribute("tabindex", "0");
      const alt = img.getAttribute("alt")?.trim();
      img.setAttribute(
        "aria-label",
        alt ? `Open photo viewer: ${alt.length > 120 ? alt.slice(0, 117) + "…" : alt}` : "Open photo viewer"
      );
    });
  }, [safeHtml, onImageActivate, bodyImages]);

  const activate = useCallback(
    (target: EventTarget | null, e: React.SyntheticEvent) => {
      if (!onImageActivate || !(target instanceof HTMLImageElement)) return;
      const imgs = bodyImages();
      const index = imgs.indexOf(target);
      if (index < 0) return;
      e.preventDefault();
      onImageActivate(target, index);
    },
    [onImageActivate, bodyImages]
  );

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={(e) => activate(e.target, e)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") activate(e.target, e);
      }}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
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

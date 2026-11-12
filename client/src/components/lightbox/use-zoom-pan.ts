import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Pointer-driven zoom and pan for the photo viewer's current slide.
 *
 * Gestures handled on `viewportRef` (the carousel viewport):
 * - pinch (two pointers) and ctrl/cmd + wheel (also trackpad pinch): zoom around the fingers / cursor
 * - double tap / double click: toggle between 1x and `maxScale` at that point
 * - one-pointer drag while zoomed: pan, clamped so the photo never leaves the stage
 * - one-pointer vertical drag at 1x: "swipe down to close" (reported through onSwipe*)
 * - single tap: reported through onTap after a short delay (so a double tap is not also a tap)
 *
 * Horizontal drags at 1x are left alone: embla (the carousel) handles them.
 * The transform is applied by the caller as `translate(x, y) scale(scale)` with a centred origin
 * on an element whose box is exactly the visible photo (see lightbox.tsx).
 */

export interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

interface Options {
  viewportRef: RefObject<HTMLElement>;
  /** The current slide's <img> (its box is the visible photo at 1x). */
  getImage: () => HTMLElement | null;
  enabled: boolean;
  maxScale?: number;
  onTap?: (info: { onImage: boolean }) => void;
  onSwipeMove?: (dy: number) => void;
  /** dy in px, velocity in px/ms (positive = downwards) */
  onSwipeEnd?: (dy: number, velocity: number) => void;
}

const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 300;
const SINGLE_TAP_DELAY = 260;

type Point = { x: number; y: number };
type Mode = "idle" | "pending" | "pan" | "pinch" | "swipe" | "ignore";

export function useZoomPan({
  viewportRef,
  getImage,
  enabled,
  maxScale = 2.5,
  onTap,
  onSwipeMove,
  onSwipeEnd,
}: Options) {
  const [state, setState] = useState<ZoomState>(IDENTITY);
  const [gesturing, setGesturing] = useState(false);
  const stateRef = useRef<ZoomState>(IDENTITY);

  // Latest callbacks without re-binding listeners.
  const cb = useRef({ getImage, onTap, onSwipeMove, onSwipeEnd });
  cb.current = { getImage, onTap, onSwipeMove, onSwipeEnd };

  const commit = useCallback((next: ZoomState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** Keep the photo covering the stage: no empty edges while zoomed. */
  const clamp = useCallback(
    (s: ZoomState): ZoomState => {
      const vp = viewportRef.current;
      const img = cb.current.getImage();
      const scale = Math.min(Math.max(s.scale, 1), maxScale);
      if (!vp || !img || scale <= 1) return { scale, x: 0, y: 0 };
      const maxX = Math.max(0, (img.offsetWidth * scale - vp.clientWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * scale - vp.clientHeight) / 2);
      return {
        scale,
        x: Math.min(maxX, Math.max(-maxX, s.x)),
        y: Math.min(maxY, Math.max(-maxY, s.y)),
      };
    },
    [viewportRef, maxScale]
  );

  /** Point relative to the viewport centre (the transform origin). */
  const fromCentre = useCallback(
    (p: Point): Point => {
      const vp = viewportRef.current;
      if (!vp) return { x: 0, y: 0 };
      const r = vp.getBoundingClientRect();
      return { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) };
    },
    [viewportRef]
  );

  /** Zoom to `scale`, keeping the photo point under `at` (client coords) fixed. */
  const zoomTo = useCallback(
    (scale: number, at?: Point) => {
      const cur = stateRef.current;
      const target = Math.min(Math.max(scale, 1), maxScale);
      const p = at ? fromCentre(at) : { x: 0, y: 0 };
      const k = target / cur.scale;
      commit(
        clamp({
          scale: target,
          x: p.x - (p.x - cur.x) * k,
          y: p.y - (p.y - cur.y) * k,
        })
      );
    },
    [clamp, commit, fromCentre, maxScale]
  );

  const reset = useCallback(() => commit(IDENTITY), [commit]);

  const toggleZoom = useCallback(
    (at?: Point) => {
      if (stateRef.current.scale > 1.01) reset();
      else zoomTo(maxScale, at);
    },
    [maxScale, reset, zoomTo]
  );

  const zoomBy = useCallback(
    (factor: number) => zoomTo(stateRef.current.scale * factor),
    [zoomTo]
  );

  useEffect(() => {
    const vp = viewportRef.current;
    if (!enabled || !vp) return;

    const pointers = new Map<number, Point>();
    let mode: Mode = "idle";
    let start: Point = { x: 0, y: 0 };
    let startTime = 0;
    let startState: ZoomState = IDENTITY;
    let pinchStart = { dist: 1, mid: { x: 0, y: 0 } as Point };
    let moved = false;
    let downOnImage = false;
    let lastTap: { time: number; p: Point } | null = null;
    let singleTimer: ReturnType<typeof setTimeout> | undefined;

    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const two = () => Array.from(pointers.values()).slice(0, 2) as [Point, Point];

    const beginPinch = () => {
      const [a, b] = two();
      mode = "pinch";
      moved = true;
      startState = stateRef.current;
      pinchStart = { dist: Math.max(1, dist(a, b)), mid: fromCentre(mid(a, b)) };
      setGesturing(true);
    };

    const beginSingle = (p: Point) => {
      start = p;
      startTime = performance.now();
      startState = stateRef.current;
      mode = stateRef.current.scale > 1.01 ? "pan" : "pending";
    };

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, [data-lightbox-ignore]")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        moved = false;
        downOnImage = !!(target && cb.current.getImage()?.contains(target));
        beginSingle({ x: e.clientX, y: e.clientY });
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      } else if (pointers.size === 2) {
        if (mode === "swipe") cb.current.onSwipeEnd?.(0, 0);
        beginPinch();
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, p);

      if (mode === "pinch" && pointers.size >= 2) {
        const [a, b] = two();
        const m = fromCentre(mid(a, b));
        const scale = Math.min(
          Math.max(startState.scale * (dist(a, b) / pinchStart.dist), 1),
          maxScale
        );
        const k = scale / startState.scale;
        commit(
          clamp({
            scale,
            x: m.x - (pinchStart.mid.x - startState.x) * k,
            y: m.y - (pinchStart.mid.y - startState.y) * k,
          })
        );
        return;
      }

      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!moved && Math.hypot(dx, dy) > TAP_SLOP) moved = true;

      if (mode === "pan") {
        if (moved) setGesturing(true);
        commit(clamp({ scale: startState.scale, x: startState.x + dx, y: startState.y + dy }));
      } else if (mode === "pending" && moved) {
        // Decide the axis once: vertical = swipe to close, horizontal = carousel.
        mode = Math.abs(dy) > Math.abs(dx) ? "swipe" : "ignore";
      }
      if (mode === "swipe") cb.current.onSwipeMove?.(dy);
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = { x: e.clientX, y: e.clientY };
      pointers.delete(e.pointerId);

      if (mode === "pinch") {
        if (stateRef.current.scale < 1.05) commit(IDENTITY);
        if (pointers.size === 1) {
          // Continue as a pan with the remaining finger.
          const rest = Array.from(pointers.values())[0];
          beginSingle(rest);
          mode = stateRef.current.scale > 1.01 ? "pan" : "ignore";
          moved = true;
          return;
        }
      } else if (mode === "swipe") {
        const dt = Math.max(1, performance.now() - startTime);
        const dy = p.y - start.y;
        cb.current.onSwipeEnd?.(dy, dy / dt);
      } else if (!moved && performance.now() - startTime < 400) {
        // A tap. Two taps close together in time and place = double tap.
        const now = performance.now();
        if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && dist(lastTap.p, p) < 30) {
          clearTimeout(singleTimer);
          lastTap = null;
          toggleZoom(p);
        } else {
          lastTap = { time: now, p };
          const onImage = downOnImage;
          clearTimeout(singleTimer);
          singleTimer = setTimeout(() => cb.current.onTap?.({ onImage }), SINGLE_TAP_DELAY);
        }
      }

      if (pointers.size === 0) {
        mode = "idle";
        setGesturing(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinch arrives as ctrl + wheel.
        zoomTo(stateRef.current.scale * Math.exp(-e.deltaY * 0.01), {
          x: e.clientX,
          y: e.clientY,
        });
      } else if (stateRef.current.scale > 1.01) {
        const s = stateRef.current;
        commit(clamp({ ...s, x: s.x - e.deltaX, y: s.y - e.deltaY }));
      }
    };

    vp.addEventListener("pointerdown", onDown);
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      clearTimeout(singleTimer);
      vp.removeEventListener("pointerdown", onDown);
      vp.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [enabled, viewportRef, clamp, commit, fromCentre, maxScale, toggleZoom, zoomTo]);

  return {
    state,
    zoomed: state.scale > 1.01,
    gesturing,
    zoomTo,
    zoomBy,
    toggleZoom,
    reset,
  };
}

/**
 * First-party reading analytics (feeds the admin Analytics tab).
 *
 * - A random session id lives in sessionStorage only: no cookies, no
 *   fingerprinting, gone when the tab closes.
 * - The landing referrer and utm_* tags are sent once per page load, with the
 *   first event; later in-app navigations send none, so a whole visit is not
 *   credited to the site that sent it.
 * - Do Not Track and Global Privacy Control are honoured by sending nothing.
 * - Nothing is ever sent from /admin.
 * - If the server answers { enabled: false } (events table missing), the
 *   client stops sending for the rest of the session.
 *
 * Server side: POST /api/t and POST /api/articles/:slug/view
 * (api/_lib/analytics.js).
 */

import { useEffect } from "react";

const SID_KEY = "np_sid";
const OFF_KEY = "np_t_off";
const ENDPOINT = "/api/t";

export interface TrafficContext {
  referrer: string | null;
  utm: { source?: string; medium?: string; campaign?: string } | null;
  sid: string | null;
}

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** False when the reader asked not to be tracked, or tracking is off. */
export function trackingAllowed(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  if (nav.doNotTrack === "1" || win.doNotTrack === "1" || nav.msDoNotTrack === "1") return false;
  if (nav.globalPrivacyControl === true) return false;
  if (window.location.pathname.startsWith("/admin")) return false;
  try {
    if (store()?.getItem(OFF_KEY) === "1") return false;
  } catch {
    /* storage blocked: still fine to send */
  }
  return true;
}

function turnOff() {
  try {
    store()?.setItem(OFF_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Random per-tab session id (sessionStorage), or null when unavailable. */
export function sessionId(): string | null {
  try {
    const s = store();
    if (!s) return null;
    let id = s.getItem(SID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      s.setItem(SID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

// Captured at module load, i.e. when the reader lands on the site.
let landing: { referrer: string | null; utm: TrafficContext["utm"] } | null = null;
if (typeof window !== "undefined") {
  try {
    const q = new URLSearchParams(window.location.search);
    const pick = (k: string) => q.get(k)?.slice(0, 100) || undefined;
    const utm = { source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign") };
    landing = {
      referrer: document.referrer || null,
      utm: utm.source || utm.medium || utm.campaign ? utm : null,
    };
  } catch {
    landing = null;
  }
}

/**
 * Referrer, utm tags and session id for the next event. The landing
 * referrer/utm are handed out once; afterwards both are null.
 * Returns null when tracking is not allowed.
 */
export function trafficContext(): TrafficContext | null {
  if (!trackingAllowed()) return null;
  const first = landing;
  landing = null;
  return { referrer: first?.referrer ?? null, utm: first?.utm ?? null, sid: sessionId() };
}

function send(body: Record<string, unknown>, beacon: boolean) {
  const json = JSON.stringify(body);
  try {
    // text/plain keeps sendBeacon a "simple" request; the server parses it.
    if (beacon && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "text/plain;charset=UTF-8" }))) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
      credentials: "omit",
    })
      .then(async (r) => {
        if (r.status === 200) {
          const data = await r.json().catch(() => null);
          if (data && data.enabled === false) turnOff();
        }
      })
      .catch(() => {
        /* analytics must never disturb the reader */
      });
  } catch {
    /* ignore */
  }
}

/** Record one page view (home, channel and other non-article pages). */
export function trackPageView(path: string, extra: { channelId?: number | string | null; articleId?: number | null } = {}) {
  const ctx = trafficContext();
  if (!ctx) return;
  send({ kind: "view", path, ...ctx, ...extra }, false);
}

/**
 * React hook: one page view for the current path, on mount and whenever
 * `key` changes (e.g. the channel being shown).
 */
export function usePageView(key: string | number | null = null, extra: { channelId?: number | null } = {}) {
  const channelId = extra.channelId ?? null;
  useEffect(() => {
    trackPageView(window.location.pathname, channelId != null ? { channelId } : {});
  }, [key, channelId]);
}

/**
 * Read-through for one article: engaged time (tab visible and the reader
 * active in the last 15 s) and the deepest scroll position reached. Sent once,
 * on pagehide, on the tab going hidden, or when the article is left in-app.
 * Returns a cleanup function.
 */
export function startReadTracking(articleId: number, path: string): () => void {
  if (!trackingAllowed()) return () => {};
  const IDLE_MS = 15_000;
  let engagedMs = 0;
  let maxScroll = 0;
  let lastActive = Date.now();
  let lastTick = Date.now();
  let sent = false;

  const measureScroll = () => {
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    const seen = window.scrollY + window.innerHeight;
    const pct = height > 0 ? Math.min(100, Math.round((seen / height) * 100)) : 0;
    if (pct > maxScroll) maxScroll = pct;
  };
  const active = () => {
    lastActive = Date.now();
  };
  const onScroll = () => {
    active();
    measureScroll();
  };
  const tick = () => {
    const now = Date.now();
    if (document.visibilityState === "visible" && now - lastActive < IDLE_MS) engagedMs += now - lastTick;
    lastTick = now;
  };
  const timer = window.setInterval(tick, 1000);

  const flush = () => {
    if (sent) return;
    tick();
    if (engagedMs < 1000) return; // a bounce, not a read
    sent = true;
    send({ kind: "read", path, articleId, engagedMs, scrollPct: maxScroll, sid: sessionId() }, true);
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
    else lastTick = Date.now();
  };

  measureScroll();
  const opts: AddEventListenerOptions = { passive: true };
  window.addEventListener("scroll", onScroll, opts);
  for (const ev of ["pointerdown", "keydown", "touchstart", "mousemove", "wheel"]) window.addEventListener(ev, active, opts);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);

  return () => {
    flush();
    window.clearInterval(timer);
    window.removeEventListener("scroll", onScroll);
    for (const ev of ["pointerdown", "keydown", "touchstart", "mousemove", "wheel"]) window.removeEventListener(ev, active);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", flush);
  };
}

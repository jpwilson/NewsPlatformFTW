/** Types for analytics.js. */
export declare function registerAnalyticsRoutes(
  app: unknown,
  deps: { supabase: any; getSupabaseUid: (req: any) => Promise<string | null>; isAdminUser: (uid: string) => Promise<boolean> }
): void;
export declare function recordPageEvent(sb: any, req: any, fields: Record<string, unknown>): Promise<boolean>;

export type AnalyticsRange = "24h" | "7d" | "30d" | "90d";
export declare const RANGES: Record<AnalyticsRange, { days: number; bucket: "hour" | "day" }>;

export interface PageEventRow {
  kind: "view" | "read" | "bot";
  path: string;
  article_id: number | null;
  channel_id: number | null;
  visitor: string;
  user_id: number | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  bot: string | null;
  status: number | null;
  engaged_ms: number | null;
  scroll_pct: number | null;
}

export interface AnalyticsTotals {
  reads: number;
  readers: number;
  signedInReaders: number;
  newUsers: number | null;
  newFollowers: number | null;
  comments: number;
  articlesPublished: number;
}

export interface AnalyticsTraffic {
  views: number;
  visitors: number;
  referrers: { host: string | null; kind: "ai" | "search" | "social" | "campaign" | "direct" | "other"; views: number }[];
  sourceKinds: { kind: string; views: number }[];
  countries: { country: string | null; views: number }[];
  devices: { device: string; views: number }[];
  bots: {
    total: number;
    errors: number;
    lastSeen: string | null;
    daysWithoutHits: number | null;
    list: { name: string; ai: boolean; hits: number; errors: number; lastSeen: string | null }[];
  };
  readThrough: {
    events: number;
    medianEngagedSeconds: number | null;
    medianScrollPct: number | null;
    finishedShare: number | null;
  };
}

export interface AnalyticsResponse {
  range: { key: AnalyticsRange; from: string; to: string; days: number; bucket: "hour" | "day"; tz: number };
  previousRange: { from: string; to: string };
  generatedAt: string;
  truncated: boolean;
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  series: { date: string; reads: number; readers: number; previousReads: number; articlesPublished: number; comments: number }[];
  topArticles: {
    id: number; title: string; slug: string | null; channelId: number | null; channelName: string | null;
    reads: number; shownOnSite: number | null; comments: number;
  }[];
  topChannels: { id: number; name: string; reads: number; articlesPublished: number; newFollowers: number | null }[];
  freshArticles: {
    id: number; title: string; slug: string | null; channelName: string | null;
    publishedAt: string; reads: number; hasCover: boolean | null;
  }[];
  readers: { returning: number; new: number; signedIn: number; anonymous: number; articlesPerReader: number | null };
  health: { lastApiPublishAt: string | null; articlesWithoutCover: number; crawlerErrors: number | null; crawlerHits: number | null };
  traffic: AnalyticsTraffic | null;
}

export declare function computeRange(range: string, tz?: number, now?: number): {
  key: string; days: number; bucket: "hour" | "day"; tz: number; step: number; buckets: number;
  from: number; to: number; prevFrom: number; prevTo: number; label: (i: number) => string;
} | null;
export declare function buildAnalytics(
  sb: any,
  opts?: { range?: string; tz?: number; now?: number; pageSize?: number; maxPages?: number }
): Promise<AnalyticsResponse>;
export declare function buildEventRow(req: any, fields?: Record<string, unknown>): PageEventRow;
export declare function validateBeacon(body: unknown): { fields: Record<string, unknown>; error?: undefined } | { error: string; fields?: undefined };
export declare function readPaged(
  build: () => any,
  opts?: { pageSize?: number; maxPages?: number }
): Promise<{ rows: any[]; error: any; truncated: boolean }>;
export declare function isMissingTableError(error: unknown): boolean;
export declare function clientIp(req: any): string;
export declare function visitorHash(req: any, now?: Date): string;
export declare function referrerHost(v: unknown): string | null;
export declare function botFromUserAgent(ua: unknown): string | null;
export declare function deviceFromUserAgent(ua: unknown): string;
export declare function browserFromUserAgent(ua: unknown): string;
export declare function _resetAnalyticsState(): void;

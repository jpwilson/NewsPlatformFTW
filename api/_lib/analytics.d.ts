/** Types for analytics.js. */
export declare function registerAnalyticsRoutes(
  app: unknown,
  deps: { supabase: any; getSupabaseUid: (req: any) => Promise<string | null>; isAdminUser: (uid: string) => Promise<boolean> }
): void;
export declare function recordPageEvent(sb: any, req: any, fields: Record<string, unknown>): Promise<void>;

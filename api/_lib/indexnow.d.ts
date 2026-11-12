/** Types for indexnow.js. */
export declare const INDEXNOW_KEY: string;
export declare const INDEXNOW_HOST: string;
export declare const INDEXNOW_ENDPOINT: string;
export declare function pingIndexNow(
  urls: string[],
  options?: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<{ sent: boolean; status?: number; reason?: string; urls?: string[] }>;

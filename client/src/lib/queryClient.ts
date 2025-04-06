import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from '@/lib/supabase';

export async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let errorDetails = "";
    
    try {
      // Try to parse the error as JSON if possible
      const errorJson = JSON.parse(text);
      errorDetails = errorJson.details ? ` (${errorJson.details})` : "";
    } catch (e) {
      // If not JSON or parsing fails, use text as is
    }
    
    console.error(`API Error ${res.status}: ${text}${errorDetails}`);
    throw new Error(`${res.status}: ${text}`);
  }
}

// List of paths that should target Supabase Edge Functions directly in production
const supabaseFunctionPaths = ['/api/is-admin', '/api/admin-articles']; // Add more admin function paths here

export async function apiRequest(
  method: string,
  url: string, // e.g., '/api/is-admin' or '/api/user'
  data?: unknown | undefined,
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  let targetUrl = url; // Default to relative path

  // Check if this path is a Supabase function AND we are in production
  const isSupabasePath = supabaseFunctionPaths.some(p => url.startsWith(p));
  // Access NODE_ENV exposed via vite define config
  const isProduction = process.env.NODE_ENV === 'production';

  if (isSupabasePath && isProduction) {
    // Construct absolute Supabase Function URL
    const supabaseBaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseBaseUrl) {
       console.error("VITE_SUPABASE_URL environment variable is not set!");
       throw new Error("Supabase URL configuration is missing.");
    }
    // Extract function name + params (e.g., 'is-admin' or 'admin-articles/100')
    const functionPath = url.substring(4); // Remove '/api' prefix
    targetUrl = `${supabaseBaseUrl}/functions/v1${functionPath}`;
    console.log(`[apiRequest] Production mode: Targeting absolute Supabase Function URL: ${targetUrl}`);
  } else {
     console.log(`[apiRequest] Development mode or non-Supabase API path: Using relative URL: ${targetUrl}`);
  }

  // Use the determined targetUrl for the fetch call
  const res = await fetch(targetUrl, { 
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    // credentials: "include", // Likely not needed for Supabase token auth
  });

  console.log(`Response from ${method} ${targetUrl}: ${res.status} ${res.statusText}`);

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Get the Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    
    // Build headers
    const headers: Record<string, string> = {};
    
    // Add auth token if available
    const url = queryKey[0] as string;
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
      console.log(`Query ${url} - Auth token present (${session.access_token.substring(0, 10)}...)`);
    } else {
      console.warn(`Query ${url} - No auth token available`);
    }

    console.log(`Fetching data from ${url}`);
    
    const res = await fetch(url, {
      credentials: "include",
      headers
    });

    console.log(`Response from ${url}: ${res.status} ${res.statusText}`);
    
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      console.warn(`Unauthorized access to ${url}, returning null as configured`);
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

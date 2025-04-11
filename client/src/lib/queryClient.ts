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

async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error("Error getting access token:", error);
    return null;
  }
}

export async function apiRequest(method: string, path: string, body?: object) {
  try {
    console.log(`[apiRequest] Making ${method} request to ${path}`);
    
    const isSupabaseFunction = supabaseFunctionPaths.some(funcPath => 
      path === funcPath || path.startsWith(`${funcPath}/`));
    
    // For Supabase Edge Functions, use absolute URL. For regular API, use relative URL.
    const isDevelopment = import.meta.env.MODE === 'development';
    const isPublicFolderApi = path.startsWith('/api/public/');
    const accessToken = await getAccessToken();
    
    // Determine the URL to use
    let url: string;
    
    if (isSupabaseFunction && !isDevelopment) {
      // Supabase function in production environment
      console.log(`[apiRequest] Using Supabase URL for edge function: ${path}`);
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      
      // Extract function name + params (e.g., 'is-admin' or 'admin-articles/100')
      const functionPath = path.replace('/api/', '');
      url = `${supabaseUrl}/functions/v1/${functionPath}`;
    } else if (isPublicFolderApi) {
      // Public folder API (static files)
      url = path;
    } else {
      // Default - development mode or non-Supabase API path
      console.log(`[apiRequest] Development mode or non-Supabase API path: Using relative URL: ${path}`);
      url = path;
    }
    
    // Prepare headers and request options
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    const requestOptions: RequestInit = { method, headers };
    
    if (accessToken) {
      console.log(`[apiRequest] Auth token present (${accessToken.substring(0, 8)}...)`);
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      console.log('[apiRequest] No auth token available');
    }
    
    if (isSupabaseFunction && !isDevelopment) {
      const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      console.log(`[apiRequest] Adding API key header for Supabase function (${apiKey.substring(0, 8)}...)`);
      headers['apikey'] = apiKey;
    }
    
    if (body) {
      console.log(`[apiRequest] Request body:`, body);
      requestOptions.body = JSON.stringify(body);
    }
    
    console.log(`[apiRequest] Fetching data from ${url}`);
    const response = await fetch(url, requestOptions);
    
    console.log(`[apiRequest] Response from ${path}: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      // If the response is not ok, try to parse the error
      let errorText = await response.text();
      let errorJson;
      
      try {
        errorJson = JSON.parse(errorText);
        console.error(`[apiRequest] Error response from ${path}:`, errorJson);
      } catch (e) {
        console.error(`[apiRequest] Error response from ${path} (not JSON):`, errorText);
      }
      
      throw new Error(
        errorJson?.error || errorJson?.message || 
        `Request failed with status ${response.status}: ${response.statusText}`
      );
    }
    
    return response;
  } catch (error) {
    console.error(`[apiRequest] Error with ${method} ${path}:`, error);
    throw error;
  }
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

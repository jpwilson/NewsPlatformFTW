import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase'; // Import your configured Supabase client

// Define the expected shape of the JSON response from the /api/is-admin endpoint
interface IsAdminResponse {
  isAdmin: boolean;
  hasApiAccess?: boolean;
  error?: string; // Optional error message from the function itself
}

export function useAdminAuth() {
  // State to hold the Supabase Auth User ID (UUID string)
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  // Track if we have attempted the initial fetch
  const [initialAuthAttempted, setInitialAuthAttempted] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkSupabaseAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (isMounted) {
          const currentId = session?.user?.id ?? null;
          setSupabaseUserId(currentId);
        }
      } catch (error) {
        console.error("Error fetching initial Supabase session:", error);
        if (isMounted) {
          setSupabaseUserId(null);
        }
      } finally {
        if (isMounted) {
          setInitialAuthAttempted(true);
        }
      }
    };

    checkSupabaseAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      if (isMounted) {
        setSupabaseUserId(newUserId);
        setInitialAuthAttempted(true);
      }
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const { data, isLoading: isAdminCheckLoading, error: queryError, isFetching } = useQuery<
    IsAdminResponse, // Expected success data type
    Error,           // Type for errors thrown by apiRequest or react-query
    IsAdminResponse, // Type returned by select (same as success data type here)
    // Use the string UUID from Supabase Auth for the key
    readonly [string, string | null] // Type for queryKey
  >({
    // Use the supabaseUserId (string | null) which matches the key type
    queryKey: ['isAdminCheck', supabaseUserId],
    queryFn: async () => {
      // This should only run if enabled: true, which requires supabaseUserId to be truthy
      if (!supabaseUserId) {
        // This case should ideally not be reached if enabled logic is correct,
        // but acts as a safeguard.
        return { isAdmin: false };
      }

      try {
        const response = await apiRequest('GET', '/api/is-admin');
        const responseData: IsAdminResponse = await response.json();
        return responseData;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to check admin status';
        console.error('useAdminAuth queryFn: Error calling /api/is-admin:', errorMessage);
        // Ensure the error is reflected in the return shape if needed elsewhere
        return { isAdmin: false, error: errorMessage };
      }
    },
    // Enable the query only when we have a non-null supabaseUserId.
    enabled: !!supabaseUserId,
    // staleTime: 5 * 60 * 1000, // Cache the result for 5 minutes (Temporarily disabled for debugging)
    staleTime: 0, // Force refetch always when enabled
    retry: false, // Don't retry on failure
    // Keep initialData to prevent issues before first fetch attempt when enabled
    initialData: { isAdmin: false },
  });

  // Determine overall loading state:
  // - Loading if the initial auth check hasn't been attempted yet.
  // - OR Loading if the query is enabled (we have an ID) and it's currently fetching.
  const isLoading = !initialAuthAttempted || (!!supabaseUserId && (isAdminCheckLoading || isFetching));

  // Use the data from the query if available, otherwise stick with initialData's default
  const isAdmin = data?.isAdmin ?? false;
  const hasApiAccess = data?.hasApiAccess ?? false;
  // Prioritize error from the query data itself (returned by the function), then query-level error
  const error = data?.error || (queryError ? queryError.message : null);

  return {
    isAdmin,
    hasApiAccess,
    isLoading,
    error,
  };
} 
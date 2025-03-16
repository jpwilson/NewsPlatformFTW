import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "../lib/oauth-debug"; // Add debug utilities
import { useAuth } from "@/hooks/use-auth";

export default function AuthCallback() {
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState("");
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Log the current URL and hash for debugging (only to console, not displayed to user)
        console.log("Auth callback running at:", window.location.href);
        console.log("URL hash:", window.location.hash);

        // Parse the URL hash manually if needed
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1) // Remove the # character
        );
        console.log(
          "Access token from hash:",
          hashParams.get("access_token") ? "✓ Present" : "✗ Missing"
        );

        // Set page status
        setStatus("Processing authentication...");

        // Get session from URL
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Supabase auth session error:", error);
          setError(error.message);
          return;
        }

        if (!session) {
          console.error("No session found in auth callback");

          // Try to set the session from the URL hash
          if (hashParams.get("access_token")) {
            console.log("Attempting to set session from URL hash...");

            try {
              // This is a workaround in case getSession() doesn't pick up the hash params
              const response = await fetch("/api/auth/session-from-hash", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  access_token: hashParams.get("access_token"),
                  refresh_token: hashParams.get("refresh_token"),
                  expires_in: hashParams.get("expires_in"),
                  provider_token: hashParams.get("provider_token"),
                }),
              }).catch((err) => {
                console.error("Error fetching session-from-hash:", err);
                return null;
              });

              // If we can't reach the API, redirect to home anyway
              if (!response) {
                console.log("Couldn't reach API, redirecting to home...");
                window.location.href = `${window.location.origin}/`;
                return;
              }

              const result = await response.json();
              console.log("Session from hash result:", result);

              // Even if this fails, continue to home page
              window.location.href = `${window.location.origin}/`;
              return;
            } catch (err) {
              console.error("Error setting session from hash:", err);
              // Continue to home page anyway
              window.location.href = `${window.location.origin}/`;
              return;
            }
          }

          setError("No session found");
          return;
        }

        // Get user details from session
        const { user } = session;
        console.log("Supabase user:", user);

        // Build the callback URL using the current domain
        const callbackUrl = `${window.location.origin}/api/auth/supabase-callback`;
        console.log("Sending callback to:", callbackUrl);

        // Call your backend to create or get user
        const response = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            supabase_uid: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.user_metadata?.name,
          }),
        }).catch((err) => {
          console.error("Network error calling supabase-callback:", err);
          // If we can't reach the API, redirect to home anyway
          window.location.href = `${window.location.origin}/`;
          return null;
        });

        // If we couldn't reach the API, we've already redirected
        if (!response) return;

        const result = await response.json();
        console.log("Server response:", result);

        // Use the refreshUser function to update auth state
        await refreshUser();
        console.log("User data refreshed to update auth state");

        // Redirect to home page ON THE SAME DOMAIN regardless of result
        console.log("Authentication flow complete, redirecting to home page");
        window.location.href = `${window.location.origin}/`;
      } catch (err) {
        console.error("Error in auth callback:", err);
        setError("An unexpected error occurred");

        // Even if there's an error, try to redirect to home after a delay
        setTimeout(() => {
          window.location.href = `${window.location.origin}/`;
        }, 3000);
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8 bg-card rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4">Authentication in Progress</h1>
        <p className="mb-4">{status}</p>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <div className="mt-4 w-16 h-16 border-t-4 border-primary border-solid rounded-full animate-spin mx-auto"></div>
      </div>
    </div>
  );
}

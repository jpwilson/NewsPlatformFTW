import { createContext, useContext, useEffect, ReactNode } from "react";
import posthog from "posthog-js";
import { User } from "@shared/schema";

interface PostHogContextType {
  posthog: typeof posthog | null;
  trackEvent: (eventName: string, properties?: Record<string, any>) => void;
  identify: (userId: string | number, properties?: Record<string, any>) => void;
}

const PostHogContext = createContext<PostHogContextType>({
  posthog: null,
  trackEvent: () => {},
  identify: () => {},
});

interface PostHogProviderProps {
  children: ReactNode;
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

  useEffect(() => {
    // Only initialize if key is provided
    if (posthogKey) {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        loaded: (posthog) => {
          if (import.meta.env.DEV) {
            console.log("PostHog initialized");
          }
        },
        capture_pageview: false, // We'll handle pageviews manually
        capture_pageleave: true,
        autocapture: false, // We'll capture events manually
      });
    }

    return () => {
      // Cleanup on unmount
      if (posthogKey) {
        posthog.reset();
      }
    };
  }, [posthogKey, posthogHost]);

  const trackEvent = (eventName: string, properties?: Record<string, any>) => {
    if (posthogKey) {
      posthog.capture(eventName, properties);
    }
  };

  const identify = (userId: string | number, properties?: Record<string, any>) => {
    if (posthogKey) {
      posthog.identify(String(userId), properties);
    }
  };

  const value: PostHogContextType = {
    posthog: posthogKey ? posthog : null,
    trackEvent,
    identify,
  };

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  );
}

export function usePostHog() {
  const context = useContext(PostHogContext);
  if (!context) {
    throw new Error("usePostHog must be used within a PostHogProvider");
  }
  return context;
}

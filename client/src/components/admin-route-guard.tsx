import React from "react";
import { useLocation } from "wouter";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { LoadingSpinner } from "@/components/ui/loading-spinner"; // Assuming you have a loading spinner

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

export function AdminRouteGuard({
  children,
}: AdminRouteGuardProps): JSX.Element | null {
  const { isAdmin, isLoading, error } = useAdminAuth();
  const [, setLocation] = useLocation();

  // Handle loading state
  if (isLoading) {
    console.log("AdminRouteGuard: Checking admin status...");
    // Optional: Render a loading indicator, maybe centered
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size={48} />
      </div>
    );
  }

  // Handle errors during the check (optional, could also just treat as not admin)
  if (error) {
    console.error("AdminRouteGuard: Error checking admin status:", error);
    // Redirect to home or an error page on failure
    setLocation("/");
    return null; // Don't render children
  }

  // Handle authenticated but not admin state
  if (!isAdmin) {
    console.log("AdminRouteGuard: User is not admin. Redirecting...");
    // Redirect non-admins to the home page
    setLocation("/");
    return null; // Don't render children
  }

  // If loading is finished, no errors, and user is admin, render the protected content
  console.log("AdminRouteGuard: User is admin. Rendering protected content.");
  return <>{children}</>;
}

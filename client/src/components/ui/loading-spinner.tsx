import React from "react";
import { cn } from "@/lib/utils"; // Assuming you use cn for class merging

interface LoadingSpinnerProps {
  size?: number; // Size in pixels
  className?: string;
}

export function LoadingSpinner({
  size = 24,
  className,
}: LoadingSpinnerProps): JSX.Element {
  const style = {
    width: `${size}px`,
    height: `${size}px`,
    borderWidth: `${Math.max(2, Math.floor(size / 8))}px`, // Adjust border width based on size
  };

  return (
    <div
      style={style}
      className={cn(
        "animate-spin rounded-full border-solid border-primary border-t-transparent",
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    ></div>
  );
}

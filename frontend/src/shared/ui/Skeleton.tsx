import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/cn";

/** Decorative loading placeholder. Pair with a visually hidden status message for screen readers. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

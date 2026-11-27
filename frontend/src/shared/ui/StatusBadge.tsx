import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        success: "bg-success/15 text-success-foreground",
        danger: "bg-danger/15 text-danger-foreground",
        neutral: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type StatusBadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

/** Status pill. The text carries the meaning; colour is never the only signal (WCAG 1.4.1). */
export function StatusBadge({ className, tone, children, ...props }: StatusBadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

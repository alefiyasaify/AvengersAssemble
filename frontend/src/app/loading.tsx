import { Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

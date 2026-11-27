"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

import { Button, Card, CardDescription, CardTitle } from "@/shared/ui";

// Next.js 16 error-boundary props: `error` may be any thrown value; `retry` re-renders the segment.
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Server errors arrive with a `digest` that matches the server logs; never show internals.
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <Card role="alert" className="space-y-4">
      <CardTitle>Something went wrong</CardTitle>
      <CardDescription>
        An unexpected error occurred while loading this page.
        {digest ? ` Reference: ${digest}.` : null}
      </CardDescription>
      <Button onClick={() => retry()}>Try again</Button>
    </Card>
  );
}

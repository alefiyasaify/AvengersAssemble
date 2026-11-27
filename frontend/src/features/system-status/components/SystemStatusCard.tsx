"use client";

import { Button, Card, CardDescription, CardTitle, Skeleton, StatusBadge } from "@/shared/ui";

import { useReadiness, useVersion } from "../hooks/useSystemStatus";

/** Shows backend health through the same-origin proxy: proves browser -> Next.js -> FastAPI -> DB. */
export function SystemStatusCard() {
  const readiness = useReadiness();
  const version = useVersion();

  return (
    <Card aria-labelledby="system-status-title" aria-busy={readiness.isPending}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle id="system-status-title">System status</CardTitle>
          <CardDescription>Live check of the API and its database.</CardDescription>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void readiness.refetch()}
          disabled={readiness.isFetching}
        >
          {readiness.isFetching ? "Checking…" : "Check again"}
        </Button>
      </div>

      <div className="mt-6" role="status" aria-live="polite">
        {readiness.isPending ? (
          <div>
            <span className="sr-only">Checking system status…</span>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-3 h-4 w-56" />
          </div>
        ) : readiness.isError ? (
          <div className="space-y-2">
            <StatusBadge tone="danger">Unavailable</StatusBadge>
            <p className="text-sm text-foreground">{readiness.error.message}</p>
            {readiness.error.requestId ? (
              <p className="text-xs text-muted-foreground">
                Reference: <code className="font-mono">{readiness.error.requestId}</code>
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <StatusBadge tone="success">Operational</StatusBadge>
            <ul className="space-y-1 text-sm" aria-label="Dependency checks">
              {Object.entries(readiness.data.checks).map(([name, state]) => (
                <li key={name} className="flex gap-2">
                  <span className="capitalize">{name}</span>
                  <span className="text-muted-foreground">{state === "ok" ? "OK" : "Failing"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-border pt-4 text-sm">
        <dt className="text-muted-foreground">API version</dt>
        <dd>{version.data?.version ?? (version.isError ? "Unknown" : "…")}</dd>
        <dt className="text-muted-foreground">Build</dt>
        <dd className="font-mono">{version.data?.commit ?? (version.isError ? "Unknown" : "…")}</dd>
      </dl>
    </Card>
  );
}

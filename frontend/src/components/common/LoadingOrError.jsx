import { Alert, Button, Skeleton } from "antd";

import { ApiError } from "../../api/httpClient";

/**
 * Shows a skeleton while a React Query request loads, an error with Retry if it fails,
 * and otherwise renders children(data).
 */
export function LoadingOrError({ query, children, rows = 6 }) {
  if (query.isPending) return <Skeleton active paragraph={{ rows }} />;
  if (query.isError) {
    const err = query.error;
    const message = err instanceof ApiError ? err.message : "Something went wrong.";
    return (
      <Alert
        type="error"
        showIcon
        title="Could not load this page"
        description={
          <span>
            {message}
            {err instanceof ApiError && err.requestId ? ` (request ${err.requestId})` : ""}
          </span>
        }
        action={
          <Button size="small" onClick={() => query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  return children(query.data);
}

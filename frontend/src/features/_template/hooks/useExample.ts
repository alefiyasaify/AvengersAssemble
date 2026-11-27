import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "@/shared/api-client";

import { fetchExample } from "../api/example";
import type { Example } from "../types";

export const exampleKeys = {
  all: ["example"] as const,
  detail: () => [...exampleKeys.all, "detail"] as const,
};

export function useExample() {
  return useQuery<Example, ApiError>({
    queryKey: exampleKeys.detail(),
    queryFn: () => fetchExample(),
  });
}

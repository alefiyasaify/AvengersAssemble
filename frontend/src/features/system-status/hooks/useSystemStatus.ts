import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "@/shared/api-client";

import { fetchReadiness, fetchVersion } from "../api/system-status";
import type { Readiness, VersionInfo } from "../types";

export const systemStatusKeys = {
  all: ["system-status"] as const,
  readiness: () => [...systemStatusKeys.all, "readiness"] as const,
  version: () => [...systemStatusKeys.all, "version"] as const,
};

export function useReadiness() {
  return useQuery<Readiness, ApiError>({
    queryKey: systemStatusKeys.readiness(),
    queryFn: () => fetchReadiness(),
    // A probe must reflect the current state, not a cached one.
    staleTime: 0,
    retry: false,
  });
}

export function useVersion() {
  return useQuery<VersionInfo, ApiError>({
    queryKey: systemStatusKeys.version(),
    queryFn: () => fetchVersion(),
    staleTime: Infinity,
  });
}

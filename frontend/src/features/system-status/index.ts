// Public interface of the system-status feature. Other code imports ONLY from here.
export { SystemStatusCard } from "./components/SystemStatusCard";
export { systemStatusKeys, useReadiness, useVersion } from "./hooks/useSystemStatus";
export type { Readiness, VersionInfo } from "./types";

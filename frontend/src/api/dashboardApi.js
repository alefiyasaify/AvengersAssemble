import { api } from "./httpClient";

/**
 * GET /dashboard/summary?from=&to=&department=&category= → DashboardSummary
 * Scope follows the caller's role (own / team / company).
 */
export const getDashboardSummary = ({ from, to, department, category } = {}) =>
  api.get("/dashboard/summary", { from, to, department, category });

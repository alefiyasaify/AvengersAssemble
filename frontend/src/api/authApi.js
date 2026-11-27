import { api } from "./httpClient";

/** POST /auth/login → MeRead. Sets the HttpOnly session cookies and the CSRF cookie. */
export const login = (email, password) => api.post("/auth/login", { email, password });

/** POST /auth/logout → 204. Clears the session cookies. */
export const logout = () => api.post("/auth/logout");

/** GET /me → MeRead (id, full_name, email, role, permissions, department_id, ...). */
export const getMe = () => api.get("/me");

/**
 * POST /auth/register → 202 { status, message }. Public. Creates an INACTIVE employee account
 * that the finance head must activate. Same answer whether or not the email already exists.
 * Body: { email, full_name, password (min 12), department_id, home_city_id?, manager_id? }
 */
export const register = (details) => api.post("/auth/register", details);

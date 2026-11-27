import { api } from "./httpClient";

/** POST /auth/login → MeRead. Sets the HttpOnly session cookies and the CSRF cookie. */
export const login = (email, password) => api.post("/auth/login", { email, password });

/** POST /auth/logout → 204. Clears the session cookies. */
export const logout = () => api.post("/auth/logout");

/** GET /me → MeRead (id, full_name, email, role, permissions, department_id, ...). */
export const getMe = () => api.get("/me");

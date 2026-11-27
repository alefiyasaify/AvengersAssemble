import { api } from "./httpClient";

/** GET /departments → [{ id, code, name }] */
export const listDepartments = () => api.get("/departments");

/** GET /cities → [{ id, name, tier }] */
export const listCities = () => api.get("/cities");

/** GET /categories → [{ code, name }] */
export const listCategories = () => api.get("/categories");

/** GET /users?q= → Page of { id, full_name, employee_code, role, department_id } (for delegation etc.) */
export const searchUsers = (q) => api.get("/users", { q, limit: 20 });

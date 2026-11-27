import { api } from "./httpClient";

// User administration (finance head only; every change is written to the audit trail).

/** GET /admin/users?pending=&q= → Page<UserRead>. pending=true lists inactive accounts (new sign-ups). */
export const listAdminUsers = ({ pending = false, q } = {}) => api.get("/admin/users", { pending, q, limit: 100 });

/**
 * PATCH /admin/users/{id} → UserRead. Send only what changes, e.g.
 * { is_active: true, department_id, manager_id, role }. The backend rejects unknown
 * departments/managers and manager changes that would create a cycle.
 */
export const updateAdminUser = (userId, changes) => api.patch(`/admin/users/${userId}`, changes);

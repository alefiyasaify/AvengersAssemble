import { api } from "./httpClient";

/** GET /policy/active → PolicyVersionRead (any signed-in user; drives the live check on New claim) */
export const getActivePolicy = () => api.get("/policy/active");

/** GET /admin/policy/versions → [PolicyVersionRead] (finance head) */
export const listPolicyVersions = () => api.get("/admin/policy/versions");

/** POST /admin/policy/versions/{id}/publish → PolicyVersionRead (atomic) */
export const publishPolicyVersion = (versionId) => api.post(`/admin/policy/versions/${versionId}/publish`);

/** GET /admin/approval-levels → [ApprovalLevelConfig] */
export const listApprovalLevels = () => api.get("/admin/approval-levels");

/** GET /admin/config → AppConfigRead (auto-approve limit, sample rate, delegation days, timezone) */
export const getAppConfig = () => api.get("/admin/config");

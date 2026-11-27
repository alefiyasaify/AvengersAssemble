import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { USERS } from "../mockData/mockUsers";

// Demo-mode persona switcher. Holds only which demo role is selected (never a token);
// real auth is the HttpOnly cookie session (ADR-0006) and GET /me.
const STORAGE_KEY = "ef.demoRole";
const RoleContext = createContext(null);

export const ROLE_HOME = {
  employee: "/employee/claims",
  manager: "/manager/inbox",
  auditor: "/auditor/queue",
  head: "/head/dashboard",
};

function readStoredRole() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && USERS[value] ? value : null;
  } catch {
    return null;
  }
}

export function RoleProvider({ children }) {
  const [role, setRoleState] = useState(readStoredRole);

  const setRole = useCallback((next) => {
    setRoleState(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be blocked (private mode); the in-memory role still works.
    }
  }, []);

  const value = useMemo(
    () => ({ role, user: role ? USERS[role] : null, setRole }),
    [role, setRole],
  );
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}

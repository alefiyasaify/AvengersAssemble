import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import * as authApi from "../api/authApi";
import { setSessionExpiredHandler } from "../api/httpClient";

// Who is signed in. The session itself is the HttpOnly cookie set by the backend (ADR-0006);
// here we only keep the GET /me answer. Nothing auth-related is stored in localStorage.

const AuthContext = createContext(null);

/** Backend role (MeRead.role) → URL prefix used by the routes. */
const ROLE_KEY = { EMPLOYEE: "employee", MANAGER: "manager", AUDITOR: "auditor", FINANCE_HEAD: "head" };

const ROLE_TITLE = { EMPLOYEE: "Employee", MANAGER: "Line manager", AUDITOR: "Finance auditor", FINANCE_HEAD: "Finance head" };

/** Where each role lands after signing in. */
export const ROLE_HOME = {
  employee: "/employee/claims",
  manager: "/manager/inbox",
  auditor: "/auditor/queue",
  head: "/head/dashboard",
};

function initialsOf(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | signedIn | signedOut

  const signOutLocally = useCallback(() => {
    setMe(null);
    setStatus("signedOut");
    queryClient.clear();
  }, [queryClient]);

  // A 401 only means "session expired" if someone was signed in. Requests made while signed
  // out (e.g. the registration form's lookups) must not clear the cache, or they would refetch
  // and 401 again in a loop.
  const statusRef = useRef(status);
  statusRef.current = status;
  const onSessionExpired = useCallback(() => {
    if (statusRef.current === "signedIn") signOutLocally();
  }, [signOutLocally]);

  // Restore an existing session on page load.
  useEffect(() => {
    setSessionExpiredHandler(onSessionExpired);
    let cancelled = false;
    authApi
      .getMe()
      .then((user) => {
        if (cancelled) return;
        setMe(user);
        setStatus("signedIn");
      })
      .catch(() => {
        if (!cancelled) signOutLocally();
      });
    return () => {
      cancelled = true;
    };
  }, [signOutLocally, onSessionExpired]);

  const login = useCallback(async (email, password) => {
    const user = await authApi.login(email, password);
    setMe(user);
    setStatus("signedIn");
    return ROLE_HOME[ROLE_KEY[user.role]];
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      signOutLocally();
    }
  }, [signOutLocally]);

  const value = useMemo(() => {
    const role = me ? ROLE_KEY[me.role] : null;
    const user = me
      ? { id: me.id, name: me.full_name, initials: initialsOf(me.full_name), title: ROLE_TITLE[me.role], email: me.email, me }
      : null;
    return { status, role, user, login, logout };
  }, [me, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

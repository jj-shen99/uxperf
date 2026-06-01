"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { UserContext, CurrentUser } from "@/hooks/use-current-user";

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];
const STORAGE_KEY = "perf_user";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  // On mount, restore session from localStorage and auto-upgrade to JWT if needed
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const user = JSON.parse(stored);
          setCurrentUser(user);

          // If we have a stored user but no JWT, upgrade the session
          if (!localStorage.getItem("auth_token") && user.id) {
            try {
              const res = await api.auth.sessionUpgrade({ user_id: user.id, email: user.email });
              if (!cancelled && res.token) {
                localStorage.setItem("auth_token", res.token);
              }
            } catch {
              // Upgrade failed — user will need to re-login
            }
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
      if (!cancelled) setInitialized(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Redirect to login if not authenticated and not on an auth page
  useEffect(() => {
    if (!initialized) return;
    if (!currentUser && !AUTH_PAGES.includes(pathname)) {
      router.replace("/login");
    }
  }, [initialized, currentUser, pathname, router]);

  // Fetch all users for admin user list — only when logged in
  const { data: allUsers = [] } = useQuery<CurrentUser[]>({
    queryKey: ["users"],
    queryFn: () => api.rbac.users.list(),
    enabled: !!currentUser,
    retry: 1,
  });

  // Keep session in sync: if API returns updated user data, refresh localStorage
  useEffect(() => {
    if (!currentUser || allUsers.length === 0) return;
    const fresh = allUsers.find((u) => u.id === currentUser.id);
    if (fresh && (fresh.role !== currentUser.role || fresh.display_name !== currentUser.display_name)) {
      setCurrentUser(fresh);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    }
  }, [allUsers, currentUser]);

  const login = useCallback((user: CurrentUser & { token?: string }) => {
    if (user.token) {
      localStorage.setItem("auth_token", user.token);
    }
    const { token: _t, ...userData } = user as any;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
    setCurrentUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("auth_token");
    setCurrentUser(null);
    qc.clear();
    router.replace("/login");
  }, [qc, router]);

  const setCurrentUserId = useCallback(
    (id: string) => {
      if (!id) {
        logout();
        return;
      }
      const user = allUsers.find((u) => u.id === id);
      if (user) {
        login(user);
      }
    },
    [allUsers, login, logout],
  );

  const isAdmin = currentUser?.role === "admin";
  const isLoading = !initialized;

  const value = useMemo(
    () => ({ currentUser, setCurrentUserId, users: allUsers, isAdmin, isLoading, login, logout }),
    [currentUser, setCurrentUserId, allUsers, isAdmin, isLoading, login, logout],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

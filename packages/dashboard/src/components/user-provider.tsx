"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { UserContext, CurrentUser } from "@/hooks/use-current-user";

const DEMO_USERS: CurrentUser[] = [
  { id: "demo-admin",  email: "admin@perftest.io",  display_name: "Admin User",  role: "admin",  is_active: true },
  { id: "demo-editor", email: "editor@perftest.io", display_name: "Jane Editor", role: "editor", is_active: true },
  { id: "demo-viewer", email: "viewer@perftest.io", display_name: "Bob Viewer",  role: "viewer", is_active: true },
  { id: "demo-qa",     email: "qa@perftest.io",     display_name: "Alice QA",    role: "editor", is_active: true },
  { id: "demo-dev",    email: "dev@perftest.io",    display_name: "Charlie Dev", role: "viewer", is_active: true },
];

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const { data: apiUsers = [], isLoading } = useQuery<CurrentUser[]>({
    queryKey: ["users"],
    queryFn: () => api.rbac.users.list(),
    retry: 1,
  });

  // Fall back to demo users when API is unavailable
  const users = apiUsers.length > 0 ? apiUsers : DEMO_USERS;

  // Auto-select first user when the list arrives
  useEffect(() => {
    if (users.length > 0 && !currentUserId) {
      setCurrentUserId(users[0].id);
    }
  }, [users, currentUserId]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? null,
    [users, currentUserId],
  );

  const isAdmin = currentUser?.role === "admin";

  const value = useMemo(
    () => ({ currentUser, setCurrentUserId, users, isAdmin, isLoading }),
    [currentUser, users, isAdmin, isLoading],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

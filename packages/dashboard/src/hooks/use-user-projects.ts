"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUser } from "./use-current-user";

/**
 * Returns the set of project IDs the current user can access.
 * Admins can see all projects; regular users only see projects they are members of.
 */
export function useUserProjects() {
  const { currentUser, isAdmin } = useCurrentUser();

  const { data: allProjects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["user-memberships", currentUser?.id],
    queryFn: async () => {
      // Collect project membership for each project
      const results: string[] = [];
      for (const project of allProjects) {
        try {
          const members = await api.rbac.projectMembers.list(project.id);
          if (members.some((m: any) => m.user_id === currentUser?.id)) {
            results.push(project.id);
          }
        } catch {
          // If RBAC endpoint fails, skip
        }
      }
      return results;
    },
    enabled: !!currentUser && !isAdmin && allProjects.length > 0,
  });

  // Admin sees all project IDs; regular users only see their memberships
  const accessibleProjectIds: Set<string> = isAdmin
    ? new Set(allProjects.map((p: any) => p.id))
    : new Set(memberships);

  return { accessibleProjectIds, isAdmin, allProjects };
}

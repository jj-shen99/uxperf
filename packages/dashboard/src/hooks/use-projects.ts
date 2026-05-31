"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Shared hook: fetches the project list and auto-selects the first one.
 */
export function useProjects() {
  const [projectId, setProjectId] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });

  // Auto-select the first project once the list loads
  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  return { projects, projectId, setProjectId, isLoading };
}

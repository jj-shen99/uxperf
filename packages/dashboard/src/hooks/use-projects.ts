"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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

  return { projects, projectId, setProjectId, isLoading };
}

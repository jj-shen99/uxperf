"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, createContext, useContext } from "react";
import { api } from "@/lib/api";

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "editor" | "viewer";
  is_active: boolean;
}

interface UserContextValue {
  currentUser: CurrentUser | null;
  setCurrentUserId: (id: string) => void;
  users: CurrentUser[];
  isAdmin: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextValue>({
  currentUser: null,
  setCurrentUserId: () => {},
  users: [],
  isAdmin: false,
  isLoading: true,
});

export function useCurrentUser() {
  return useContext(UserContext);
}

export { UserContext };

"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

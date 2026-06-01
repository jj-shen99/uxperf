"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PenTool,
  Play,
  BarChart3,
  Lightbulb,
  FileText,
  Shield,
  Settings,
  Activity,
  GitCompare,
  AlertTriangle,
  FileSearch,
  ClipboardList,
  MessageSquare,
  Zap,
  Brain,
  Users,
  Sliders,
  BarChart2,
  BookOpen,
  LogOut,
  ClipboardCheck,
  HeartPulse,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: any }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: Activity },
      { href: "/results", label: "Results", icon: BarChart2 },
      { href: "/trends", label: "Trends", icon: BarChart3 },
      { href: "/reports", label: "Reports", icon: ClipboardList },
      { href: "/knowledge", label: "Knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Testing",
    items: [
      { href: "/runs", label: "Runs", icon: Play },
      { href: "/scripts", label: "Scripts", icon: PenTool },
      { href: "/author", label: "Author", icon: MessageSquare },
      { href: "/load", label: "Load Test", icon: Zap },
      { href: "/schedules", label: "Schedules", icon: Settings },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/gates", label: "Gates", icon: Shield },
      { href: "/budgets", label: "Budgets", icon: Sliders },
      { href: "/compare", label: "Compare", icon: GitCompare },
      { href: "/anomalies", label: "Anomalies", icon: AlertTriangle },
      { href: "/investigation", label: "Investigation", icon: FileSearch },
      { href: "/intelligence", label: "Intelligence", icon: Brain },
      { href: "/audit", label: "Audit", icon: ClipboardCheck },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/settings", label: "Settings", icon: Sliders },
      { href: "/platform-health", label: "Health", icon: HeartPulse },
    ],
  },
];

function UserSwitcher() {
  const { currentUser, setCurrentUserId, users, isAdmin, logout } = useCurrentUser();

  if (!currentUser) {
    return <p className="text-xs text-gray-600">Not signed in</p>;
  }

  return (
    <div className="space-y-1">
      {isAdmin && users.length > 1 && (
        <>
          <label className="block text-[10px] uppercase tracking-wider text-gray-600">Switch User</label>
          <select
            value={currentUser.id}
            onChange={(e) => setCurrentUserId(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-300"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name} ({u.role})
              </option>
            ))}
          </select>
        </>
      )}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-medium text-indigo-300">
          {currentUser.display_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-200">{currentUser.display_name}</p>
          <p className="truncate text-[10px] text-gray-500">{currentUser.email}</p>
        </div>
      </div>
      <p className="text-[10px] text-gray-600">
        Role: <span className={isAdmin ? "text-amber-400" : "text-gray-400"}>{currentUser.role}</span>
        {isAdmin && " — full access"}
      </p>
      <button
        onClick={logout}
        className="mt-1 flex w-full items-center gap-2 rounded-md border border-gray-700 px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
        Logout
      </button>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useCurrentUser();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-gray-800 bg-gray-900">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-800 px-4">
        <Activity className="h-5 w-5 text-indigo-400" />
        <span className="text-sm font-semibold tracking-tight">
          UI Perf Testing/Analysis
        </span>
      </div>
      <nav className="flex-1 min-h-0 overflow-y-auto p-2 space-y-4">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => {
            if (item.href === "/users" && !isAdmin) return false;
            return true;
          });
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-600">{group.label}</p>
              <div className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-indigo-500/10 text-indigo-400"
                          : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-gray-800 p-3">
        <UserSwitcher />
      </div>
    </aside>
  );
}

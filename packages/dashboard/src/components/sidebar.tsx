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
  ClipboardList,
  MessageSquare,
  Zap,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/runs", label: "Runs", icon: Play },
  { href: "/scripts", label: "Scripts", icon: PenTool },
  { href: "/trends", label: "Trends", icon: BarChart3 },
  { href: "/gates", label: "Gates", icon: Shield },
  { href: "/compare", label: "Compare", icon: GitCompare },
  { href: "/anomalies", label: "Anomalies", icon: AlertTriangle },
  { href: "/reports", label: "Reports", icon: ClipboardList },
  { href: "/author", label: "Author", icon: MessageSquare },
  { href: "/load", label: "Load Test", icon: Zap },
  { href: "/schedules", label: "Schedules", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r border-gray-800 bg-gray-900">
      <div className="flex h-14 items-center gap-2 border-b border-gray-800 px-4">
        <Activity className="h-5 w-5 text-indigo-400" />
        <span className="text-sm font-semibold tracking-tight">
          Perf Framework
        </span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
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
      </nav>
      <div className="border-t border-gray-800 p-3 text-xs text-gray-500">
        Phase 3 — Intelligence
      </div>
    </aside>
  );
}

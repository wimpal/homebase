"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Home, Settings, LogOut } from "lucide-react";
import { MODULE_ICONS, type ModuleNavItem } from "@/core/modules/registry";

interface SidebarProps {
  modules: ModuleNavItem[];
  householdName: string;
}

export function Sidebar({ modules, householdName }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const links = [
    { href: "/dashboard", name: t("dashboard"), icon: Home },
    ...modules.map((m) => ({
      href: m.href,
      name: m.name,
      icon: MODULE_ICONS[m.id],
    })),
    { href: "/settings", name: t("settings"), icon: Settings },
  ];

  return (
    <aside className="flex w-64 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
        <h1 className="text-xl font-bold text-emerald-700">{t("home")}</h1>
        <p className="text-sm text-zinc-500">{householdName}</p>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </button>
        </form>
      </div>
    </aside>
  );
}

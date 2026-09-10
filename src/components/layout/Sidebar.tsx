"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Home, Settings, LogOut, Menu, X } from "lucide-react";
import { MODULE_ICONS, type ModuleNavItem } from "@/core/modules/registry";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  modules: ModuleNavItem[];
  householdName: string;
}

function NavLinks({
  modules,
  householdName,
  onNavigate,
}: {
  modules: ModuleNavItem[];
  householdName: string;
  onNavigate?: () => void;
}) {
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
    <>
      <div className="border-b border-zinc-200 p-6 dark:border-zinc-800">
        <h1 className="text-xl font-bold text-emerald-700">{t("home")}</h1>
        <p className="text-sm text-zinc-500">{householdName}</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {links.map((link) => {
          const Icon = link.icon;
          const active =
            pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
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
    </>
  );
}

export function Sidebar({ modules, householdName }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 md:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("openMenu")}
          onClick={() => setOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-emerald-700">
            {t("home")}
          </p>
          <p className="truncate text-xs text-zinc-500">{householdName}</p>
        </div>
      </div>

      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 md:flex">
        <NavLinks modules={modules} householdName={householdName} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t("closeMenu")}
            onClick={() => setOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-zinc-950">
            <div className="absolute right-3 top-3 z-10">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("closeMenu")}
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <NavLinks
              modules={modules}
              householdName={householdName}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}

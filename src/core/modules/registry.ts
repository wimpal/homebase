import { ModuleId } from "@prisma/client";
import {
  Box,
  Calendar,
  ChefHat,
  Dog,
  Flower2,
  Home,
  Lightbulb,
  MessageSquare,
  Package,
  Repeat,
  ShoppingCart,
  Wallet,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { moduleKey } from "@/i18n/config";

export interface ModuleDefinition {
  id: ModuleId;
  nameKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  href: string;
  defaultEnabled: boolean;
}

/** Serializable subset for passing from Server Components to client Sidebar */
export type ModuleNavItem = Pick<ModuleDefinition, "id" | "href"> & { name: string };

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: ModuleId.INVENTORY,
    nameKey: "inventory",
    descriptionKey: "inventory",
    icon: Box,
    href: "/inventory",
    defaultEnabled: true,
  },
  {
    id: ModuleId.SHOPPING,
    nameKey: "shopping",
    descriptionKey: "shopping",
    icon: ShoppingCart,
    href: "/shopping",
    defaultEnabled: true,
  },
  {
    id: ModuleId.TASKS,
    nameKey: "tasks",
    descriptionKey: "tasks",
    icon: Wrench,
    href: "/tasks",
    defaultEnabled: true,
  },
  {
    id: ModuleId.PLANTS,
    nameKey: "plants",
    descriptionKey: "plants",
    icon: Flower2,
    href: "/plants",
    defaultEnabled: false,
  },
  {
    id: ModuleId.PETS,
    nameKey: "pets",
    descriptionKey: "pets",
    icon: Dog,
    href: "/pets",
    defaultEnabled: false,
  },
  {
    id: ModuleId.CALENDAR,
    nameKey: "calendar",
    descriptionKey: "calendar",
    icon: Calendar,
    href: "/calendar",
    defaultEnabled: true,
  },
  {
    id: ModuleId.ROUTINES,
    nameKey: "routines",
    descriptionKey: "routines",
    icon: Repeat,
    href: "/routines",
    defaultEnabled: true,
  },
  {
    id: ModuleId.RECIPES,
    nameKey: "recipes",
    descriptionKey: "recipes",
    icon: ChefHat,
    href: "/recipes",
    defaultEnabled: true,
  },
  {
    id: ModuleId.BUDGET,
    nameKey: "budget",
    descriptionKey: "budget",
    icon: Wallet,
    href: "/budget",
    defaultEnabled: true,
  },
  {
    id: ModuleId.DELIVERY,
    nameKey: "delivery",
    descriptionKey: "delivery",
    icon: Package,
    href: "/delivery",
    defaultEnabled: true,
  },
  {
    id: ModuleId.SMART_HOME,
    nameKey: "smart_home",
    descriptionKey: "smart_home",
    icon: Lightbulb,
    href: "/smart-home",
    defaultEnabled: false,
  },
  {
    id: ModuleId.MESSAGING,
    nameKey: "messaging",
    descriptionKey: "messaging",
    icon: MessageSquare,
    href: "/messages",
    defaultEnabled: true,
  },
];

export const MODULE_ICONS = Object.fromEntries(
  MODULE_REGISTRY.map((m) => [m.id, m.icon])
) as Record<ModuleId, LucideIcon>;

export const DASHBOARD_MODULE: ModuleDefinition = {
  id: ModuleId.INVENTORY,
  nameKey: "home",
  descriptionKey: "home",
  icon: Home,
  href: "/dashboard",
  defaultEnabled: true,
};

export function getModuleById(id: ModuleId) {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

export function getModuleByHref(href: string) {
  return MODULE_REGISTRY.find((m) => href.startsWith(m.href));
}

export const ALL_MODULE_IDS = MODULE_REGISTRY.map((m) => m.id);

export { moduleKey };

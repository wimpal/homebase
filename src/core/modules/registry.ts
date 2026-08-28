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

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
  defaultEnabled: boolean;
}

/** Serializable subset for passing from Server Components to client Sidebar */
export type ModuleNavItem = Pick<ModuleDefinition, "id" | "name" | "href">;

export const MODULE_REGISTRY: ModuleDefinition[] = [
  {
    id: ModuleId.INVENTORY,
    name: "Inventory",
    description: "Track household products and stock levels",
    icon: Box,
    href: "/inventory",
    defaultEnabled: true,
  },
  {
    id: ModuleId.SHOPPING,
    name: "Shopping",
    description: "Smart shopping lists and store filtering",
    icon: ShoppingCart,
    href: "/shopping",
    defaultEnabled: true,
  },
  {
    id: ModuleId.TASKS,
    name: "Tasks",
    description: "Chores, projects, and to-do lists",
    icon: Wrench,
    href: "/tasks",
    defaultEnabled: true,
  },
  {
    id: ModuleId.PLANTS,
    name: "Plants",
    description: "Plant care and watering schedules",
    icon: Flower2,
    href: "/plants",
    defaultEnabled: false,
  },
  {
    id: ModuleId.PETS,
    name: "Pets",
    description: "Pet info, appointments, and feeding",
    icon: Dog,
    href: "/pets",
    defaultEnabled: false,
  },
  {
    id: ModuleId.CALENDAR,
    name: "Calendar",
    description: "Household events and scheduling",
    icon: Calendar,
    href: "/calendar",
    defaultEnabled: true,
  },
  {
    id: ModuleId.ROUTINES,
    name: "Routines",
    description: "Shared routines with gamification",
    icon: Repeat,
    href: "/routines",
    defaultEnabled: true,
  },
  {
    id: ModuleId.RECIPES,
    name: "Recipes",
    description: "Recipes linked to inventory",
    icon: ChefHat,
    href: "/recipes",
    defaultEnabled: true,
  },
  {
    id: ModuleId.BUDGET,
    name: "Budget",
    description: "Budget tracking and expenses",
    icon: Wallet,
    href: "/budget",
    defaultEnabled: true,
  },
  {
    id: ModuleId.DELIVERY,
    name: "Delivery",
    description: "Package tracking and alerts",
    icon: Package,
    href: "/delivery",
    defaultEnabled: true,
  },
  {
    id: ModuleId.SMART_HOME,
    name: "Smart Home",
    description: "Sensors, Hue lights, and cameras",
    icon: Lightbulb,
    href: "/smart-home",
    defaultEnabled: false,
  },
  {
    id: ModuleId.MESSAGING,
    name: "Messages",
    description: "Household group messaging",
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
  name: "Home",
  description: "Dashboard",
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

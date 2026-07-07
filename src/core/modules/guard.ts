import { ModuleId } from "@prisma/client";
import { redirect } from "next/navigation";
import { isModuleEnabled } from "./settings";

export async function requireModule(householdId: string, moduleId: ModuleId) {
  const enabled = await isModuleEnabled(householdId, moduleId);
  if (!enabled) {
    redirect("/dashboard");
  }
}

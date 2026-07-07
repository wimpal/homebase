import { getChores, getProjects } from "@/modules/tasks/actions";
import { TasksClient } from "./TasksClient";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function TasksPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.TASKS);
  const [chores, projects] = await Promise.all([getChores(), getProjects()]);
  return <TasksClient chores={chores} projects={projects} />;
}

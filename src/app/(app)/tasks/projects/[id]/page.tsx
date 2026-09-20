import { notFound } from "next/navigation";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { getProject } from "@/modules/tasks/actions";
import { ProjectDetailClient } from "../ProjectDetailClient";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.TASKS);

  let project;
  try {
    project = await getProject(id);
  } catch {
    notFound();
  }

  return <ProjectDetailClient project={project} />;
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { EmptyState } from "@/components/ui/empty-state";
import { useFormError } from "@/components/ui/form-error-context";
import {
  createProject,
  deleteProject,
  updateProjectStatus,
} from "@/modules/tasks/actions";
import { projectDetailPath } from "@/domain/tasks/projectConstants";

export type ProjectListItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  workItems: { id: string; status: string }[];
  _count: { files: number; visionPins: number; updates: number };
};

export function ProjectsList({ projects }: { projects: ProjectListItem[] }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const router = useRouter();
  const { handleActionResult } = useFormError();
  const [filter, setFilter] = useState<"open" | "done">("open");

  const visible = useMemo(() => {
    return projects.filter((p) =>
      filter === "done" ? p.status === "done" : p.status !== "done",
    );
  }, [projects, filter]);

  async function handleCreateProject(formData: FormData) {
    const result = await createProject(formData);
    if (handleActionResult(result, "createProject")) return;
    router.refresh();
  }

  async function handleUpdateStatus(formData: FormData) {
    const result = await updateProjectStatus(formData);
    if (handleActionResult(result, "updateProjectStatus")) return;
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={filter === "open" ? "default" : "outline"}
          onClick={() => setFilter("open")}
        >
          {t("filterOpen")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "done" ? "default" : "outline"}
          onClick={() => setFilter("done")}
        >
          {t("filterDone")}
        </Button>
      </div>

      <CollapsibleCreate
        openLabel={t("newProject")}
        cancelLabel={tc("cancelAdd")}
        defaultOpen={projects.length === 0}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("newProject")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreateProject} className="space-y-3">
              <div>
                <Label>{tc("title")}</Label>
                <Input name="title" required />
              </div>
              <div>
                <Label>{tc("description")}</Label>
                <Textarea name="description" />
              </div>
              <div>
                <Label>{t("workItemsOnePerLine")}</Label>
                <Textarea name="workItems" placeholder={t("workItemsPlaceholder")} />
              </div>
              <Button type="submit">{t("createProject")}</Button>
            </form>
          </CardContent>
        </Card>
      </CollapsibleCreate>

      {visible.length === 0 ? (
        <EmptyState message={t("noProjects")} />
      ) : (
        visible.map((project) => {
          const done = project.workItems.filter((w) => w.status === "done").length;
          const total = project.workItems.length;
          return (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Link
                      href={projectDetailPath(project.id)}
                      className="text-base font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {project.title}
                    </Link>
                    <p className="text-sm text-zinc-500">
                      {t("workItemsComplete", { done, total })} · {t(`status_${project.status}` as "status_active")}
                    </p>
                    {project.description && (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <ConfirmFormAction
                    action={deleteProject}
                    actionName="deleteProject"
                    message={t("confirmDeleteProject")}
                    onSuccess={() => router.refresh()}
                  >
                    <input type="hidden" name="id" value={project.id} />
                    <Button type="submit" variant="destructive" size="sm">
                      {tc("delete")}
                    </Button>
                  </ConfirmFormAction>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <form action={handleUpdateStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={project.id} />
                  <select
                    name="status"
                    defaultValue={project.status}
                    className="h-8 rounded-md border border-zinc-300 bg-transparent px-2 text-sm dark:border-zinc-700"
                  >
                    <option value="active">{t("status_active")}</option>
                    <option value="paused">{t("status_paused")}</option>
                    <option value="done">{t("status_done")}</option>
                  </select>
                  <Button type="submit" size="sm" variant="outline">
                    {t("updateStatus")}
                  </Button>
                </form>
                <Button asChild size="sm" variant="secondary">
                  <Link href={projectDetailPath(project.id)}>{t("openProject")}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmForm } from "@/components/ui/confirm-form";
import {
  addProjectUpdate,
  deleteProject,
  updateProjectMeta,
  updateProjectStatus,
} from "@/modules/tasks/actions";
import { ProjectKanban, type WorkItem } from "./ProjectKanban";
import { ProjectFiles, type ProjectFileRow } from "./ProjectFiles";
import { ProjectVisionBoard, type VisionPin } from "./ProjectVisionBoard";

export type ProjectDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  workItems: WorkItem[];
  files: ProjectFileRow[];
  visionPins: VisionPin[];
  updates: {
    id: string;
    comment: string;
    photoUrl: string | null;
    createdAt: Date | string;
    user: { id: string; name: string | null } | null;
  }[];
};

export function ProjectDetailClient({ project }: { project: ProjectDetail }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const router = useRouter();
  const updateFormRef = useRef<HTMLFormElement>(null);
  const [updates, setUpdates] = useState(project.updates);

  useEffect(() => {
    setUpdates(project.updates);
  }, [project.updates]);

  async function handleAddUpdate(formData: FormData) {
    const created = await addProjectUpdate(formData);
    setUpdates((prev) => [created, ...prev]);
    updateFormRef.current?.reset();
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 px-0">
            <Link href="/tasks">{t("backToProjects")}</Link>
          </Button>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          {project.description && (
            <p className="text-zinc-500">{project.description}</p>
          )}
        </div>
        <ConfirmForm action={deleteProject} message={t("confirmDeleteProject")}>
          <input type="hidden" name="id" value={project.id} />
          <Button type="submit" variant="destructive" size="sm">
            {tc("delete")}
          </Button>
        </ConfirmForm>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tc("edit")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={updateProjectMeta} className="space-y-3">
            <input type="hidden" name="id" value={project.id} />
            <div>
              <Label>{tc("title")}</Label>
              <Input name="title" defaultValue={project.title} required />
            </div>
            <div>
              <Label>{tc("description")}</Label>
              <Textarea name="description" defaultValue={project.description ?? ""} />
            </div>
            <Button type="submit" size="sm">
              {tc("save")}
            </Button>
          </form>
          <form action={updateProjectStatus} className="flex flex-wrap items-center gap-2">
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
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("sectionWork")}</h2>
        <ProjectKanban projectId={project.id} initialItems={project.workItems} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("sectionFiles")}</h2>
        <ProjectFiles projectId={project.id} files={project.files} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("sectionVision")}</h2>
        <ProjectVisionBoard projectId={project.id} initialPins={project.visionPins} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("sectionActivity")}</h2>
        <form
          ref={updateFormRef}
          action={handleAddUpdate}
          className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <input type="hidden" name="projectId" value={project.id} />
          <Textarea name="comment" placeholder={t("progressUpdate")} required />
          <Input name="photo" type="file" accept="image/*" />
          <Button type="submit" size="sm">
            {t("addUpdate")}
          </Button>
        </form>
        {updates.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("noActivity")}</p>
        ) : (
          <ul className="space-y-2">
            {updates.map((u) => (
              <li
                key={u.id}
                className="rounded bg-zinc-50 p-2 text-sm dark:bg-zinc-900"
              >
                <p>{u.comment}</p>
                {u.user?.name && (
                  <p className="mt-1 text-xs text-zinc-500">{u.user.name}</p>
                )}
                {u.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.photoUrl}
                    alt=""
                    className="mt-2 max-h-32 rounded"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createChoreWithState,
  completeChoreWithState,
  createProject,
  toggleProjectStep,
  addProjectUpdate,
  type ChoreFormState,
} from "@/modules/tasks/actions";
import type { ChoreHistoryItem } from "@/domain/tasks";
import { Timer } from "lucide-react";

interface Chore {
  id: string;
  title: string;
  description: string | null;
  intervalDays: number | null;
  nextDue: Date | null;
  deadline: Date | null;
  completions: { durationMin: number | null }[];
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  steps: { id: string; title: string; completed: boolean }[];
  updates: { comment: string; photoUrl: string | null; user: { name: string | null } | null }[];
}

const initialFormState: ChoreFormState = {};

export function TasksClient({
  chores,
  projects,
  history,
}: {
  chores: Chore[];
  projects: Project[];
  history: ChoreHistoryItem[];
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [timerChore, setTimerChore] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<Record<string, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [createState, createAction, createPending] = useActionState(
    createChoreWithState,
    initialFormState,
  );
  const [completeState, completeAction, completePending] = useActionState(
    completeChoreWithState,
    initialFormState,
  );

  function formatDateTime(iso: string | null) {
    if (!iso) return tc("emDash");
    return format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });
  }

  function startTimer(choreId: string) {
    if (intervalId) clearInterval(intervalId);
    const startedAt = new Date().toISOString();
    setTimerChore(choreId);
    setTimerStartedAt((prev) => ({ ...prev, [choreId]: startedAt }));
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    setIntervalId(id);
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
    setTimerChore(null);
  }

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const formError = createState.error ?? completeState.error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      {formError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {formError}
        </p>
      )}

      <Tabs defaultValue="chores">
        <TabsList>
          <TabsTrigger value="chores">{t("chores")}</TabsTrigger>
          <TabsTrigger value="history">{t("history")}</TabsTrigger>
          <TabsTrigger value="projects">{t("projects")}</TabsTrigger>
        </TabsList>

        <TabsContent value="chores" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("addChore")}</CardTitle></CardHeader>
            <CardContent>
              <form action={createAction} className="grid gap-3 md:grid-cols-2">
                <div><Label>{tc("title")}</Label><Input name="title" required /></div>
                <div><Label>{t("intervalDays")}</Label><Input name="intervalDays" type="number" /></div>
                <div><Label>{t("deadline")}</Label><Input name="deadline" type="datetime-local" /></div>
                <div className="md:col-span-2"><Label>{tc("description")}</Label><Textarea name="description" /></div>
                <Button type="submit" disabled={createPending}>{t("addChoreBtn")}</Button>
              </form>
            </CardContent>
          </Card>

          {chores.length === 0 && (
            <p className="text-sm text-zinc-500">{t("noActiveChores")}</p>
          )}

          {chores.map((chore) => {
            const avg = chore.completions.filter((c) => c.durationMin).length > 0
              ? Math.round(
                  chore.completions
                    .filter((c) => c.durationMin)
                    .reduce((s, c) => s + (c.durationMin || 0), 0) /
                    chore.completions.filter((c) => c.durationMin).length,
                )
              : null;

            const dueDate = chore.nextDue ?? chore.deadline;
            const dueLabel = dueDate
              ? format.dateTime(new Date(dueDate), { dateStyle: "medium" })
              : null;

            return (
              <Card key={chore.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{chore.title}</p>
                    {dueLabel && (
                      <p className="text-sm text-zinc-500">
                        {chore.intervalDays ? tc("next") : tc("due")}: {dueLabel}
                      </p>
                    )}
                    {avg && <p className="text-xs text-zinc-400">{t("avg", { minutes: avg })}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {timerChore === chore.id ? (
                      <>
                        <span className="flex items-center gap-1 text-sm font-mono">
                          <Timer className="h-4 w-4" />
                          {formatTime(elapsed)}
                        </span>
                        <form
                          action={completeAction}
                          onSubmit={stopTimer}
                        >
                          <input type="hidden" name="choreId" value={chore.id} />
                          <input type="hidden" name="durationMin" value={Math.ceil(elapsed / 60)} />
                          {timerStartedAt[chore.id] && (
                            <input type="hidden" name="startedAt" value={timerStartedAt[chore.id]} />
                          )}
                          <Button type="submit" size="sm" disabled={completePending}>
                            {tc("complete")}
                          </Button>
                        </form>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => startTimer(chore.id)}>
                          {t("startTimer")}
                        </Button>
                        <form action={completeAction}>
                          <input type="hidden" name="choreId" value={chore.id} />
                          <Button type="submit" size="sm" disabled={completePending}>
                            {tc("complete")}
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("noHistory")}</p>
          ) : (
            history.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="space-y-1 p-4">
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-sm text-zinc-500">
                    {tc("completed")}: {formatDateTime(entry.completed_at)}
                  </p>
                  {entry.started_at && (
                    <p className="text-sm text-zinc-500">
                      {tc("started")}: {formatDateTime(entry.started_at)}
                    </p>
                  )}
                  {entry.duration_min != null && (
                    <p className="text-xs text-zinc-400">{entry.duration_min} {tc("min")}</p>
                  )}
                  {entry.completed_by && (
                    <p className="text-xs text-zinc-400">{tc("by")} {entry.completed_by}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("newProject")}</CardTitle></CardHeader>
            <CardContent>
              <form action={createProject} className="space-y-3">
                <div><Label>{tc("title")}</Label><Input name="title" required /></div>
                <div><Label>{tc("description")}</Label><Textarea name="description" /></div>
                <div><Label>{t("stepsOnePerLine")}</Label><Textarea name="steps" placeholder={t("stepsPlaceholder")} /></div>
                <Button type="submit">{t("createProject")}</Button>
              </form>
            </CardContent>
          </Card>

          {projects.map((project) => {
            const done = project.steps.filter((s) => s.completed).length;
            const total = project.steps.length;
            return (
              <Card key={project.id}>
                <CardHeader>
                  <CardTitle className="text-base">{project.title}</CardTitle>
                  <p className="text-sm text-zinc-500">{t("stepsComplete", { done, total })}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {project.steps.map((step) => (
                    <form key={step.id} action={toggleProjectStep} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={step.id} />
                      <input type="hidden" name="completed" value={(!step.completed).toString()} />
                      <button type="submit"><Checkbox checked={step.completed} /></button>
                      <span className={step.completed ? "line-through" : ""}>{step.title}</span>
                    </form>
                  ))}
                  <form action={addProjectUpdate} className="space-y-2 border-t pt-3">
                    <input type="hidden" name="projectId" value={project.id} />
                    <Textarea name="comment" placeholder={t("progressUpdate")} required />
                    <Input name="photo" type="file" accept="image/*" />
                    <Button type="submit" size="sm">{t("addUpdate")}</Button>
                  </form>
                  {project.updates.map((u, i) => (
                    <div key={i} className="rounded bg-zinc-50 p-2 text-sm dark:bg-zinc-900">
                      <p>{u.comment}</p>
                      {u.photoUrl && <img src={u.photoUrl} alt="" className="mt-2 max-h-32 rounded" />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { useFormError } from "@/components/ui/form-error-context";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createChore,
  completeChore,
  deleteChore,
} from "@/modules/tasks/actions";
import type { ChoreHistoryItem } from "@/domain/tasks";
import { Timer } from "lucide-react";
import { ProjectsList, type ProjectListItem } from "./ProjectsList";

interface Chore {
  id: string;
  title: string;
  description: string | null;
  intervalDays: number | null;
  nextDue: Date | null;
  deadline: Date | null;
  completions: { durationMin: number | null }[];
}

export function TasksClient({
  chores,
  projects,
  history,
}: {
  chores: Chore[];
  projects: ProjectListItem[];
  history: ChoreHistoryItem[];
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [timerChore, setTimerChore] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<Record<string, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [createPending, startCreateTransition] = useTransition();
  const [completePending, startCompleteTransition] = useTransition();
  const { handleActionResult } = useFormError();

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

  function onCreateChore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startCreateTransition(async () => {
      const result = await createChore(fd);
      if (handleActionResult(result, "createChore")) return;
      form.reset();
    });
  }

  function onCompleteChore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startCompleteTransition(async () => {
      const result = await completeChore(fd);
      handleActionResult(result, "completeChore");
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="chores">
        <TabsList>
          <TabsTrigger value="chores">{t("chores")}</TabsTrigger>
          <TabsTrigger value="history">{t("history")}</TabsTrigger>
          <TabsTrigger value="projects">{t("projects")}</TabsTrigger>
        </TabsList>

        <TabsContent value="chores" className="space-y-4">
          <CollapsibleCreate
            openLabel={t("addChore")}
            cancelLabel={tc("cancelAdd")}
            defaultOpen={chores.length === 0}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("addChore")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={onCreateChore} className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>{tc("title")}</Label>
                    <Input name="title" required />
                  </div>
                  <div>
                    <Label>{t("intervalDays")}</Label>
                    <Input name="intervalDays" type="number" />
                  </div>
                  <div>
                    <Label>{t("deadline")}</Label>
                    <Input name="deadline" type="datetime-local" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>{tc("description")}</Label>
                    <Textarea name="description" />
                  </div>
                  <Button type="submit" disabled={createPending}>
                    {t("addChoreBtn")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </CollapsibleCreate>

          {chores.length === 0 && (
            <EmptyState message={t("noActiveChores")} />
          )}

          {chores.map((chore) => {
            const avg =
              chore.completions.filter((c) => c.durationMin).length > 0
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
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{chore.title}</p>
                    {dueLabel && (
                      <p className="text-sm text-zinc-500">
                        {chore.intervalDays ? tc("next") : tc("due")}: {dueLabel}
                      </p>
                    )}
                    {avg && (
                      <p className="text-xs text-zinc-400">
                        {t("avg", { minutes: avg })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {timerChore === chore.id ? (
                      <>
                        <span className="flex items-center gap-1 font-mono text-sm">
                          <Timer className="h-4 w-4" />
                          {formatTime(elapsed)}
                        </span>
                        <form
                          onSubmit={(e) => {
                            stopTimer();
                            onCompleteChore(e);
                          }}
                        >
                          <input type="hidden" name="choreId" value={chore.id} />
                          <input
                            type="hidden"
                            name="durationMin"
                            value={Math.ceil(elapsed / 60)}
                          />
                          {timerStartedAt[chore.id] && (
                            <input
                              type="hidden"
                              name="startedAt"
                              value={timerStartedAt[chore.id]}
                            />
                          )}
                          <Button type="submit" size="sm" disabled={completePending}>
                            {tc("complete")}
                          </Button>
                        </form>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startTimer(chore.id)}
                        >
                          {t("startTimer")}
                        </Button>
                        <form onSubmit={onCompleteChore}>
                          <input type="hidden" name="choreId" value={chore.id} />
                          <Button type="submit" size="sm" disabled={completePending}>
                            {tc("complete")}
                          </Button>
                        </form>
                      </>
                    )}
                    <ConfirmFormAction
                      action={deleteChore}
                      actionName="deleteChore"
                      message={t("confirmDeleteChore")}
                    >
                      <input type="hidden" name="id" value={chore.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        {tc("delete")}
                      </Button>
                    </ConfirmFormAction>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {history.length === 0 ? (
            <EmptyState message={t("noHistory")} />
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
                    <p className="text-xs text-zinc-400">
                      {entry.duration_min} {tc("min")}
                    </p>
                  )}
                  {entry.completed_by && (
                    <p className="text-xs text-zinc-400">
                      {tc("by")} {entry.completed_by}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <ProjectsList projects={projects} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

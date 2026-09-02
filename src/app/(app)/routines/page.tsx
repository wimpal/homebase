import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getRoutines,
  createRoutine,
  addRoutineTask,
  completeRoutineTask,
  getRoutineTemplates,
  createRoutineFromTemplate,
  getUserGamification,
} from "@/modules/scheduling/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Trophy, Star } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function RoutinesPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.ROUTINES);
  const [routines, templates, gamification] = await Promise.all([
    getRoutines(),
    getRoutineTemplates(),
    getUserGamification(),
  ]);
  const t = await getTranslations("routines");
  const tc = await getTranslations("common");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-zinc-500">{t("subtitle")}</p>
        </div>
        {gamification.points && (
          <div className="flex items-center gap-4 rounded-lg bg-emerald-50 px-4 py-2 dark:bg-emerald-950">
            <div className="flex items-center gap-1">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="font-bold">{gamification.points.points}</span> {tc("pts")}
            </div>
            <div className="text-sm text-zinc-500">{t("dayStreak", { count: gamification.points.streak })}</div>
          </div>
        )}
      </div>

      {gamification.badges.length > 0 && (
        <div className="flex gap-2">
          {gamification.badges.map((ub) => (
            <span key={ub.id} className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs dark:bg-amber-900">
              <Star className="h-3 w-3" /> {ub.badge.name}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("createRoutine")}</CardTitle></CardHeader>
          <CardContent>
            <form action={createRoutine} className="space-y-3">
              <div><Label>{tc("name")}</Label><Input name="name" required /></div>
              <div><Label>{tc("description")}</Label><Textarea name="description" /></div>
              <Button type="submit">{tc("create")}</Button>
            </form>
          </CardContent>
        </Card>

        {templates.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">{t("fromTemplate")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {templates.map((tmpl) => (
                <form key={tmpl.id} action={createRoutineFromTemplate} className="flex items-center justify-between">
                  <input type="hidden" name="templateId" value={tmpl.id} />
                  <span className="text-sm">{t("tasksCount", { name: tmpl.name, count: tmpl.tasks.length })}</span>
                  <Button type="submit" size="sm" variant="outline">{tc("use")}</Button>
                </form>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {routines.map((routine) => (
        <Card key={routine.id}>
          <CardHeader>
            <CardTitle className="text-base">{routine.name}</CardTitle>
            <p className="text-sm text-zinc-500">
              {routine.members.map((m) => m.user.name).join(", ")}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <form action={addRoutineTask} className="flex flex-wrap gap-2 border-b pb-3">
              <input type="hidden" name="routineId" value={routine.id} />
              <Input name="title" placeholder={t("taskTitle")} className="w-40" required />
              <select name="recurrence" className="h-10 rounded-md border px-2 text-sm">
                <option value="daily">{t("daily")}</option>
                <option value="weekly">{t("weekly")}</option>
                <option value="monthly">{t("monthly")}</option>
              </select>
              <Input name="points" type="number" defaultValue="10" className="w-16" />
              <select name="dependsOnTaskId" className="h-10 rounded-md border px-2 text-sm">
                <option value="">{t("noDependency")}</option>
                {routine.tasks.map((task) => (
                  <option key={task.id} value={task.id}>{t("after", { title: task.title })}</option>
                ))}
              </select>
              <Button type="submit" size="sm">{t("addTask")}</Button>
            </form>

            {routine.tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-zinc-500">{task.recurrence} · {task.points} {tc("pts")}</p>
                  {task.dependsOn.length > 0 && (
                    <p className="text-xs text-amber-600">
                      {t("dependsOn", { titles: task.dependsOn.map((d) => d.dependsOnTask.title).join(", ") })}
                    </p>
                  )}
                </div>
                <form action={completeRoutineTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <Button type="submit" size="sm">{tc("complete")}</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

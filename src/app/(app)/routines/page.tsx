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

export default async function RoutinesPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.ROUTINES);
  const [routines, templates, gamification] = await Promise.all([
    getRoutines(),
    getRoutineTemplates(),
    getUserGamification(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Routines</h1>
          <p className="text-zinc-500">Shared routines with gamification</p>
        </div>
        {gamification.points && (
          <div className="flex items-center gap-4 rounded-lg bg-emerald-50 px-4 py-2 dark:bg-emerald-950">
            <div className="flex items-center gap-1">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="font-bold">{gamification.points.points}</span> pts
            </div>
            <div className="text-sm text-zinc-500">{gamification.points.streak} day streak</div>
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
          <CardHeader><CardTitle className="text-base">Create Routine</CardTitle></CardHeader>
          <CardContent>
            <form action={createRoutine} className="space-y-3">
              <div><Label>Name</Label><Input name="name" required /></div>
              <div><Label>Description</Label><Textarea name="description" /></div>
              <Button type="submit">Create</Button>
            </form>
          </CardContent>
        </Card>

        {templates.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">From Template</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {templates.map((t) => (
                <form key={t.id} action={createRoutineFromTemplate} className="flex items-center justify-between">
                  <input type="hidden" name="templateId" value={t.id} />
                  <span className="text-sm">{t.name} ({t.tasks.length} tasks)</span>
                  <Button type="submit" size="sm" variant="outline">Use</Button>
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
              <Input name="title" placeholder="Task title" className="w-40" required />
              <select name="recurrence" className="h-10 rounded-md border px-2 text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <Input name="points" type="number" defaultValue="10" className="w-16" />
              <select name="dependsOnTaskId" className="h-10 rounded-md border px-2 text-sm">
                <option value="">No dependency</option>
                {routine.tasks.map((t) => (
                  <option key={t.id} value={t.id}>After: {t.title}</option>
                ))}
              </select>
              <Button type="submit" size="sm">Add Task</Button>
            </form>

            {routine.tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-zinc-500">{task.recurrence} · {task.points} pts</p>
                  {task.dependsOn.length > 0 && (
                    <p className="text-xs text-amber-600">
                      Depends on: {task.dependsOn.map((d) => d.dependsOnTask.title).join(", ")}
                    </p>
                  )}
                </div>
                <form action={completeRoutineTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <Button type="submit" size="sm">Complete</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

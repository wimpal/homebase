"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { createChore, completeChore, createProject, toggleProjectStep, addProjectUpdate } from "@/modules/tasks/actions";
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

export function TasksClient({ chores, projects }: { chores: Chore[]; projects: Project[] }) {
  const [timerChore, setTimerChore] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);

  function startTimer(choreId: string) {
    if (intervalId) clearInterval(intervalId);
    setTimerChore(choreId);
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    setIntervalId(id);
  }

  function stopTimer() {
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-zinc-500">Chores and home projects</p>
      </div>

      <Tabs defaultValue="chores">
        <TabsList>
          <TabsTrigger value="chores">Chores</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="chores" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Chore</CardTitle></CardHeader>
            <CardContent>
              <form action={createChore} className="grid gap-3 md:grid-cols-2">
                <div><Label>Title</Label><Input name="title" required /></div>
                <div><Label>Interval (days)</Label><Input name="intervalDays" type="number" /></div>
                <div><Label>Deadline</Label><Input name="deadline" type="datetime-local" /></div>
                <div className="md:col-span-2"><Label>Description</Label><Textarea name="description" /></div>
                <Button type="submit">Add Chore</Button>
              </form>
            </CardContent>
          </Card>

          {chores.map((chore) => {
            const avg = chore.completions.filter((c) => c.durationMin).length > 0
              ? Math.round(chore.completions.filter((c) => c.durationMin).reduce((s, c) => s + (c.durationMin || 0), 0) / chore.completions.filter((c) => c.durationMin).length)
              : null;

            return (
              <Card key={chore.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{chore.title}</p>
                    {chore.nextDue && <p className="text-sm text-zinc-500">Next: {new Date(chore.nextDue).toLocaleDateString()}</p>}
                    {avg && <p className="text-xs text-zinc-400">Avg: {avg} min</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {timerChore === chore.id ? (
                      <>
                        <span className="flex items-center gap-1 text-sm font-mono"><Timer className="h-4 w-4" />{formatTime(elapsed)}</span>
                        <form action={completeChore} onSubmit={stopTimer}>
                          <input type="hidden" name="choreId" value={chore.id} />
                          <input type="hidden" name="durationMin" value={Math.ceil(elapsed / 60)} />
                          <Button type="submit" size="sm">Complete</Button>
                        </form>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={() => startTimer(chore.id)}>Start Timer</Button>
                        <form action={completeChore}>
                          <input type="hidden" name="choreId" value={chore.id} />
                          <Button type="submit" size="sm">Complete</Button>
                        </form>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">New Project</CardTitle></CardHeader>
            <CardContent>
              <form action={createProject} className="space-y-3">
                <div><Label>Title</Label><Input name="title" required /></div>
                <div><Label>Description</Label><Textarea name="description" /></div>
                <div><Label>Steps (one per line)</Label><Textarea name="steps" placeholder="Buy paint&#10;Prep walls&#10;Paint" /></div>
                <Button type="submit">Create Project</Button>
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
                  <p className="text-sm text-zinc-500">{done}/{total} steps complete</p>
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
                    <Textarea name="comment" placeholder="Progress update..." required />
                    <Input name="photo" type="file" accept="image/*" />
                    <Button type="submit" size="sm">Add Update</Button>
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

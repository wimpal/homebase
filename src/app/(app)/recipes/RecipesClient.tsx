"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createRecipe, addLeftover } from "@/modules/recipes/actions";
import { Timer } from "lucide-react";

interface Recipe {
  id: string;
  title: string;
  instructions: string;
  servings: number;
  ingredients: { name: string; quantity: string; product: { name: string } | null }[];
  timers: { id: string; label: string; minutes: number }[];
  leftovers: { name: string; servings: number; frozenAt: Date }[];
}

export function RecipesClient({ recipes }: { recipes: Recipe[] }) {
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});

  function startTimer(id: string, minutes: number) {
    setActiveTimers((prev) => ({ ...prev, [id]: minutes * 60 }));
    const interval = setInterval(() => {
      setActiveTimers((prev) => {
        const remaining = (prev[id] ?? 0) - 1;
        if (remaining <= 0) {
          clearInterval(interval);
          const next = { ...prev };
          delete next[id];
          return next;
        }
        return { ...prev, [id]: remaining };
      });
    }, 1000);
  }

  const formatTimer = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recipes</h1>
        <p className="text-zinc-500">Recipes linked to inventory with timers</p>
      </div>

      <Tabs defaultValue="recipes">
        <TabsList>
          <TabsTrigger value="recipes">Recipes</TabsTrigger>
          <TabsTrigger value="leftovers">Frozen Leftovers</TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Add Recipe</CardTitle></CardHeader>
            <CardContent>
              <form action={createRecipe} className="space-y-3">
                <div><Label>Title</Label><Input name="title" required /></div>
                <div><Label>Servings</Label><Input name="servings" type="number" defaultValue="4" /></div>
                <div><Label>Ingredients (name|quantity per line)</Label><Textarea name="ingredients" placeholder="Flour|2 cups&#10;Eggs|3" /></div>
                <div><Label>Timers (label|minutes per line)</Label><Textarea name="timers" placeholder="Bake|30&#10;Rest|10" /></div>
                <div><Label>Instructions</Label><Textarea name="instructions" rows={5} required /></div>
                <Button type="submit">Save Recipe</Button>
              </form>
            </CardContent>
          </Card>

          {recipes.map((recipe) => (
            <Card key={recipe.id}>
              <CardHeader><CardTitle className="text-base">{recipe.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Ingredients</p>
                  <ul className="text-sm text-zinc-600">
                    {recipe.ingredients.map((ing, i) => (
                      <li key={i}>{ing.quantity} {ing.name} {ing.product && `(in stock: ${ing.product.name})`}</li>
                    ))}
                  </ul>
                </div>
                {recipe.timers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {recipe.timers.map((t) => (
                      <Button
                        key={t.id}
                        variant="outline"
                        size="sm"
                        onClick={() => startTimer(t.id, t.minutes)}
                        disabled={!!activeTimers[t.id]}
                      >
                        <Timer className="mr-1 h-3 w-3" />
                        {t.label} ({activeTimers[t.id] != null ? formatTimer(activeTimers[t.id]) : `${t.minutes}m`})
                      </Button>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Instructions</p>
                  <p className="whitespace-pre-wrap text-sm text-zinc-600">{recipe.instructions}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="leftovers">
          <Card>
            <CardHeader><CardTitle className="text-base">Track Leftover</CardTitle></CardHeader>
            <CardContent>
              <form action={addLeftover} className="grid gap-3 md:grid-cols-2">
                <div><Label>Name</Label><Input name="name" required /></div>
                <div><Label>Servings</Label><Input name="servings" type="number" defaultValue="1" /></div>
                <div><Label>Expires</Label><Input name="expiresAt" type="date" /></div>
                <div>
                  <Label>Recipe</Label>
                  <select name="recipeId" className="flex h-10 w-full rounded-md border px-3 text-sm">
                    <option value="">None</option>
                    {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                </div>
                <Button type="submit">Add Leftover</Button>
              </form>
            </CardContent>
          </Card>

          {recipes.flatMap((r) => r.leftovers).length === 0 ? (
            <p className="text-sm text-zinc-500">No frozen leftovers tracked.</p>
          ) : (
            recipes.flatMap((r) =>
              r.leftovers.map((l) => (
                <Card key={l.name + l.frozenAt.toString()}>
                  <CardContent className="p-4">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-sm text-zinc-500">{l.servings} servings · Frozen {new Date(l.frozenAt).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              ))
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPlants, createPlant, waterPlant } from "@/modules/homecare/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Droplets } from "lucide-react";

export default async function PlantsPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.PLANTS);
  const plants = await getPlants();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plants</h1>
        <p className="text-zinc-500">Watering schedules and progress photos</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add Plant</CardTitle></CardHeader>
        <CardContent>
          <form action={createPlant} className="grid gap-3 md:grid-cols-2">
            <div><Label>Name</Label><Input name="name" required /></div>
            <div><Label>Species</Label><Input name="species" /></div>
            <div><Label>Water every (days)</Label><Input name="wateringDays" type="number" defaultValue="7" /></div>
            <div className="md:col-span-2"><Label>Notes</Label><Textarea name="notes" /></div>
            <Button type="submit">Add Plant</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {plants.map((plant) => (
          <Card key={plant.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Droplets className="h-4 w-4 text-blue-500" />
                {plant.name}
              </CardTitle>
              {plant.species && <p className="text-sm text-zinc-500">{plant.species}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                Next watering: {plant.nextWatering ? new Date(plant.nextWatering).toLocaleDateString() : "Soon"}
              </p>
              <form action={waterPlant} className="space-y-2">
                <input type="hidden" name="plantId" value={plant.id} />
                <Input name="photo" type="file" accept="image/*" />
                <Textarea name="notes" placeholder="Watering notes..." />
                <Button type="submit" size="sm">Mark Watered</Button>
              </form>
              {plant.logs.map((log) => (
                <div key={log.id} className="rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                  {log.photoUrl && <img src={log.photoUrl} alt="" className="mb-2 max-h-24 rounded" />}
                  {log.notes && <p>{log.notes}</p>}
                  <p className="text-zinc-400">{new Date(log.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

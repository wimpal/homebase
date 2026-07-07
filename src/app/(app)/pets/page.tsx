import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPets, createPet, addPetAppointment, addFeedingRoutine, getPetStats } from "@/modules/homecare/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";

export default async function PetsPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.PETS);
  const pets = await getPets();
  const stats = await Promise.all(pets.map((p) => getPetStats(p.id)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pets</h1>
        <p className="text-zinc-500">Pet care, appointments, and feeding</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add Pet</CardTitle></CardHeader>
        <CardContent>
          <form action={createPet} className="grid gap-3 md:grid-cols-2">
            <div><Label>Name</Label><Input name="name" required /></div>
            <div><Label>Species</Label><Input name="species" /></div>
            <div><Label>Breed</Label><Input name="breed" /></div>
            <div><Label>Birth date</Label><Input name="birthDate" type="date" /></div>
            <div className="md:col-span-2"><Label>Notes</Label><Textarea name="notes" /></div>
            <Button type="submit">Add Pet</Button>
          </form>
        </CardContent>
      </Card>

      {pets.map((pet, i) => (
        <Card key={pet.id}>
          <CardHeader>
            <CardTitle className="text-base">{pet.name}</CardTitle>
            <p className="text-sm text-zinc-500">
              {[pet.species, pet.breed].filter(Boolean).join(" · ")}
              {stats[i]?.age != null && ` · ${stats[i].age} years old`}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                <p className="font-bold">{stats[i]?.feedingRoutines}</p>
                <p className="text-zinc-500">Feeding routines</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                <p className="font-bold">{stats[i]?.upcomingAppointments}</p>
                <p className="text-zinc-500">Upcoming</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                <p className="font-bold">{stats[i]?.totalAppointments}</p>
                <p className="text-zinc-500">Total visits</p>
              </div>
            </div>

            <form action={addFeedingRoutine} className="flex flex-wrap gap-2">
              <input type="hidden" name="petId" value={pet.id} />
              <Input name="name" placeholder="Meal name" className="w-32" required />
              <Input name="timeOfDay" placeholder="08:00" className="w-24" required />
              <Input name="amount" placeholder="1 cup" className="w-24" />
              <Button type="submit" size="sm">Add Feeding</Button>
            </form>

            <form action={addPetAppointment} className="flex flex-wrap gap-2">
              <input type="hidden" name="petId" value={pet.id} />
              <Input name="title" placeholder="Vet checkup" className="w-40" required />
              <Input name="date" type="datetime-local" className="w-48" required />
              <Input name="location" placeholder="Location" className="w-32" />
              <Button type="submit" size="sm">Add Appointment</Button>
            </form>

            {pet.feedingRoutines.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Feeding</p>
                {pet.feedingRoutines.map((r) => (
                  <p key={r.id} className="text-sm text-zinc-600">{r.name} at {r.timeOfDay} {r.amount && `(${r.amount})`}</p>
                ))}
              </div>
            )}

            {pet.appointments.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Appointments</p>
                {pet.appointments.map((a) => (
                  <p key={a.id} className="text-sm text-zinc-600">
                    {a.title} - {new Date(a.date).toLocaleString()}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

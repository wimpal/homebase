import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPets, createPet, addPetAppointment, addFeedingRoutine, getPetStats } from "@/modules/homecare/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";

export default async function PetsPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.PETS);
  const pets = await getPets();
  const stats = await Promise.all(pets.map((p) => getPetStats(p.id)));
  const t = await getTranslations("pets");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("addPet")}</CardTitle></CardHeader>
        <CardContent>
          <form action={createPet} className="grid gap-3 md:grid-cols-2">
            <div><Label>{tc("name")}</Label><Input name="name" required /></div>
            <div><Label>{t("species")}</Label><Input name="species" /></div>
            <div><Label>{t("breed")}</Label><Input name="breed" /></div>
            <div><Label>{t("birthDate")}</Label><Input name="birthDate" type="date" /></div>
            <div className="md:col-span-2"><Label>{tc("notes")}</Label><Textarea name="notes" /></div>
            <Button type="submit">{t("addPetBtn")}</Button>
          </form>
        </CardContent>
      </Card>

      {pets.map((pet, i) => (
        <Card key={pet.id}>
          <CardHeader>
            <CardTitle className="text-base">{pet.name}</CardTitle>
            <p className="text-sm text-zinc-500">
              {[pet.species, pet.breed].filter(Boolean).join(" · ")}
              {stats[i]?.age != null && ` · ${tc("yearsOld", { age: stats[i].age! })}`}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                <p className="font-bold">{stats[i]?.feedingRoutines}</p>
                <p className="text-zinc-500">{t("feedingRoutines")}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                <p className="font-bold">{stats[i]?.upcomingAppointments}</p>
                <p className="text-zinc-500">{t("upcoming")}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900">
                <p className="font-bold">{stats[i]?.totalAppointments}</p>
                <p className="text-zinc-500">{t("totalVisits")}</p>
              </div>
            </div>

            <form action={addFeedingRoutine} className="flex flex-wrap gap-2">
              <input type="hidden" name="petId" value={pet.id} />
              <Input name="name" placeholder={t("mealName")} className="w-32" required />
              <Input name="timeOfDay" placeholder="08:00" className="w-24" required />
              <Input name="amount" placeholder={t("amountPlaceholder")} className="w-24" />
              <Button type="submit" size="sm">{t("addFeeding")}</Button>
            </form>

            <form action={addPetAppointment} className="flex flex-wrap gap-2">
              <input type="hidden" name="petId" value={pet.id} />
              <Input name="title" placeholder={t("vetCheckup")} className="w-40" required />
              <Input name="date" type="datetime-local" className="w-48" required />
              <Input name="location" placeholder={tc("location")} className="w-32" />
              <Button type="submit" size="sm">{t("addAppointment")}</Button>
            </form>

            {pet.feedingRoutines.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">{t("feeding")}</p>
                {pet.feedingRoutines.map((r) => (
                  <p key={r.id} className="text-sm text-zinc-600">
                    {r.amount
                      ? t("atTime", { name: r.name, time: r.timeOfDay, amount: r.amount })
                      : t("atTimeNoAmount", { name: r.name, time: r.timeOfDay })}
                  </p>
                ))}
              </div>
            )}

            {pet.appointments.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">{t("appointments")}</p>
                {pet.appointments.map((a) => (
                  <p key={a.id} className="text-sm text-zinc-600">
                    {a.title} - {formatDateTime(a.date, bcp47)}
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

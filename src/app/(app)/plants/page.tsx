import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getPlants, createPlant, waterPlant, deletePlant } from "@/modules/homecare/actions";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { Droplets } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";

export default async function PlantsPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.PLANTS);
  const plants = await getPlants();
  const t = await getTranslations("plants");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <CollapsibleCreate
        openLabel={t("addPlant")}
        cancelLabel={tc("cancelAdd")}
        defaultOpen={plants.length === 0}
      >
        <Card>
          <CardHeader><CardTitle className="text-base">{t("addPlant")}</CardTitle></CardHeader>
          <CardContent>
            <form action={createPlant} className="grid gap-3 md:grid-cols-2">
              <div><Label>{tc("name")}</Label><Input name="name" required /></div>
              <div><Label>{t("species")}</Label><Input name="species" /></div>
              <div><Label>{t("waterEveryDays")}</Label><Input name="wateringDays" type="number" defaultValue="7" /></div>
              <div className="md:col-span-2"><Label>{tc("notes")}</Label><Textarea name="notes" /></div>
              <Button type="submit">{t("addPlantBtn")}</Button>
            </form>
          </CardContent>
        </Card>
      </CollapsibleCreate>

      {plants.length === 0 ? (
        <EmptyState message={t("noPlants")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plants.map((plant) => (
            <Card key={plant.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      {plant.name}
                    </CardTitle>
                    {plant.species && <p className="text-sm text-zinc-500">{plant.species}</p>}
                  </div>
                  <ConfirmForm action={deletePlant} message={t("confirmDelete")}>
                    <input type="hidden" name="id" value={plant.id} />
                    <Button type="submit" variant="destructive" size="sm">{tc("delete")}</Button>
                  </ConfirmForm>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  {t("nextWatering", {
                    date: plant.nextWatering
                      ? formatDate(plant.nextWatering, bcp47, { dateStyle: "medium" })
                      : tc("soon"),
                  })}
                </p>
                <form action={waterPlant} className="space-y-2">
                  <input type="hidden" name="plantId" value={plant.id} />
                  <Input name="photo" type="file" accept="image/*" />
                  <Textarea name="notes" placeholder={t("wateringNotes")} />
                  <Button type="submit" size="sm">{t("markWatered")}</Button>
                </form>
                {plant.logs.map((log) => (
                  <div key={log.id} className="rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
                    {log.photoUrl && <img src={log.photoUrl} alt="" className="mb-2 max-h-24 rounded" />}
                    {log.notes && <p>{log.notes}</p>}
                    <p className="text-zinc-400">{formatDate(log.createdAt, bcp47, { dateStyle: "medium" })}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

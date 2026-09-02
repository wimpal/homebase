import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MODULE_REGISTRY } from "@/core/modules/registry";
import { getEnabledModules, toggleModule } from "@/core/modules/settings";
import { requireAdmin, requireHousehold } from "@/core/auth/session";
import { getVisitorPreferences, saveVisitorPreference } from "@/modules/social/actions";
import { ModuleId } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { PushNotificationSetup } from "./PushNotificationSetup";
import { LanguageToggle } from "@/components/settings/LanguageToggle";
import { isLocale } from "@/i18n/config";

async function handleToggleModule(formData: FormData) {
  "use server";
  const { householdId } = await requireAdmin();
  const moduleId = formData.get("moduleId") as ModuleId;
  const enabled = formData.get("enabled") === "true";
  await toggleModule(householdId, moduleId, enabled);
  revalidatePath("/settings");
}

export default async function SettingsPage() {
  const { householdId, household, role } = await requireHousehold();
  const enabledModules = await getEnabledModules(householdId);
  const enabledIds = new Set(enabledModules.map((m) => m.id));
  const visitorPrefs = await getVisitorPreferences();
  const t = await getTranslations("settings");
  const tm = await getTranslations("modules");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "en";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{household.name} · {role}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("language.title")}</CardTitle>
          <CardDescription>{t("language.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageToggle currentLocale={locale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("modules.title")}</CardTitle>
          <CardDescription>{t("modules.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {MODULE_REGISTRY.map((mod) => {
            const enabled = enabledIds.has(mod.id);
            const Icon = mod.icon;
            return (
              <div key={mod.id} className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="font-medium">{tm(`${mod.nameKey}.name`)}</p>
                    <p className="text-sm text-zinc-500">{tm(`${mod.descriptionKey}.description`)}</p>
                  </div>
                </div>
                <form action={handleToggleModule}>
                  <input type="hidden" name="moduleId" value={mod.id} />
                  <input type="hidden" name="enabled" value={(!enabled).toString()} />
                  <button type="submit">
                    <Switch checked={enabled} />
                  </button>
                </form>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <PushNotificationSetup />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("visitor.title")}</CardTitle>
          <CardDescription>{t("visitor.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveVisitorPreference} className="space-y-3">
            <div><Label>{t("visitor.visitorName")}</Label><Input name="visitorName" required /></div>
            <div>
              <Label>{t("visitor.preferencesJson")}</Label>
              <Input name="preferences" defaultValue='{"tea": "Earl Grey, no milk"}' required />
            </div>
            <Button type="submit">{tc("save")}</Button>
          </form>
          {visitorPrefs.length > 0 && (
            <div className="mt-4 space-y-2">
              {visitorPrefs.map((vp) => (
                <div key={vp.id} className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                  <p className="font-medium">{vp.visitorName}</p>
                  <p className="text-zinc-500">{JSON.stringify(vp.preferences)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

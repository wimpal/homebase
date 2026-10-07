import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MODULE_REGISTRY } from "@/core/modules/registry";
import { getEnabledModules, toggleModule } from "@/core/modules/settings";
import { requireAdmin, requireHousehold } from "@/core/auth/session";
import {
  ALL_NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_MODULE,
  getNotificationTypeSettings,
} from "@/core/notifications/prefs";
import { getVisitorPreferences } from "@/modules/social/actions";
import { toggleNotificationTypeAction } from "@/modules/settings/actions";
import {
  getAccountProfile,
  getThemePreference,
  isDomainError,
  listMembers,
} from "@/domain/accounts";
import { ModuleId } from "@prisma/client";
import {
  SettingsAccountForm,
  SettingsMemberRow,
  SettingsVisitorPreferenceDelete,
  SettingsVisitorPreferenceForm,
} from "./SettingsForms";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { PushNotificationSetup } from "./PushNotificationSetup";
import { ImportClient } from "@/components/settings/ImportClient";
import { LanguageToggle } from "@/components/settings/LanguageToggle";
import { AppearanceToggle } from "@/components/settings/AppearanceToggle";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { NotificationTypeToggle } from "@/components/settings/NotificationTypeToggle";
import { listImportTargets } from "@/domain/import";
import { isLocale } from "@/i18n/config";

async function handleToggleModule(formData: FormData) {
  "use server";
  const { householdId } = await requireAdmin();
  const moduleId = formData.get("moduleId") as ModuleId;
  const enabled = formData.get("enabled") === "true";
  await toggleModule(householdId, moduleId, enabled);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { householdId, household, role, userId } = await requireHousehold();
  const isAdmin = role === "ADMIN";
  const enabledModules = await getEnabledModules(householdId);
  const enabledIds = new Set(enabledModules.map((m) => m.id));
  const visitorPrefs = await getVisitorPreferences();
  const notifSettings = await getNotificationTypeSettings(householdId);
  const profileResult = await getAccountProfile(userId);
  const profile = isDomainError(profileResult) ? null : profileResult;
  const themePreference = await getThemePreference(userId);
  const members = isAdmin ? await listMembers(householdId) : [];
  const t = await getTranslations("settings");
  const tm = await getTranslations("modules");
  const localeRaw = await getLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "en";
  const params = await searchParams;

  const birthdayDisplay = profile?.birthday
    ? (() => {
        const [y, m, d] = profile.birthday.split("-");
        return `${d}-${m}-${y}`;
      })()
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {household.name} · {role}
        </p>
      </div>

      {params.status === "account_saved" && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          {t("account.saved")}
        </p>
      )}
      {params.status === "member_password_reset" && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          {t("members.passwordResetDone")}
        </p>
      )}
      {params.status === "member_removed" && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          {t("members.removed")}
        </p>
      )}
      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("account.title")}</CardTitle>
            <CardDescription>{t("account.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsAccountForm
              profile={profile}
              birthdayDisplay={birthdayDisplay}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("appearance.title")}</CardTitle>
          <CardDescription>{t("appearance.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AppearanceToggle storedPreference={themePreference ?? "system"} />
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("members.title")}</CardTitle>
            <CardDescription>{t("members.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("members.empty")}</p>
            ) : (
              members.map((m) => (
                <SettingsMemberRow
                  key={m.membershipId}
                  member={m}
                  currentUserId={userId}
                />
              ))
            )}
          </CardContent>
        </Card>
      )}

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
          {!isAdmin && (
            <p className="text-sm text-muted-foreground">{t("modules.adminOnly")}</p>
          )}
          {MODULE_REGISTRY.map((mod) => {
            const enabled = enabledIds.has(mod.id);
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{tm(`${mod.nameKey}.name`)}</p>
                    <p className="text-sm text-muted-foreground">
                      {tm(`${mod.descriptionKey}.description`)}
                    </p>
                  </div>
                </div>
                {isAdmin ? (
                  <ModuleToggle
                    moduleId={mod.id}
                    enabled={enabled}
                    action={handleToggleModule}
                  />
                ) : (
                  <Switch checked={enabled} disabled />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notifications.title")}</CardTitle>
          <CardDescription>{t("notifications.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAdmin && (
            <p className="text-sm text-muted-foreground">
              {t("notifications.adminOnly")}
            </p>
          )}
          {ALL_NOTIFICATION_TYPES.filter((type) => {
            const owner = NOTIFICATION_TYPE_MODULE[type];
            return !owner || enabledIds.has(owner);
          }).map((type) => {
            const enabled = notifSettings[type];
            return (
              <div
                key={type}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">
                    {t(`notifications.types.${type}`)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(`notifications.typeHints.${type}`)}
                  </p>
                </div>
                {isAdmin ? (
                  <NotificationTypeToggle
                    type={type}
                    enabled={enabled}
                    action={toggleNotificationTypeAction}
                  />
                ) : (
                  <Switch checked={enabled} disabled />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <PushNotificationSetup />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("import.title")}</CardTitle>
          <CardDescription>{t("import.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!isAdmin ? (
            <p className="text-sm text-muted-foreground">{t("import.adminOnly")}</p>
          ) : (
            <ImportClient
              targets={listImportTargets().map((x) => ({
                id: x.id,
                enabled: x.enabled,
                disabledReason: x.disabledReason,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("visitor.title")}</CardTitle>
          <CardDescription>{t("visitor.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsVisitorPreferenceForm />
          {visitorPrefs.length > 0 && (
            <div className="mt-4 space-y-2">
              {visitorPrefs.map((vp) => (
                <div
                  key={vp.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-background p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{vp.visitorName}</p>
                    <p className="text-muted-foreground">
                      {JSON.stringify(vp.preferences)}
                    </p>
                  </div>
                  <SettingsVisitorPreferenceDelete id={vp.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Sidebar } from "@/components/layout/Sidebar";
import { getEnabledModules } from "@/core/modules/settings";
import { requireHousehold } from "@/core/auth/session";
import { getTranslations } from "next-intl/server";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { householdId, household } = await requireHousehold();
  const modules = await getEnabledModules(householdId);
  const t = await getTranslations("modules");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        modules={modules.map(({ id, href, nameKey }) => ({
          id,
          href,
          name: t(`${nameKey}.name`),
        }))}
        householdName={household.name}
      />
      <main className="min-w-0 flex-1 overflow-auto bg-zinc-50 p-4 dark:bg-zinc-900 md:p-6">
        {children}
      </main>
    </div>
  );
}

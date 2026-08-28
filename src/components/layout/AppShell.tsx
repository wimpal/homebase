import { Sidebar } from "@/components/layout/Sidebar";
import { getEnabledModules } from "@/core/modules/settings";
import { requireHousehold } from "@/core/auth/session";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const { householdId, household } = await requireHousehold();
  const modules = await getEnabledModules(householdId);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        modules={modules.map(({ id, name, href }) => ({ id, name, href }))}
        householdName={household.name}
      />
      <main className="flex-1 overflow-auto bg-zinc-50 p-6 dark:bg-zinc-900">
        {children}
      </main>
    </div>
  );
}

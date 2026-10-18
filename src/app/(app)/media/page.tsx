import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";

export default async function MediaPage() {
  const { householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.MEDIA);
  const t = await getTranslations("media");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <EmptyState title={t("remoteLaterTitle")} description={t("remoteLaterHint")} />
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { PageSkeleton } from "@/components/ui/page-skeleton";

export default async function AppLoading() {
  const t = await getTranslations("ui.loading");
  return <PageSkeleton label={t("label")} />;
}

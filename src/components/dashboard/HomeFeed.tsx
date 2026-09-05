import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { markNotificationRead } from "@/core/notifications/service";
import { Bell } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: Date;
}

export async function HomeFeed({ notifications }: { notifications: NotificationItem[] }) {
  const t = await getTranslations("dashboard");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  async function handleMarkRead(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    await markNotificationRead(id);
    revalidatePath("/dashboard");
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-5 w-5 text-emerald-600" />
          {t("homeFeed")}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          notifications.length === 0
            ? undefined
            : "min-h-0 max-h-80 flex-1 overflow-y-auto"
        }
      >
        {notifications.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("noNotifications")}</p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border p-3 text-sm ${n.read ? "opacity-60" : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {n.link ? (
                      <Link href={n.link} className="font-medium hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      <p className="font-medium">{n.title}</p>
                    )}
                    <p className="text-zinc-600 dark:text-zinc-400">{n.message}</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatDateTime(n.createdAt, bcp47)}
                    </p>
                  </div>
                  {!n.read && (
                    <form action={handleMarkRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="text-xs text-emerald-600 hover:underline">
                        {t("markRead")}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

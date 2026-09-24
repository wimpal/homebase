import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getMessages,
  sendMessage,
  getRequests,
  createRequest,
  updateRequestStatus,
} from "@/modules/social/actions";
import { getSupportRequests } from "@/modules/social/report-form-error";
import { requireHousehold } from "@/core/auth/session";
import { requireModule } from "@/core/modules/guard";
import { ModuleId } from "@prisma/client";
import { AlertTriangle, MessageSquare, ShoppingCart, Wrench } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/utils";
import { isLocale, localeToBcp47 } from "@/i18n/config";
import { MessagesClientActions } from "./MessagesClientActions";

export default async function MessagesPage() {
  const { role, householdId } = await requireHousehold();
  await requireModule(householdId, ModuleId.MESSAGING);
  const isAdmin = role === "ADMIN";
  const [messages, requests, supportReports] = await Promise.all([
    getMessages(),
    getRequests(),
    isAdmin ? getSupportRequests() : Promise.resolve([]),
  ]);
  const t = await getTranslations("messages");
  const tc = await getTranslations("common");
  const localeRaw = await getLocale();
  const bcp47 = localeToBcp47(isLocale(localeRaw) ? localeRaw : "en");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
      </div>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">{t("groupChat")}</TabsTrigger>
          <TabsTrigger value="requests">{t("requests")}</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="support">{t("supportReports")}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("sendMessage")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={sendMessage} className="flex gap-2">
                <Textarea
                  name="content"
                  placeholder={t("messagePlaceholder")}
                  required
                  className="flex-1"
                />
                <Button type="submit">{tc("send")}</Button>
              </form>
            </CardContent>
          </Card>

          {messages.length === 0 ? (
            <EmptyState message={t("noMessages")} />
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <Card key={msg.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium">{msg.user.name}</span>
                      <span className="text-xs text-zinc-400">
                        {formatDateTime(msg.createdAt, bcp47)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{msg.content}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("newRequest")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createRequest} className="space-y-3">
                <div>
                  <Label>{t("type")}</Label>
                  <select
                    name="type"
                    className="flex h-10 w-full rounded-md border px-3 text-sm"
                  >
                    <option value="GROCERY">{t("grocery")}</option>
                    <option value="TASK">{t("task")}</option>
                  </select>
                </div>
                <div>
                  <Label>{tc("title")}</Label>
                  <Input name="title" required />
                </div>
                <div>
                  <Label>{tc("description")}</Label>
                  <Textarea name="description" />
                </div>
                <Button type="submit">{t("submitRequest")}</Button>
              </form>
            </CardContent>
          </Card>

          {requests.length === 0 ? (
            <EmptyState message={t("noRequests")} />
          ) : (
            requests.map((req) => (
              <Card key={req.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="flex items-center gap-2 font-medium">
                      {req.type === "GROCERY" ? (
                        <ShoppingCart className="h-4 w-4" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      {req.title}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {t("byStatus", {
                        name: req.user.name ?? "",
                        status: req.status,
                      })}
                    </p>
                    {req.description && (
                      <p className="text-sm">{req.description}</p>
                    )}
                  </div>
                  {isAdmin && req.status === "PENDING" && (
                    <MessagesClientActions requestId={req.id} />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="support" className="space-y-4">
            {supportReports.length === 0 ? (
              <EmptyState message={t("noSupportReports")} />
            ) : (
              supportReports.map((req) => (
                <Card key={req.id}>
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        {req.title}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {t("byStatus", {
                          name: req.user.name ?? "",
                          status: req.status,
                        })}
                      </p>
                      {req.description ? (
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-zinc-100 p-2 font-mono text-xs dark:bg-zinc-800">
                          {req.description}
                        </pre>
                      ) : null}
                    </div>
                    {req.status === "PENDING" ? (
                      <MessagesClientActions requestId={req.id} />
                    ) : null}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

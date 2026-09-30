"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAction } from "@/components/ui/form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteHouseManualAction,
  setHouseManualSearchableAction,
  uploadHouseManualAction,
  type HouseManualListItem,
} from "@/modules/house-manual/actions";
import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";

export function HouseManualClient({
  docs,
  isAdmin,
}: {
  docs: HouseManualListItem[];
  isAdmin: boolean;
}) {
  const t = useTranslations("house_manual");
  const tc = useTranslations("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        {!isAdmin && (
          <p className="mt-1 text-sm text-muted-foreground">{t("adminOnly")}</p>
        )}
      </div>

      {isAdmin && (
        <CollapsibleCreate
          openLabel={t("upload")}
          cancelLabel={tc("cancelAdd")}
          defaultOpen={docs.length === 0}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("upload")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormAction
                action={uploadHouseManualAction}
                actionName="uploadHouseManual"
                className="grid gap-3"
              >
                <div className="grid gap-2">
                  <Label htmlFor="title">{t("titleLabel")}</Label>
                  <Input id="title" name="title" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="file">{t("fileLabel")}</Label>
                  <Input
                    id="file"
                    name="file"
                    type="file"
                    accept=".txt,.md,text/plain,text/markdown"
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t("pdfSkipped")}</p>
                </div>
                <div>
                  <Button type="submit">{t("uploadBtn")}</Button>
                </div>
              </FormAction>
            </CardContent>
          </Card>
        </CollapsibleCreate>
      )}

      {docs.length === 0 ? (
        <EmptyState message={t("noDocs")} />
      ) : (
        <div className="grid gap-4">
          {docs.map((doc) => (
            <Card key={doc.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookOpen className="h-4 w-4 text-primary" />
                      {doc.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {doc.originalName} · {doc.mimeType}
                      {doc.searchable ? ` · ${t("searchable")}` : ""}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <FormAction
                        action={setHouseManualSearchableAction}
                        actionName="setHouseManualSearchable"
                      >
                        <input type="hidden" name="id" value={doc.id} />
                        <input
                          type="hidden"
                          name="searchable"
                          value={doc.searchable ? "false" : "true"}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          {doc.searchable
                            ? t("makePrivate")
                            : t("makeSearchable")}
                        </Button>
                      </FormAction>
                      <ConfirmFormAction
                        action={deleteHouseManualAction}
                        actionName="deleteHouseManual"
                        message={t("confirmDelete")}
                      >
                        <input type="hidden" name="id" value={doc.id} />
                        <Button type="submit" variant="outline" size="sm">
                          {tc("delete")}
                        </Button>
                      </ConfirmFormAction>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <a
                  href={doc.url}
                  className="text-sm text-primary underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {doc.originalName}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

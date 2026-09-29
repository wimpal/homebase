"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCreate } from "@/components/ui/collapsible-create";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { EmptyState } from "@/components/ui/empty-state";
import { FormAction } from "@/components/ui/form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createNoteAction,
  deleteNoteAction,
  type NoteListItem,
} from "@/modules/notes/actions";
import { StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";

export function NotesClient({
  notes,
  canMutate,
}: {
  notes: NoteListItem[];
  canMutate: boolean;
}) {
  const t = useTranslations("notes");
  const tc = useTranslations("common");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-zinc-500">{t("subtitle")}</p>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/90">
          {t("notPasswordManager")}
        </p>
      </div>

      {canMutate && (
        <CollapsibleCreate
          openLabel={t("addNote")}
          cancelLabel={tc("cancelAdd")}
          defaultOpen={notes.length === 0}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("addNote")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormAction
                action={createNoteAction}
                actionName="createNote"
                className="grid gap-3"
              >
                <div>
                  <Label>{t("titleLabel")}</Label>
                  <Input name="title" maxLength={200} />
                </div>
                <div>
                  <Label>{t("bodyLabel")}</Label>
                  <Textarea name="body" required rows={4} maxLength={4000} />
                </div>
                <div>
                  <Button type="submit">{t("addNoteBtn")}</Button>
                </div>
              </FormAction>
            </CardContent>
          </Card>
        </CollapsibleCreate>
      )}

      {notes.length === 0 ? (
        <EmptyState message={t("noNotes")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <StickyNote className="h-4 w-4 shrink-0 text-emerald-600" />
                    {note.title?.trim() || t("untitled")}
                  </CardTitle>
                  {canMutate && (
                    <ConfirmFormAction
                      action={deleteNoteAction}
                      actionName="deleteNote"
                      message={t("confirmDelete")}
                    >
                      <input type="hidden" name="id" value={note.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        {tc("delete")}
                      </Button>
                    </ConfirmFormAction>
                  )}
                </div>
                <p className="text-xs text-zinc-500">
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
                  {note.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

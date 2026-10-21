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
import type { NoteListItem, NoteTypeWire } from "@/domain/notes";
import {
  createNoteAction,
  deleteNoteAction,
} from "@/modules/notes/actions";
import { cn } from "@/lib/utils";
import { Lightbulb, StickyNote } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type ActiveType = "all" | NoteTypeWire;

export function NotesClient({
  notes,
  canMutate,
  activeType,
}: {
  notes: NoteListItem[];
  canMutate: boolean;
  activeType: ActiveType;
}) {
  const t = useTranslations("notes");
  const tc = useTranslations("common");

  function typeLabel(type: NoteTypeWire) {
    return type === "feature_request" ? t("typeFeatureRequest") : t("typeNote");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/90">
          {t("notPasswordManager")}
        </p>
      </div>

      {canMutate && (
        <CollapsibleCreate
          openLabel={t("addNote")}
          cancelLabel={tc("cancelAdd")}
          defaultOpen={notes.length === 0 && activeType === "all"}
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
                <div className="grid gap-2">
                  <Label htmlFor="note-type">{t("typeLabel")}</Label>
                  <select
                    id="note-type"
                    name="type"
                    defaultValue="note"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="note">{t("typeNote")}</option>
                    <option value="feature_request">
                      {t("typeFeatureRequest")}
                    </option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label>{t("titleLabel")}</Label>
                  <Input name="title" maxLength={200} />
                </div>
                <div className="grid gap-2">
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("filterByType")}</span>
        {(
          [
            { href: "/notes", key: "all" as const, label: t("filterAll") },
            {
              href: "/notes?type=note",
              key: "note" as const,
              label: t("typeNote"),
            },
            {
              href: "/notes?type=feature_request",
              key: "feature_request" as const,
              label: t("typeFeatureRequest"),
            },
          ] as const
        ).map((item) => (
          <Button
            key={item.key}
            asChild
            size="sm"
            variant={activeType === item.key ? "default" : "outline"}
          >
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title={t("noNotes")}
          description={t("noNotesHint")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((note) => {
            const isFeature = note.type === "feature_request";
            const Icon = isFeature ? Lightbulb : StickyNote;
            return (
              <Card key={note.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isFeature
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-primary",
                        )}
                      />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-xs font-medium",
                        isFeature
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {typeLabel(note.type)}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {note.body}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

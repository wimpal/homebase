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
  createPersonAction,
  deletePersonAction,
  updatePersonAction,
  type PersonListItem,
} from "@/modules/people/actions";
import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function PeopleClient({
  people,
  canMutate,
}: {
  people: PersonListItem[];
  canMutate: boolean;
}) {
  const t = useTranslations("people");
  const tc = useTranslations("common");
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {canMutate && (
        <CollapsibleCreate
          openLabel={t("addPerson")}
          cancelLabel={tc("cancelAdd")}
          defaultOpen={people.length === 0}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("addPerson")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormAction
                action={createPersonAction}
                actionName="createPerson"
                className="grid gap-3 md:grid-cols-2"
              >
                <PersonFields />
                <div className="md:col-span-2">
                  <Button type="submit">{t("addPersonBtn")}</Button>
                </div>
              </FormAction>
            </CardContent>
          </Card>
        </CollapsibleCreate>
      )}

      {people.length === 0 ? (
        <EmptyState message={t("noPeople")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {people.map((person) => (
            <Card key={person.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="h-4 w-4 text-primary" />
                      {person.displayName}
                    </CardTitle>
                    {person.birthday && (
                      <p className="text-sm text-muted-foreground">
                        {t("birthdayLabel", { date: person.birthday })}
                      </p>
                    )}
                  </div>
                  {canMutate && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditingId(
                            editingId === person.id ? null : person.id,
                          )
                        }
                      >
                        {tc("edit")}
                      </Button>
                      <ConfirmFormAction
                        action={deletePersonAction}
                        actionName="deletePerson"
                        message={t("confirmDelete")}
                      >
                        <input type="hidden" name="id" value={person.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          {tc("delete")}
                        </Button>
                      </ConfirmFormAction>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <PersonDetails person={person} />

                {canMutate && editingId === person.id && (
                  <FormAction
                    action={updatePersonAction}
                    actionName="updatePerson"
                    onSuccess={() => setEditingId(null)}
                    className="grid gap-3 border-t border-border pt-3 md:grid-cols-2"
                  >
                    <input type="hidden" name="id" value={person.id} />
                    <PersonFields person={person} />
                    <div className="md:col-span-2">
                      <Button type="submit">{tc("save")}</Button>
                    </div>
                  </FormAction>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonDetails({ person }: { person: PersonListItem }) {
  const t = useTranslations("people");
  const rows: Array<{ label: string; value: string | null }> = [
    { label: t("phone"), value: person.phone },
    { label: t("email"), value: person.email },
    { label: t("address"), value: person.addressLine },
    { label: t("city"), value: person.city },
    { label: t("notes"), value: person.notes },
  ];

  const visible = rows.filter((r) => r.value);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noDetails")}</p>;
  }

  return (
    <dl className="space-y-1 text-sm">
      {visible.map((r) => (
        <div key={r.label} className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">{r.label}:</dt>
          <dd className="text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PersonFields({ person }: { person?: PersonListItem }) {
  const t = useTranslations("people");
  const tc = useTranslations("common");

  return (
    <>
      <div className="grid gap-2">
        <Label>{tc("name")}</Label>
        <Input name="name" required defaultValue={person?.name ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label>{t("familyName")}</Label>
        <Input name="familyName" defaultValue={person?.familyName ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label>{t("birthday")}</Label>
        <Input
          name="birthday"
          type="date"
          defaultValue={person?.birthdayInput ?? ""}
        />
      </div>
      <div className="grid gap-2">
        <Label>{t("phone")}</Label>
        <Input name="phone" type="tel" defaultValue={person?.phone ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label>{t("email")}</Label>
        <Input name="email" type="email" defaultValue={person?.email ?? ""} />
      </div>
      <div className="grid gap-2">
        <Label>{t("city")}</Label>
        <Input name="city" defaultValue={person?.city ?? ""} />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label>{t("address")}</Label>
        <Input name="addressLine" defaultValue={person?.addressLine ?? ""} />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <Label>{tc("notes")}</Label>
        <Textarea name="notes" defaultValue={person?.notes ?? ""} rows={2} />
      </div>
    </>
  );
}

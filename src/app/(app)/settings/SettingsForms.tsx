"use client";

import { Button } from "@/components/ui/button";
import { ConfirmFormAction } from "@/components/ui/confirm-form-action";
import { FormAction } from "@/components/ui/form-action";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminRemoveMemberAction,
  adminResetMemberPasswordAction,
  updateAccountAction,
} from "@/modules/accounts/actions";
import {
  deleteVisitorPreference,
  saveVisitorPreference,
} from "@/modules/social/actions";
import { useTranslations } from "next-intl";

type AccountProfile = {
  name: string | null;
  email: string;
  birthday: string | null;
};

export function SettingsAccountForm({
  profile,
  birthdayDisplay,
}: {
  profile: AccountProfile;
  birthdayDisplay: string | null;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <FormAction
      action={updateAccountAction}
      actionName="updateAccount"
      className="space-y-3"
      diagnosticsFromForm={(fd) => ({
        email: String(fd.get("email") ?? ""),
      })}
    >
      <div>
        <Label htmlFor="account-name">{t("account.displayName")}</Label>
        <Input
          id="account-name"
          name="name"
          defaultValue={profile.name ?? ""}
          required
        />
      </div>
      <div>
        <Label htmlFor="account-email">{tc("email")}</Label>
        <Input
          id="account-email"
          name="email"
          type="email"
          defaultValue={profile.email}
          required
        />
      </div>
      <div>
        <Label htmlFor="account-birthday">{t("account.birthday")}</Label>
        <Input
          id="account-birthday"
          name="birthday"
          type="date"
          defaultValue={profile.birthday ?? ""}
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("account.birthdayHint")}
          {birthdayDisplay ? ` · ${birthdayDisplay}` : ""}
        </p>
      </div>
      <div>
        <Label htmlFor="account-current-password">
          {t("account.currentPassword")}
        </Label>
        <Input
          id="account-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("account.currentPasswordHint")}
        </p>
      </div>
      <div>
        <Label htmlFor="account-new-password">{t("account.newPassword")}</Label>
        <Input
          id="account-new-password"
          name="newPassword"
          type="password"
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <Button type="submit">{tc("save")}</Button>
    </FormAction>
  );
}

type MemberRow = {
  userId: string;
  membershipId: string;
  name: string | null;
  email: string;
  role: string;
  isLastAdmin: boolean;
};

export function SettingsMemberRow({
  member,
  currentUserId,
}: {
  member: MemberRow;
  currentUserId: string;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const isSelf = member.userId === currentUserId;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{member.name || member.email}</p>
          <p className="text-sm text-zinc-500">
            {member.email} · {member.role}
            {isSelf ? ` · ${t("members.you")}` : ""}
          </p>
        </div>
        {!isSelf &&
          (member.isLastAdmin ? (
            <p className="text-xs text-zinc-500">
              {t("members.cannotRemoveLastAdmin")}
            </p>
          ) : (
            <ConfirmFormAction
              action={adminRemoveMemberAction}
              actionName="adminRemoveMember"
              message={t("members.confirmRemove")}
            >
              <input type="hidden" name="userId" value={member.userId} />
              <Button type="submit" variant="destructive" size="sm">
                {t("members.remove")}
              </Button>
            </ConfirmFormAction>
          ))}
      </div>
      {!isSelf && (
        <FormAction
          action={adminResetMemberPasswordAction}
          actionName="adminResetMemberPassword"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="userId" value={member.userId} />
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor={`reset-${member.userId}`}>
              {t("members.newPassword")}
            </Label>
            <Input
              id={`reset-${member.userId}`}
              name="newPassword"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            {t("members.resetPassword")}
          </Button>
        </FormAction>
      )}
    </div>
  );
}

export function SettingsVisitorPreferenceForm() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <FormAction
      action={saveVisitorPreference}
      actionName="saveVisitorPreference"
      className="space-y-3"
      diagnosticsFromForm={(fd) => ({
        visitorName: String(fd.get("visitorName") ?? ""),
      })}
    >
      <div>
        <Label>{t("visitor.visitorName")}</Label>
        <Input name="visitorName" required />
      </div>
      <div>
        <Label>{t("visitor.preferencesJson")}</Label>
        <Input
          name="preferences"
          defaultValue='{"tea": "Earl Grey, no milk"}'
          required
        />
      </div>
      <Button type="submit">{tc("save")}</Button>
    </FormAction>
  );
}

export function SettingsVisitorPreferenceDelete({
  id,
}: {
  id: string;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  return (
    <ConfirmFormAction
      action={deleteVisitorPreference}
      actionName="deleteVisitorPreference"
      message={t("visitor.confirmDelete")}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="destructive" size="sm">
        {tc("delete")}
      </Button>
    </ConfirmFormAction>
  );
}

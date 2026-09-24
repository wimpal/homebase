"use client";

import { useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { useFormError } from "@/components/ui/form-error-context";
import type { ActionResult } from "@/lib/action-result";

type NotificationTypeToggleProps = {
  type: string;
  enabled: boolean;
  action: (formData: FormData) => Promise<ActionResult>;
};

export function NotificationTypeToggle({
  type,
  enabled,
  action,
}: NotificationTypeToggleProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { handleActionResult } = useFormError();

  async function wrapped(formData: FormData) {
    const result = await action(formData);
    handleActionResult(result, "toggleNotificationType");
  }

  return (
    <form ref={formRef} action={wrapped}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="enabled" value={(!enabled).toString()} />
      <Switch
        checked={enabled}
        onCheckedChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

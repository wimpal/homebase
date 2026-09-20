"use client";

import { useRef } from "react";
import { Switch } from "@/components/ui/switch";

type NotificationTypeToggleProps = {
  type: string;
  enabled: boolean;
  action: (formData: FormData) => void | Promise<void>;
};

export function NotificationTypeToggle({
  type,
  enabled,
  action,
}: NotificationTypeToggleProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="enabled" value={(!enabled).toString()} />
      <Switch
        checked={enabled}
        onCheckedChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

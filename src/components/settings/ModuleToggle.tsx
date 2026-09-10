"use client";

import { useRef } from "react";
import { Switch } from "@/components/ui/switch";

type ModuleToggleProps = {
  moduleId: string;
  enabled: boolean;
  action: (formData: FormData) => void | Promise<void>;
};

export function ModuleToggle({ moduleId, enabled, action }: ModuleToggleProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="enabled" value={(!enabled).toString()} />
      <Switch
        checked={enabled}
        onCheckedChange={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

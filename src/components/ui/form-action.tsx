"use client";

import type { ReactNode } from "react";
import { useFormError } from "@/components/ui/form-error-context";
import type { ActionResult } from "@/lib/action-result";

type FormActionProps = {
  action: (formData: FormData) => Promise<ActionResult>;
  actionName: string;
  children: ReactNode;
  className?: string;
  diagnosticsFromForm?: (formData: FormData) => Record<string, string> | undefined;
  onSuccess?: () => void;
};

/** Native form wired to FormErrorProvider for ActionResult server actions. */
export function FormAction({
  action,
  actionName,
  children,
  className,
  diagnosticsFromForm,
  onSuccess,
}: FormActionProps) {
  const { handleActionResult } = useFormError();

  async function wrapped(formData: FormData): Promise<void> {
    const result = await action(formData);
    if (
      handleActionResult(
        result,
        actionName,
        diagnosticsFromForm?.(formData),
      )
    ) {
      return;
    }
    onSuccess?.();
  }

  return (
    <form action={wrapped} className={className}>
      {children}
    </form>
  );
}

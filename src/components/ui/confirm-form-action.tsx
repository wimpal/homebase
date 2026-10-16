"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { useFormError } from "@/components/ui/form-error-context";
import type { ActionResult } from "@/lib/action-result";

type ConfirmFormActionProps = {
  /** Server action that returns ActionResult (never throws for expected failures). */
  action: (formData: FormData) => Promise<ActionResult>;
  actionName: string;
  message: string;
  children: ReactNode;
  className?: string;
  diagnosticsFromForm?: (formData: FormData) => Record<string, string> | undefined;
  onSuccess?: () => void;
  /**
   * Re-fetch the current route after a successful action so changed server
   * data is visible without a manual page reload. Default true; pass false
   * when the form navigates away or the action redirects.
   */
  refreshOnSuccess?: boolean;
};

/**
 * ConfirmForm wired to FormErrorProvider - use for destructive mutations
 * that return ActionResult instead of throwing.
 */
export function ConfirmFormAction({
  action,
  actionName,
  message,
  children,
  className,
  diagnosticsFromForm,
  onSuccess,
  refreshOnSuccess = true,
}: ConfirmFormActionProps) {
  const router = useRouter();
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
    if (refreshOnSuccess) {
      router.refresh();
    }
  }

  return (
    <ConfirmForm
      action={wrapped}
      message={message}
      className={className}
      refreshOnSuccess={false}
    >
      {children}
    </ConfirmForm>
  );
}

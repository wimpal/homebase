"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useFormError } from "@/components/ui/form-error-context";
import type { ActionResult } from "@/lib/action-result";

type FormActionProps = {
  action: (formData: FormData) => Promise<ActionResult>;
  actionName: string;
  children: ReactNode;
  className?: string;
  diagnosticsFromForm?: (formData: FormData) => Record<string, string> | undefined;
  onSuccess?: () => void;
  /**
   * Re-fetch the current route after a successful action so changed server
   * data is visible without a manual page reload. Opt-in: default false.
   */
  refreshOnSuccess?: boolean;
  /** Clear the form fields after a successful action. */
  resetOnSuccess?: boolean;
  /** Return a confirm message to gate submit, or null to proceed. */
  confirmIf?: (formData: FormData) => string | null;
};

/** Native form wired to FormErrorProvider for ActionResult server actions. */
export function FormAction({
  action,
  actionName,
  children,
  className,
  diagnosticsFromForm,
  onSuccess,
  refreshOnSuccess = false,
  resetOnSuccess = false,
  confirmIf,
}: FormActionProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { handleActionResult } = useFormError();

  async function wrapped(formData: FormData): Promise<void> {
    const confirmMsg = confirmIf?.(formData);
    if (confirmMsg && !window.confirm(confirmMsg)) {
      return;
    }
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
    if (resetOnSuccess) {
      formRef.current?.reset();
    }
    if (refreshOnSuccess) {
      router.refresh();
    }
  }

  return (
    <form ref={formRef} action={wrapped} className={className}>
      {children}
    </form>
  );
}

"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

type ConfirmFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
  /**
   * Re-fetch the current route after the action resolves so changed server
   * data is visible without a manual page reload. Skipped if the action
   * throws. Default true; pass false when the form navigates away.
   */
  refreshOnSuccess?: boolean;
};

/** Form that asks for confirmation before submitting a destructive action. */
export function ConfirmForm({
  action,
  message,
  children,
  className,
  refreshOnSuccess = true,
}: ConfirmFormProps) {
  const router = useRouter();

  async function wrapped(formData: FormData): Promise<void> {
    await action(formData);
    if (refreshOnSuccess) {
      router.refresh();
    }
  }

  return (
    <form
      action={wrapped}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}

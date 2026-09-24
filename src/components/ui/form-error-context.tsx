"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ActionResult } from "@/lib/action-result";
import { ErrorDialog } from "@/components/ui/error-dialog";

export type FormErrorPayload = {
  reason?: string;
  message: string;
  actionName: string;
  /** Allowlisted field snippets only — never passwords/tokens/files. */
  diagnostics?: Record<string, string>;
};

type FormErrorContextValue = {
  showFormError: (payload: FormErrorPayload) => void;
  /** If result is ok:false, show dialog and return true (caller should stop). */
  handleActionResult: (
    result: ActionResult<unknown>,
    actionName: string,
    diagnostics?: Record<string, string>,
  ) => boolean;
};

const FormErrorContext = createContext<FormErrorContextValue | null>(null);

export function FormErrorProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<FormErrorPayload | null>(null);

  const showFormError = useCallback((payload: FormErrorPayload) => {
    setError(payload);
  }, []);

  const handleActionResult = useCallback(
    (
      result: ActionResult<unknown>,
      actionName: string,
      diagnostics?: Record<string, string>,
    ) => {
      if (result.ok) return false;
      setError({
        reason: result.reason,
        message: result.message,
        actionName,
        diagnostics,
      });
      return true;
    },
    [],
  );

  const value = useMemo(
    () => ({ showFormError, handleActionResult }),
    [showFormError, handleActionResult],
  );

  return (
    <FormErrorContext.Provider value={value}>
      {children}
      <ErrorDialog error={error} onClose={() => setError(null)} />
    </FormErrorContext.Provider>
  );
}

export function useFormError(): FormErrorContextValue {
  const ctx = useContext(FormErrorContext);
  if (!ctx) {
    throw new Error("useFormError must be used within FormErrorProvider");
  }
  return ctx;
}

"use client";

import { Button } from "@/components/ui/button";
import { useFormError } from "@/components/ui/form-error-context";
import { updateRequestStatus } from "@/modules/social/actions";
import { useTranslations } from "next-intl";

export function MessagesClientActions({ requestId }: { requestId: string }) {
  const tc = useTranslations("common");
  const { handleActionResult } = useFormError();

  async function approve(formData: FormData) {
    const result = await updateRequestStatus(formData);
    handleActionResult(result, "updateRequestStatus");
  }

  async function reject(formData: FormData) {
    const result = await updateRequestStatus(formData);
    handleActionResult(result, "updateRequestStatus");
  }

  return (
    <div className="flex gap-1">
      <form action={approve}>
        <input type="hidden" name="id" value={requestId} />
        <input type="hidden" name="status" value="APPROVED" />
        <Button type="submit" size="sm">
          {tc("approve")}
        </Button>
      </form>
      <form action={reject}>
        <input type="hidden" name="id" value={requestId} />
        <input type="hidden" name="status" value="REJECTED" />
        <Button type="submit" size="sm" variant="outline">
          {tc("reject")}
        </Button>
      </form>
    </div>
  );
}

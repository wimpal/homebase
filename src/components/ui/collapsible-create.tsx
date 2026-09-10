"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type CollapsibleCreateProps = {
  openLabel: string;
  cancelLabel: string;
  /** Open when the list is empty so first-run create is obvious. */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleCreate({
  openLabel,
  cancelLabel,
  defaultOpen = false,
  children,
}: CollapsibleCreateProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant={open ? "outline" : "default"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? cancelLabel : openLabel}
      </Button>
      {open ? children : null}
    </div>
  );
}

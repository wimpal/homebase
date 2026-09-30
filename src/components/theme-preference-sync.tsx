"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import type { ThemePreference } from "@/domain/accounts/theme-preference";

/** Re-apply the stored Account preference so the DB wins over stale localStorage. */
export function ThemePreferenceSync({
  preference,
}: {
  preference: ThemePreference;
}) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(preference);
  }, [preference, setTheme]);
  return null;
}

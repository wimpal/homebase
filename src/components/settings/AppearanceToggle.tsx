"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { FormAction } from "@/components/ui/form-action";
import { Button } from "@/components/ui/button";
import { setThemePreferenceAction } from "@/modules/settings/actions";
import {
  THEME_PREFERENCES,
  type ThemePreference,
} from "@/domain/accounts/theme-preference";

export function AppearanceToggle({
  storedPreference,
}: {
  storedPreference: ThemePreference;
}) {
  const t = useTranslations("settings");
  const { setTheme } = useTheme();
  const [current, setCurrent] = useState<ThemePreference>(storedPreference);

  return (
    <FormAction
      action={setThemePreferenceAction}
      actionName="setThemePreference"
    >
      <div role="group" aria-label={t("appearance.title")} className="flex gap-2">
        {THEME_PREFERENCES.map((value) => (
          <Button
            key={value}
            type="submit"
            name="theme"
            value={value}
            size="sm"
            variant={current === value ? "default" : "outline"}
            onClick={() => {
              setCurrent(value);
              setTheme(value);
            }}
          >
            {t(`appearance.${value}`)}
          </Button>
        ))}
      </div>
    </FormAction>
  );
}

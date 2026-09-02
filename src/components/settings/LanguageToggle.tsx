"use client";

import { cn } from "@/lib/utils";
import { LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";

interface LanguageToggleProps {
  currentLocale: Locale;
}

export function LanguageToggle({ currentLocale }: LanguageToggleProps) {
  function setLocale(locale: Locale) {
    if (locale === currentLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

  return (
    <div className="flex gap-2">
      {(["en", "nl"] as const).map((locale) => (
        <Button
          key={locale}
          type="button"
          variant={currentLocale === locale ? "default" : "outline"}
          size="sm"
          onClick={() => setLocale(locale)}
          className={cn(currentLocale === locale && "bg-emerald-600 hover:bg-emerald-700")}
        >
          {locale === "en" ? "English" : "Nederlands"}
        </Button>
      ))}
    </div>
  );
}

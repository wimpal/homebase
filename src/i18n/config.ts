export const locales = ["en", "nl"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "homebase.locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "nl";
}

export function localeToBcp47(locale: Locale): string {
  return locale === "nl" ? "nl-NL" : "en-US";
}

export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  if (acceptLanguage?.toLowerCase().includes("nl")) return "nl";
  return defaultLocale;
}

export function moduleKey(id: string): string {
  return id.toLowerCase();
}

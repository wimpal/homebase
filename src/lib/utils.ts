import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDateTime(
  date: Date | string | number,
  locale = "en-US",
  options?: Intl.DateTimeFormatOptions,
) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString(locale, options);
}

export function formatDate(
  date: Date | string | number,
  locale = "en-US",
  options?: Intl.DateTimeFormatOptions,
) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(locale, options);
}

export function getTodayInfo(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const weekOfYear = Math.ceil(dayOfYear / 7);
  const isLeap = (date.getFullYear() % 4 === 0 && date.getFullYear() % 100 !== 0) || date.getFullYear() % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const daysLeft = daysInYear - dayOfYear;
  const percentOfYear = Math.round((dayOfYear / daysInYear) * 100);

  return { dayOfYear, weekOfYear, daysLeft, percentOfYear, daysInYear };
}

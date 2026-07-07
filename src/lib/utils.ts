import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
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

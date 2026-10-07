import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { auth } from "@/core/auth/config";
import { getThemePreference } from "@/domain/accounts/theme";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ThemeColorMeta } from "@/components/theme-color-meta";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HomeBase",
  description: "Centralized home management platform",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HomeBase",
  },
};

export const viewport: Viewport = {
  // Single static default. ThemeColorMeta updates this at runtime from the
  // resolved Appearance (light -> #047857, dark -> #34d399).
  themeColor: "#047857",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const session = await auth();
  const userId = session?.user?.id;
  const themePreference = userId ? await getThemePreference(userId) : null;
  const storageKey = userId ? `homebase-theme:${userId}` : "homebase-theme";

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme={themePreference ?? "system"}
          enableSystem
          disableTransitionOnChange
          storageKey={storageKey}
        >
          <ThemePreferenceSync preference={themePreference ?? "system"} />
          <ServiceWorkerRegister />
          <ThemeColorMeta />
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
